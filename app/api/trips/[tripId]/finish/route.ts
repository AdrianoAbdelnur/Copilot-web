import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import TripEvent from "@/models/TripEvent";
import {
  ALLOWED_TOTALS_PATCH_KEYS,
  CLOSED_STATUSES,
  findOwnedTrip,
  getUserIdOrNull,
  invalidId,
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
    const endPos = body?.endPos;
    const totalsPatch = body?.totalsPatch;

    if (!isValidPos(endPos)) {
      return Response.json({ ok: false, error: "invalid_end_pos" }, { status: 400 });
    }

    const endedAt = new Date();

    await TripEvent.create({
      tripId: trip._id,
      userId,
      routeId: trip.routeId,
      t: endedAt,
      type: "trip_end",
      pos: endPos,
    });

    const updateSet: Record<string, any> = {
      status: "finished",
      endedAt,
      endPos,
      "totals.durationS": Math.floor((endedAt.getTime() - new Date(trip.startedAt).getTime()) / 1000),
    };

    if (totalsPatch && typeof totalsPatch === "object") {
      for (const [key, value] of Object.entries(totalsPatch)) {
        if (ALLOWED_TOTALS_PATCH_KEYS.has(key)) {
          updateSet[`totals.${key}`] = value;
        }
      }
    }

    await Trip.updateOne(
      { _id: trip._id },
      {
        $set: updateSet,
        $inc: { "totals.eventsCount": 1 },
      }
    );

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "failed_to_finish_trip" }, { status: 500 });
  }
}
