import { connectDB } from "@/lib/db";
import {
  loadRouteDocOrThrow,
  callGoogleDirections,
  normalizeSteps,
  toPatchedSegmentsUI,
} from "@/lib/routeRepair";
import { decodePolyline } from "@/lib/routeMatch";
import RouteRevision from "@/models/RouteRevision";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;

  const doc = await loadRouteDocOrThrow(id);
  if (!doc) {
    return Response.json({ ok: false, message: "Route no encontrada" }, { status: 404 });
  }

  const rev = await RouteRevision.findOne({ routeId: doc._id }).sort({ version: -1 });
  if (!rev) {
    return Response.json(
      { ok: false, message: "No existe RouteRevision. Ejecutá /match primero." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const plans = Array.isArray(body?.plans) ? body.plans : [];

  // ✅ CASO NUEVO: no hay clusters/plans para reparar → NO-OP OK
  if (!plans.length) {
    if (rev.stage !== "final") {
      rev.stage = "final";
      rev.markModified("stage");
      await rev.save();
    }

    return Response.json({
      ok: true,
      id: String(doc._id),
      message: "OK ✅ no hay clusters/plans para reparar (ruta perfecta)",
      revision: {
        id: String(rev._id),
        version: rev.version,
        stage: rev.stage,
        createdAt: rev.createdAt,
      },
      patchedSegments: [],
      meta: { patchedCount: 0 },
    });
  }

  const patchedSegments: any[] = [];

  for (const plan of plans) {
    const origin = plan.requestOrigin;
    const destination = plan.requestDestination;
    const waypoints = Array.isArray(plan.waypoints) ? plan.waypoints : [];

    const r = await callGoogleDirections({ origin, destination, waypoints });

    if (!r.ok) {
      patchedSegments.push({
        clusterIdx: plan.clusterIdx,
        origin,
        destination,
        waypoints,
        google: { status: r.status, overviewPolyline: null, densePath: [] },
      });
      continue;
    }

    const route0 = r.json.routes[0];
    const legs = route0.legs ?? [];
    const overview = route0.overview_polyline?.points ?? null;

    const densePath = overview ? decodePolyline(overview) : [];

    patchedSegments.push({
      clusterIdx: plan.clusterIdx,
      origin,
      destination,
      waypoints,
      google: {
        status: "OK",
        summary: route0.summary ?? "",
        overviewPolyline: overview,
        densePath,
        legs,
        steps: normalizeSteps(legs),
        warnings: route0.warnings ?? [],
        waypoint_order: route0.waypoint_order ?? [],
      },
    });
  }

  const uiSegments = toPatchedSegmentsUI(patchedSegments);

  rev.stage = "repair";

  const prevPlan = (rev.plan ?? {}) as any;

  rev.plan = {
    ...prevPlan,
    patchedCount: uiSegments.length,
    patchedSegments: uiSegments,
  };

  rev.markModified("plan");
  rev.markModified("stage");

  await rev.save();

  return Response.json({
    ok: true,
    id: String(doc._id),
    revision: {
      id: String(rev._id),
      version: rev.version,
      stage: rev.stage,
      createdAt: rev.createdAt,
    },
    patchedSegments: uiSegments,
    meta: { patchedCount: uiSegments.length },
  });
}
