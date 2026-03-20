import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "";
const LEGACY_TENANT_NAME = process.env.MT_LEGACY_COMPANY_NAME || "Legacy Company";
const APPLY = process.argv.includes("--apply");

function asId(value) {
  if (!value) return "";
  return String(value).trim();
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(asId(value));
}

function toObjectId(value) {
  const id = asId(value);
  return isObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

function normalizeMemberships(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const companyId = asId(item.companyId);
    if (!isObjectId(companyId)) continue;
    const status = String(item.status || "active").toLowerCase() === "inactive" ? "inactive" : "active";
    const tenantRole = asId(item.tenantRole) || "member";
    out.push({
      companyId: new mongoose.Types.ObjectId(companyId),
      tenantRole,
      status,
    });
  }
  return out;
}

async function ensureLegacyTenant(db) {
  const companies = db.collection("companies");
  const existing = await companies.findOne({ name: LEGACY_TENANT_NAME }, { projection: { _id: 1, name: 1 } });
  if (existing?._id) return existing._id;

  const id = new mongoose.Types.ObjectId();
  if (APPLY) {
    await companies.insertOne({ _id: id, name: LEGACY_TENANT_NAME, createdAt: new Date(), updatedAt: new Date() });
  }
  return id;
}

async function backfillUsers(db, legacyCompanyId) {
  const users = db.collection("users");
  const cursor = users.find({}, { projection: { memberships: 1, defaultCompanyId: 1 } });
  const bulk = [];
  const companyByUserId = new Map();

  while (await cursor.hasNext()) {
    const user = await cursor.next();
    if (!user?._id) continue;

    let memberships = normalizeMemberships(user.memberships);
    if (!memberships.length) {
      memberships = [
        {
          companyId: legacyCompanyId,
          tenantRole: "member",
          status: "active",
        },
      ];
    }

    const active = memberships.find((m) => m.status === "active") || memberships[0];
    const defaultCompanyId = toObjectId(user.defaultCompanyId) || active.companyId;
    companyByUserId.set(String(user._id), defaultCompanyId);

    bulk.push({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            memberships,
            defaultCompanyId,
            updatedAt: new Date(),
          },
        },
      },
    });
  }

  if (APPLY && bulk.length) {
    await users.bulkWrite(bulk, { ordered: false });
  }

  return { usersTouched: bulk.length, companyByUserId };
}

async function backfillRoutes(db, legacyCompanyId) {
  const routes = db.collection("routes");
  const filter = { $or: [{ companyId: null }, { companyId: { $exists: false } }] };
  const count = await routes.countDocuments(filter);
  if (APPLY && count > 0) {
    await routes.updateMany(filter, { $set: { companyId: legacyCompanyId, updatedAt: new Date() } });
  }
  return { routesTouched: count };
}

async function backfillTripPlans(db, companyByUserId, legacyCompanyId) {
  const tripPlans = db.collection("tripplans");
  const cursor = tripPlans.find(
    { $or: [{ companyId: null }, { companyId: { $exists: false } }] },
    { projection: { driverUserId: 1 } },
  );

  const bulk = [];
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc?._id) continue;
    const companyId = companyByUserId.get(asId(doc.driverUserId)) || legacyCompanyId;
    bulk.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { companyId, updatedAt: new Date() } },
      },
    });
  }

  if (APPLY && bulk.length) {
    await tripPlans.bulkWrite(bulk, { ordered: false });
  }
  return { tripPlansTouched: bulk.length };
}

async function backfillTrips(db, companyByUserId, legacyCompanyId) {
  const trips = db.collection("trips");
  const cursor = trips.find(
    { $or: [{ companyId: null }, { companyId: { $exists: false } }] },
    { projection: { userId: 1 } },
  );
  const bulk = [];
  const companyByTripId = new Map();

  while (await cursor.hasNext()) {
    const trip = await cursor.next();
    if (!trip?._id) continue;
    const companyId = companyByUserId.get(asId(trip.userId)) || legacyCompanyId;
    companyByTripId.set(asId(trip._id), companyId);
    bulk.push({
      updateOne: {
        filter: { _id: trip._id },
        update: { $set: { companyId, updatedAt: new Date() } },
      },
    });
  }

  if (APPLY && bulk.length) {
    await trips.bulkWrite(bulk, { ordered: false });
  }
  return { tripsTouched: bulk.length, companyByTripId };
}

async function backfillByTripId(db, collectionName, companyByTripId, legacyCompanyId) {
  const col = db.collection(collectionName);
  const cursor = col.find(
    { $or: [{ companyId: null }, { companyId: { $exists: false } }] },
    { projection: { tripId: 1 } },
  );
  const bulk = [];

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc?._id) continue;
    const companyId = companyByTripId.get(asId(doc.tripId)) || legacyCompanyId;
    bulk.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { companyId, updatedAt: new Date() } },
      },
    });
  }

  if (APPLY && bulk.length) {
    await col.bulkWrite(bulk, { ordered: false });
  }
  return bulk.length;
}

async function run() {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI (or MONGO_URI)");
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  console.log(`[backfill] mode=${APPLY ? "apply" : "dry-run"} legacyTenant="${LEGACY_TENANT_NAME}"`);

  const legacyCompanyId = await ensureLegacyTenant(db);
  const usersRes = await backfillUsers(db, legacyCompanyId);
  const routesRes = await backfillRoutes(db, legacyCompanyId);
  const tripPlansRes = await backfillTripPlans(db, usersRes.companyByUserId, legacyCompanyId);
  const tripsRes = await backfillTrips(db, usersRes.companyByUserId, legacyCompanyId);

  const tripSamplesTouched = await backfillByTripId(db, "tripsamples", tripsRes.companyByTripId, legacyCompanyId);
  const tripEventsTouched = await backfillByTripId(db, "tripevents", tripsRes.companyByTripId, legacyCompanyId);
  const tripChatsTouched = await backfillByTripId(db, "tripchatmessages", tripsRes.companyByTripId, legacyCompanyId);

  console.log("[backfill] summary", {
    usersTouched: usersRes.usersTouched,
    routesTouched: routesRes.routesTouched,
    tripPlansTouched: tripPlansRes.tripPlansTouched,
    tripsTouched: tripsRes.tripsTouched,
    tripSamplesTouched,
    tripEventsTouched,
    tripChatsTouched,
  });

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[backfill] failed", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});

