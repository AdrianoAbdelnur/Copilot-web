import { connectDB } from "@/lib/db";
import {
  loadRouteDocByScope,
  callGoogleDirections,
  normalizeSteps,
  toPatchedSegmentsUI,
} from "@/lib/routeRepair";
import { decodePolyline } from "@/lib/routeMatch";
import RouteRevision from "@/models/RouteRevision";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function haversineM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function computeStepStats(steps: any[]) {
  const safe = Array.isArray(steps) ? steps : [];
  const distanceM = safe.reduce((acc: number, s: any) => acc + (Number(s?.distance?.value) || 0), 0);
  return {
    stepCount: safe.length,
    distanceM,
  };
}

function getOriginalSegmentStats(doc: any, plan: any) {
  const allSteps = Array.isArray(doc?.google?.steps) ? doc.google.steps : [];
  if (!allSteps.length) return { stepCount: 0, distanceM: 0 };

  const a = Number.isFinite(plan?.stepIdxStart) ? Math.floor(plan.stepIdxStart) : 0;
  const b = Number.isFinite(plan?.stepIdxEnd) ? Math.floor(plan.stepIdxEnd) : 0;
  const start = Math.max(0, Math.min(a, b));
  const end = Math.min(allSteps.length - 1, Math.max(a, b));
  if (end < start) return { stepCount: 0, distanceM: 0 };

  return computeStepStats(allSteps.slice(start, end + 1));
}

export async function POST(req: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;

  const scoped = await loadRouteDocByScope(req, id);
  if (!scoped.ok) {
    return Response.json(
      { ok: false, error: scoped.error, message: scoped.message },
      { status: scoped.status },
    );
  }
  const doc = scoped.doc;

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
  let guardrailRejected = 0;

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
    const normalizedSteps = normalizeSteps(legs);
    const patchedStats = computeStepStats(normalizedSteps);
    const originalStats = getOriginalSegmentStats(doc, plan);

    const distanceRatio =
      originalStats.distanceM > 0 ? patchedStats.distanceM / originalStats.distanceM : 1;
    const stepRatio =
      originalStats.stepCount > 0 ? patchedStats.stepCount / originalStats.stepCount : 1;
    const directODM =
      origin && destination ? haversineM(origin, destination) : 0;
    const detourVsDirect =
      directODM > 0 ? patchedStats.distanceM / directODM : 1;
    const tooLong = originalStats.distanceM >= 250 && distanceRatio > 2.2;
    const tooManySteps = originalStats.stepCount >= 2 && stepRatio > 3.0;
    const absurdDetour = directODM >= 200 && detourVsDirect > 3.0;

    if (tooLong || tooManySteps || absurdDetour) {
      guardrailRejected += 1;
      const reason = tooLong
        ? "distance_ratio"
        : tooManySteps
        ? "step_ratio"
        : "detour_vs_direct";
      patchedSegments.push({
        clusterIdx: plan.clusterIdx,
        origin,
        destination,
        waypoints,
        google: {
          status: "REJECTED_GUARDRAIL",
          reason,
          distanceRatio,
          stepRatio,
          detourVsDirect,
          overviewPolyline: null,
          densePath: [],
          steps: [],
        },
      });
      continue;
    }

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
        steps: normalizedSteps,
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
    meta: { patchedCount: uiSegments.length, guardrailRejected },
  });
}
