import { connectDB } from "@/lib/db";
import TripPlan from "@/models/TripPlan";
import { getAuthPayload } from "@/lib/auth";

export const runtime = "nodejs";

function parseDateMaybe(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseLimit(input: string | null, fallback = 100, max = 500): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

const DEFAULT_ACTIVE_STATUSES = ["planned", "assigned", "in_progress"] as const;

export async function GET(req: Request) {
  try {
    const payload = getAuthPayload(req);
    const authUserId = payload?.user?.id ? String(payload.user.id) : "";
    if (!authUserId) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await connectDB();

    const url = new URL(req.url);
    const statusRaw = (url.searchParams.get("status") || "").trim();
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const from = parseDateMaybe(fromRaw);
    const to = parseDateMaybe(toRaw);

    if ((fromRaw && !from) || (toRaw && !to)) {
      return Response.json({ ok: false, error: "invalid_date" }, { status: 400 });
    }

    const statuses = statusRaw
      ? Array.from(
          new Set(
            statusRaw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        )
      : [...DEFAULT_ACTIVE_STATUSES];

    const query: Record<string, any> = {
      driverUserId: authUserId,
      status: { $in: statuses },
    };

    if (from || to) {
      query.plannedStartAt = {};
      if (from) query.plannedStartAt.$gte = from;
      if (to) query.plannedStartAt.$lte = to;
    }

    const items = await TripPlan.find(query)
      .populate("routeId", "title")
      .sort({ plannedStartAt: 1 })
      .limit(parseLimit(url.searchParams.get("limit"), 100, 500))
      .lean();

    return Response.json({ ok: true, items, mine: true, statuses });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_my_trip_plans" }, { status: 500 });
  }
}

