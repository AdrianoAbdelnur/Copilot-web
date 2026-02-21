import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import TripSample from "@/models/TripSample";
import {
  CLOSED_STATUSES,
  findOwnedTrip,
  findTripForUserScope,
  getAuthUser,
  getUserIdOrNull,
  invalidId,
  isAdminRole,
  parseDateMaybe,
  isValidObjectId,
  isValidPos,
  unauthorized,
} from "../../_helpers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const userId = getUserIdOrNull(req);
    if (!userId) return unauthorized();

    const { tripId } = await ctx.params;
    if (!isValidObjectId(tripId)) return invalidId();

    await connectDB();

    const trip = await findOwnedTrip(tripId, userId);
    if (!trip) {
      return Response.json({ ok: false, error: "trip_not_found" }, { status: 404 });
    }
    if (CLOSED_STATUSES.has(String(trip.status))) {
      return Response.json({ ok: false, error: "trip_closed" }, { status: 409 });
    }

    const body = await req.json();
    const samples = body?.samples;

    if (!Array.isArray(samples) || samples.length === 0) {
      return Response.json({ ok: false, error: "invalid_samples" }, { status: 400 });
    }

    const now = new Date();
    const docs = samples.map((sample: any) => ({
      tripId: trip._id,
      userId,
      routeId: trip.routeId,
      t: sample?.t ? new Date(sample.t) : now,
      pos: sample?.pos,
      speedKmh: sample?.speedKmh ?? null,
      heading: sample?.heading ?? null,
      accuracyM: sample?.accuracyM ?? null,
      mm: sample?.mm ?? null,
    }));

    const valid = docs.every((d) => isValidPos(d.pos) && !Number.isNaN(d.t.getTime()));
    if (!valid) {
      return Response.json({ ok: false, error: "invalid_samples" }, { status: 400 });
    }

    await TripSample.insertMany(docs, { ordered: false });

    let maxSpeed: number | null = null;
    for (const sample of samples) {
      const speed = Number(sample?.speedKmh);
      if (Number.isFinite(speed)) {
        maxSpeed = maxSpeed === null ? speed : Math.max(maxSpeed, speed);
      }
    }

    const update: Record<string, any> = { $inc: { "totals.samplesCount": docs.length } };
    if (maxSpeed !== null) update.$max = { "totals.maxSpeedKmh": maxSpeed };

    await Trip.updateOne({ _id: trip._id }, update);

    return Response.json({ ok: true, inserted: docs.length });
  } catch {
    return Response.json({ ok: false, error: "failed_to_insert_samples" }, { status: 500 });
  }
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    const { tripId } = await ctx.params;
    if (!isValidObjectId(tripId)) return invalidId();

    await connectDB();

    const trip = await findTripForUserScope(tripId, auth.id, isAdminRole(auth.role));
    if (!trip) {
      return Response.json({ ok: false, error: "trip_not_found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 1000), 1), 10000);
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const from = parseDateMaybe(fromRaw);
    const to = parseDateMaybe(toRaw);
    if ((fromRaw && !from) || (toRaw && !to)) {
      return Response.json({ ok: false, error: "invalid_date" }, { status: 400 });
    }

    const query: Record<string, any> = { tripId: trip._id, userId: trip.userId };
    if (from || to) {
      query.t = {};
      if (from) query.t.$gte = from;
      if (to) query.t.$lte = to;
    }

    const items = await TripSample.find(query).sort({ t: 1 }).limit(limit).lean();
    return Response.json({ ok: true, items });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_trip_samples" }, { status: 500 });
  }
}
