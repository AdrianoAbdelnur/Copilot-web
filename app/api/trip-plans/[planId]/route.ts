import { connectDB } from "@/lib/db";
import TripPlan from "@/models/TripPlan";
import { getAuthPayload } from "@/lib/auth";
import mongoose from "mongoose";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ planId: string }> };

const ALLOWED_PATCH_KEYS = new Set([
  "status",
  "title",
  "notes",
  "plannedStartAt",
  "tripId",
  "startedAt",
  "finishedAt",
  "vehicle",
  "meta",
]);

export async function GET(req: Request, ctx: Ctx) {
  try {
    const payload = getAuthPayload(req);
    if (!payload?.user?.id) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { planId } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    await connectDB();

    const item = await TripPlan.findById(planId).lean();
    if (!item) {
      return Response.json({ ok: false, error: "trip_plan_not_found" }, { status: 404 });
    }

    return Response.json({ ok: true, item });
  } catch {
    return Response.json({ ok: false, error: "failed_to_get_trip_plan" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const payload = getAuthPayload(req);
    if (!payload?.user?.id) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { planId } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    await connectDB();

    const body = await req.json();
    const setPatch: Record<string, any> = {};

    for (const [key, value] of Object.entries(body || {})) {
      if (!ALLOWED_PATCH_KEYS.has(key)) continue;
      if (["plannedStartAt", "startedAt", "finishedAt"].includes(key) && value) {
        const d = new Date(String(value));
        if (Number.isNaN(d.getTime())) {
          return Response.json({ ok: false, error: "invalid_date" }, { status: 400 });
        }
        setPatch[key] = d;
        continue;
      }

      if (["tripId"].includes(key) && value && !mongoose.Types.ObjectId.isValid(String(value))) {
        return Response.json({ ok: false, error: "invalid_trip_id" }, { status: 400 });
      }

      setPatch[key] = value;
    }

    const item = await TripPlan.findByIdAndUpdate(planId, { $set: setPatch }, { new: true });
    if (!item) {
      return Response.json({ ok: false, error: "trip_plan_not_found" }, { status: 404 });
    }

    return Response.json({ ok: true, item });
  } catch {
    return Response.json({ ok: false, error: "failed_to_patch_trip_plan" }, { status: 500 });
  }
}
