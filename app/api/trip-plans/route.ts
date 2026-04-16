import { connectDB } from "@/lib/db";
import TripPlan from "@/models/TripPlan";
import { getAuthPayload } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import Route from "@/models/RouteMap";
import User from "@/models/User";
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
      .populate("driverUserId", "firstName lastName email role")
      .populate("routeId", "title")
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
    const role = payload?.user?.role ? String(payload.user.role).toLowerCase() : "";
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
    const requestedCompanyIds: string[] = Array.from(
      new Set(
        (Array.isArray(body?.companyIds) ? body.companyIds : [])
          .map((id: unknown) => String(id || "").trim())
          .filter((id: string) => id.length > 0),
      ),
    );
    const plannedStartAt = new Date(String(body?.plannedStartAt || ""));

    const targetDriverIds = driverUserIds.length > 0 ? driverUserIds : [driverUserId];
    if (targetDriverIds.length === 0 || targetDriverIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return Response.json({ ok: false, error: "invalid_driver_id" }, { status: 400 });
    }

    if (!mongoose.Types.ObjectId.isValid(routeId)) {
      return Response.json({ ok: false, error: "invalid_route_id" }, { status: 400 });
    }
    if (requestedCompanyIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return Response.json({ ok: false, error: "invalid_company_id" }, { status: 400 });
    }

    if (Number.isNaN(plannedStartAt.getTime())) {
      return Response.json({ ok: false, error: "invalid_planned_start" }, { status: 400 });
    }

    let targetCompanyIds: string[] = [];
    if (requestedCompanyIds.length > 0) {
      if (role !== "superadmin") {
        return Response.json({ ok: false, error: "forbidden_company_scope" }, { status: 403 });
      }
      targetCompanyIds = requestedCompanyIds;
    } else {
      const tenantContext = await getTenantContext(req);
      if (!tenantContext.ok) {
        return Response.json(
          { ok: false, error: tenantContext.error, message: tenantContext.message },
          { status: tenantContext.status },
        );
      }
      targetCompanyIds = [tenantContext.tenantId];
    }

    const routeDoc = await Route.findById(routeId).select("companyId").lean();
    if (!routeDoc) {
      return Response.json({ ok: false, error: "route_not_found" }, { status: 404 });
    }
    const routeCompanyId = routeDoc?.companyId ? String(routeDoc.companyId) : "";
    if (routeCompanyId && targetCompanyIds.some((companyId) => companyId !== routeCompanyId)) {
      return Response.json(
        {
          ok: false,
          error: "route_not_in_company_scope",
          message: "La ruta seleccionada no pertenece a todos los tenants elegidos.",
          routeCompanyId,
        },
        { status: 400 },
      );
    }

    const driversFound = await User.find({ _id: { $in: targetDriverIds }, isDeleted: false })
      .select("memberships")
      .lean();
    if (driversFound.length !== targetDriverIds.length) {
      return Response.json({ ok: false, error: "driver_not_found" }, { status: 404 });
    }

    const membershipByDriver = new Map<string, Array<{ companyId: string; status: string }>>();
    for (const row of driversFound as Array<{ _id?: unknown; memberships?: unknown }>) {
      const id = String(row?._id || "").trim();
      const memberships = Array.isArray(row?.memberships) ? row.memberships : [];
      const parsed = memberships
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          const item = m as Record<string, unknown>;
          const companyId = String(item.companyId || "").trim();
          const status = String(item.status || "active").trim().toLowerCase() || "active";
          if (!companyId) return null;
          return { companyId, status };
        })
        .filter((m): m is { companyId: string; status: string } => m !== null);
      membershipByDriver.set(id, parsed);
    }

    const invalidDriverScopes: Array<{ driverUserId: string; companyId: string }> = [];
    for (const companyId of targetCompanyIds) {
      for (const driverId of targetDriverIds) {
        const memberships = membershipByDriver.get(driverId) || [];
        const hasActiveMembership = memberships.some((m) => m.companyId === companyId && m.status !== "inactive");
        if (!hasActiveMembership) invalidDriverScopes.push({ driverUserId: driverId, companyId });
      }
    }

    if (invalidDriverScopes.length > 0) {
      return Response.json(
        {
          ok: false,
          error: "driver_not_in_company_scope",
          message: "Hay choferes que no pertenecen a alguno de los tenants elegidos.",
          invalidDriverScopes,
        },
        { status: 400 },
      );
    }

    const baseDoc = {
      plannedStartAt,
      status: body?.status || "assigned",
      title: String(body?.title || "").trim(),
      notes: String(body?.notes || "").trim(),
      vehicle: body?.vehicle ?? null,
      meta: body?.meta ?? null,
      createdBy: userId,
    };

    const docs = targetCompanyIds.flatMap((companyId) =>
      targetDriverIds.map((id) => ({
        ...baseDoc,
        companyId,
        routeId,
        driverUserId: id,
      })),
    );

    const created = await TripPlan.insertMany(docs, { ordered: false });
    const createdIds = created.map((item) => item._id);
    const createdPopulated = await TripPlan.find({ _id: { $in: createdIds } })
      .populate("driverUserId", "firstName lastName email role")
      .populate("routeId", "title")
      .lean();

    return Response.json({
      ok: true,
      items: createdPopulated,
      createdCount: created.length,
      multi: created.length > 1,
    });
  } catch {
    return Response.json({ ok: false, error: "failed_to_create_trip_plan" }, { status: 500 });
  }
}
