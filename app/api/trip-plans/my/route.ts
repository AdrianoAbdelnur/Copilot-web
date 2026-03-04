import { connectDB } from "@/lib/db";
import TripPlan from "@/models/TripPlan";
import { getAuthPayload } from "@/lib/auth";
import mongoose from "mongoose";

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
  const debugId = `trip-plans/my:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    console.log(`[${debugId}] GET /api/trip-plans/my - start`);

    const payload = getAuthPayload(req);
    const authUserId = payload?.user?.id ? String(payload.user.id) : "";
    const authRole = payload?.user?.role ? String(payload.user.role) : "";

    console.log(`[${debugId}] auth resolved`, {
      hasPayload: !!payload,
      authUserId,
      authRole,
      authUserIdIsObjectId: mongoose.Types.ObjectId.isValid(authUserId),
      hasAuthHeader: req.headers.has("authorization"),
      authHeaderLength: (req.headers.get("authorization") || "").length,
    });

    if (!authUserId) {
      console.warn(`[${debugId}] unauthorized: missing auth user id`);
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await connectDB();
    console.log(`[${debugId}] db connected`);

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

    console.log(`[${debugId}] query`, {
      statusRaw,
      statuses,
      fromRaw,
      toRaw,
      fromISO: from ? from.toISOString() : null,
      toISO: to ? to.toISOString() : null,
      limit: parseLimit(url.searchParams.get("limit"), 100, 500),
      query,
    });

    const items = await TripPlan.find(query)
      .populate("routeId", "title")
      .sort({ plannedStartAt: 1 })
      .limit(parseLimit(url.searchParams.get("limit"), 100, 500))
      .lean();

    console.log(`[${debugId}] success`, { count: Array.isArray(items) ? items.length : 0 });

    return Response.json({ ok: true, items, mine: true, statuses });
  } catch (err: unknown) {
    const castErr = err as { name?: string; message?: string; path?: string; value?: unknown };
    console.error(`[${debugId}] failed_to_list_my_trip_plans`, {
      name: castErr?.name || "UnknownError",
      message: castErr?.message || "unknown message",
      path: castErr?.path || null,
      value: castErr?.value ?? null,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return Response.json({ ok: false, error: "failed_to_list_my_trip_plans" }, { status: 500 });
  }
}

