import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import {
  ALLOWED_STATUS_PATCH,
  CLOSED_STATUSES,
  findOwnedTrip,
  getUserIdOrNull,
  invalidId,
  isValidObjectId,
  unauthorized,
} from "../../_helpers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ tripId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
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
    const status = body?.status;

    if (!ALLOWED_STATUS_PATCH.has(status)) {
      return Response.json({ ok: false, error: "invalid_status" }, { status: 400 });
    }

    await Trip.updateOne({ _id: trip._id }, { $set: { status } });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "failed_to_update_trip_status" }, { status: 500 });
  }
}
