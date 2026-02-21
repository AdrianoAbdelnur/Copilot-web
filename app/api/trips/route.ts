import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import {
  getAuthUser,
  isAdminRole,
  parseDateMaybe,
  parseLimit,
  unauthorized,
} from "./_helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    await connectDB();

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").trim();
    const userId = (url.searchParams.get("userId") || "").trim();
    const scope = (url.searchParams.get("scope") || "").trim();
    const from = parseDateMaybe(url.searchParams.get("from"));
    const to = parseDateMaybe(url.searchParams.get("to"));
    const limit = parseLimit(url.searchParams.get("limit"), 100, 500);

    const adminMode = isAdminRole(auth.role) && scope === "all";
    const query: Record<string, any> = adminMode ? {} : { userId: auth.id };

    if (adminMode && userId) query.userId = userId;

    if (status) query.status = status;
    if (from || to) {
      query.startedAt = {};
      if (from) query.startedAt.$gte = from;
      if (to) query.startedAt.$lte = to;
    }

    const items = await Trip.find(query).sort({ startedAt: -1 }).limit(limit).lean();

    return Response.json({ ok: true, items, adminMode });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_trips" }, { status: 500 });
  }
}
