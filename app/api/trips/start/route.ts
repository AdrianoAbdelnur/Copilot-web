import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import TripEvent from "@/models/TripEvent";
import { getUserIdOrNull, isValidObjectId, isValidPos, unauthorized } from "../_helpers";
import { getTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const userId = getUserIdOrNull(req);
    if (!userId) return unauthorized();

    await connectDB();
    const tenantContext = await getTenantContext(req);
    if (!tenantContext.ok) {
      return Response.json({ ok: false, error: tenantContext.error, message: tenantContext.message }, { status: tenantContext.status });
    }
    const companyId = tenantContext.tenantId;

    const body = await req.json();
    const routeId = String(body?.routeId ?? "");
    const startPos = body?.startPos;
    const device = body?.device ?? null;

    if (!isValidObjectId(routeId)) {
      return Response.json({ ok: false, error: "invalid_route_id" }, { status: 400 });
    }
    if (!isValidPos(startPos)) {
      return Response.json({ ok: false, error: "invalid_start_pos" }, { status: 400 });
    }

    const startedAt = new Date();

    const trip = await Trip.create({
      companyId,
      userId,
      routeId,
      status: "active",
      startedAt,
      startPos,
      live: {
        t: startedAt,
        pos: startPos,
      },
      device,
    });

    await TripEvent.create({
      companyId,
      tripId: trip._id,
      userId,
      routeId,
      t: startedAt,
      type: "trip_start",
      pos: startPos,
    });

    await Trip.updateOne({ _id: trip._id }, { $inc: { "totals.eventsCount": 1 } });

    return Response.json({ ok: true, tripId: String(trip._id) });
  } catch {
    return Response.json({ ok: false, error: "failed_to_start_trip" }, { status: 500 });
  }
}


