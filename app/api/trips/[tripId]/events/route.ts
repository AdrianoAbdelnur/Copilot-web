import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import TripEvent, { tripEventTypes } from "@/models/TripEvent";
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

const ALLOWED_EVENT_TYPES = new Set<string>(tripEventTypes);

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
    const events = body?.events;

    if (!Array.isArray(events) || events.length === 0) {
      return Response.json({ ok: false, error: "invalid_events" }, { status: 400 });
    }

    const now = new Date();
    const docs = events.map((event: any) => ({
      tripId: trip._id,
      userId,
      routeId: trip.routeId,
      t: event?.t ? new Date(event.t) : now,
      type: event?.type,
      pos: event?.pos,
      routePos: event?.routePos ?? null,
      poi: event?.poi ?? null,
      segment: event?.segment ?? null,
      step: event?.step ?? null,
      speed: event?.speed ?? null,
      meta: event?.meta ?? null,
    }));

    const valid = docs.every(
      (d) =>
        isValidPos(d.pos) &&
        typeof d.type === "string" &&
        ALLOWED_EVENT_TYPES.has(d.type) &&
        !Number.isNaN(d.t.getTime())
    );

    if (!valid) {
      return Response.json({ ok: false, error: "invalid_events" }, { status: 400 });
    }

    await TripEvent.insertMany(docs, { ordered: false });

    let speedOverCount = 0;
    let offrouteCount = 0;
    let poiHits = 0;
    let segmentEntries = 0;

    for (const event of docs) {
      if (event.type === "speed_over_start") speedOverCount += 1;
      if (event.type === "offroute_start") offrouteCount += 1;
      if (event.type === "poi_enter") poiHits += 1;
      if (event.type === "segment_enter") segmentEntries += 1;
    }

    await Trip.updateOne(
      { _id: trip._id },
      {
        $inc: {
          "totals.eventsCount": docs.length,
          "totals.speedOverCount": speedOverCount,
          "totals.offrouteCount": offrouteCount,
          "totals.poiHits": poiHits,
          "totals.segmentEntries": segmentEntries,
        },
      }
    );

    return Response.json({ ok: true, inserted: docs.length });
  } catch {
    return Response.json({ ok: false, error: "failed_to_insert_events" }, { status: 500 });
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
    const type = (url.searchParams.get("type") || "").trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 500), 1), 5000);
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
    if (type) query.type = type;

    const items = await TripEvent.find(query).sort({ t: 1 }).limit(limit).lean();
    return Response.json({ ok: true, items });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_trip_events" }, { status: 500 });
  }
}
