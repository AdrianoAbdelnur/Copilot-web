import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import {
  getAuthUser,
  invalidId,
  isAdminRole,
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
      await item.populate("routeId", "title");
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
