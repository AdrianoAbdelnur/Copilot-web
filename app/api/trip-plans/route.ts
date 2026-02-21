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

export async function GET(req: Request) {
  try {
    const payload = getAuthPayload(req);
    if (!payload?.user?.id) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await connectDB();

    const url = new URL(req.url);
    const driverUserId = (url.searchParams.get("driverUserId") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const from = parseDateMaybe(fromRaw);
    const to = parseDateMaybe(toRaw);

    if ((fromRaw && !from) || (toRaw && !to)) {
      return Response.json({ ok: false, error: "invalid_date" }, { status: 400 });
    }

    const query: Record<string, any> = {};

    if (driverUserId) {
      if (!mongoose.Types.ObjectId.isValid(driverUserId)) {
        return Response.json({ ok: false, error: "invalid_driver_id" }, { status: 400 });
      }
      query.driverUserId = driverUserId;
    }

    if (status) query.status = status;

    if (from || to) {
      query.plannedStartAt = {};
      if (from) query.plannedStartAt.$gte = from;
      if (to) query.plannedStartAt.$lte = to;
    }

    const items = await TripPlan.find(query)
      .sort({ plannedStartAt: -1 })
      .limit(parseLimit(url.searchParams.get("limit"), 100, 500))
      .lean();

    return Response.json({ ok: true, items });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_trip_plans" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = getAuthPayload(req);
    const userId = payload?.user?.id ? String(payload.user.id) : "";
    if (!userId) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const driverUserId = String(body?.driverUserId || "").trim();
    const driverUserIdsRaw = Array.isArray(body?.driverUserIds) ? body.driverUserIds : [];
    const driverUserIds: string[] = Array.from(
      new Set(
        driverUserIdsRaw
          .map((id: unknown) => String(id || "").trim())
          .filter((id: string) => id.length > 0)
      )
    );
    const routeId = String(body?.routeId || "").trim();
    const plannedStartAt = new Date(String(body?.plannedStartAt || ""));

    const targetDriverIds = driverUserIds.length > 0 ? driverUserIds : [driverUserId];
    if (targetDriverIds.length === 0 || targetDriverIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return Response.json({ ok: false, error: "invalid_driver_id" }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(routeId)) {
      return Response.json({ ok: false, error: "invalid_route_id" }, { status: 400 });
    }

    if (Number.isNaN(plannedStartAt.getTime())) {
      return Response.json({ ok: false, error: "invalid_planned_start" }, { status: 400 });
    }

    const baseDoc = {
      routeId,
      plannedStartAt,
      status: body?.status || "assigned",
      title: String(body?.title || "").trim(),
      notes: String(body?.notes || "").trim(),
      vehicle: body?.vehicle ?? null,
      meta: body?.meta ?? null,
      createdBy: userId,
    };

    const docs = targetDriverIds.map((id) => ({
      ...baseDoc,
      driverUserId: id,
    }));

    const created = await TripPlan.insertMany(docs, { ordered: false });

    return Response.json({
      ok: true,
      items: created,
      createdCount: created.length,
      multi: created.length > 1,
    });
  } catch {
    return Response.json({ ok: false, error: "failed_to_create_trip_plan" }, { status: 500 });
  }
}
