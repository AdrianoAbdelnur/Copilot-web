import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import TripEvent from "@/models/TripEvent";
import TripSample from "@/models/TripSample";
import TripPlan from "@/models/TripPlan";
import {
  getAuthUser,
  invalidId,
  isAdminRole,
  isValidPos,
  isValidObjectId,
  findTripForUserScope,
  unauthorized,
} from "../_helpers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    const { tripId } = await ctx.params;
    if (!isValidObjectId(tripId)) return invalidId();

    await connectDB();

    const item = await findTripForUserScope(tripId, auth.id, isAdminRole(auth.role));
    if (item?.populate) {
      await item.populate("userId", "firstName lastName email role");
      await item.populate("routeId", "title google.totals.distanceM");
    }
    const leanItem = item?.toObject ? item.toObject() : item;
    if (!leanItem) {
      return Response.json({ ok: false, error: "trip_not_found" }, { status: 404 });
    }

    return Response.json({ ok: true, item: leanItem });
  } catch {
    return Response.json({ ok: false, error: "failed_to_get_trip" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();
    if (!isAdminRole(auth.role)) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { tripId } = await ctx.params;
    if (!isValidObjectId(tripId)) return invalidId();

    await connectDB();

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, any> = {};

    if (typeof body?.title === "string") patch.title = body.title.trim();
    if (typeof body?.notes === "string") patch.notes = body.notes.trim();

    if (typeof body?.status === "string") {
      const status = body.status.trim();
      if (!["active", "paused", "finished", "aborted"].includes(status)) {
        return Response.json({ ok: false, error: "invalid_status" }, { status: 400 });
      }
      patch.status = status;
    }

    if (body?.startedAt != null) {
      const d = new Date(String(body.startedAt));
      if (Number.isNaN(d.getTime())) return Response.json({ ok: false, error: "invalid_started_at" }, { status: 400 });
      patch.startedAt = d;
    }

    if (body?.endedAt !== undefined) {
      if (body.endedAt === null || body.endedAt === "") {
        patch.endedAt = null;
      } else {
        const d = new Date(String(body.endedAt));
        if (Number.isNaN(d.getTime())) return Response.json({ ok: false, error: "invalid_ended_at" }, { status: 400 });
        patch.endedAt = d;
      }
    }

    if (body?.startPos !== undefined) {
      if (!isValidPos(body.startPos)) {
        return Response.json({ ok: false, error: "invalid_start_pos" }, { status: 400 });
      }
      patch.startPos = body.startPos;
    }

    if (body?.endPos !== undefined) {
      if (body.endPos !== null && !isValidPos(body.endPos)) {
        return Response.json({ ok: false, error: "invalid_end_pos" }, { status: 400 });
      }
      patch.endPos = body.endPos;
    }

    const item = await Trip.findByIdAndUpdate(tripId, { $set: patch }, { new: true })
      .populate("userId", "firstName lastName email role")
      .populate("routeId", "title google.totals.distanceM");
    if (!item) return Response.json({ ok: false, error: "trip_not_found" }, { status: 404 });

    return Response.json({ ok: true, item });
  } catch {
    return Response.json({ ok: false, error: "failed_to_patch_trip" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();
    if (!isAdminRole(auth.role)) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { tripId } = await ctx.params;
    if (!isValidObjectId(tripId)) return invalidId();

    await connectDB();

    const deleted = await Trip.findByIdAndDelete(tripId);
    if (!deleted) return Response.json({ ok: false, error: "trip_not_found" }, { status: 404 });

    await Promise.all([
      TripEvent.deleteMany({ tripId }),
      TripSample.deleteMany({ tripId }),
      TripPlan.updateMany({ tripId }, { $set: { tripId: null } }),
    ]);

    return Response.json({ ok: true, deletedId: String(tripId) });
  } catch {
    return Response.json({ ok: false, error: "failed_to_delete_trip" }, { status: 500 });
  }
}
