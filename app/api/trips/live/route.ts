import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import {
  getAuthUser,
  isAdminRole,
  isValidObjectId,
  parseDateMaybe,
  parseLimit,
  unauthorized,
} from "../_helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    await connectDB();

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").trim();
    const userId = (url.searchParams.get("userId") || "").trim();
    const routeId = (url.searchParams.get("routeId") || "").trim();

    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const from = parseDateMaybe(fromRaw);
    const to = parseDateMaybe(toRaw);
    if ((fromRaw && !from) || (toRaw && !to)) {
      return Response.json({ ok: false, error: "invalid_date" }, { status: 400 });
    }

    const adminMode = isAdminRole(auth.role);
    const query: Record<string, any> = {};

    if (!adminMode) {
      query.userId = auth.id;
    } else if (userId) {
      if (!isValidObjectId(userId)) {
        return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
      }
      query.userId = userId;
    }

    if (routeId) {
      if (!isValidObjectId(routeId)) {
        return Response.json({ ok: false, error: "invalid_route_id" }, { status: 400 });
      }
      query.routeId = routeId;
    }

    if (status) {
      query.status = status;
    }

    if (from || to) {
      query.startedAt = {};
      if (from) query.startedAt.$gte = from;
      if (to) query.startedAt.$lte = to;
    }

    const items = await Trip.find(query)
      .sort({ startedAt: -1 })
      .limit(parseLimit(url.searchParams.get("limit"), 200, 1000))
      .lean();

    return Response.json({ ok: true, items, adminMode });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_live_trips" }, { status: 500 });
  }
}
