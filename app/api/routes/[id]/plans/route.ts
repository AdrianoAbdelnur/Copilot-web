import { connectDB } from "@/lib/db";
import { loadRouteDocOrThrow, buildPlans, buildClusters } from "@/lib/routeRepair";
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

  const body = await req.json().catch(() => ({} as any));
  const gapIdx = Math.max(1, Math.floor(Number(body?.gapIdx ?? 8)));
  const maxWaypoints = Math.max(0, Math.min(23, Math.floor(Number(body?.maxWaypoints ?? 23))));

  const rev = await RouteRevision.findOne({ routeId: doc._id })
    .sort({ version: -1 });

  if (!rev?.matchReport) {
    return Response.json(
      { ok: false, message: "No hay matchReport en revisiones. Ejecutá /match primero." },
      { status: 400 }
    );
  }

  const report = rev.matchReport;

  const clusters = buildClusters(report, gapIdx);

  const plansRes = buildPlans({
    doc,
    report,
    gapIdx,
    maxWaypoints,
  });

  if (!plansRes.ok) {
    return Response.json({ ok: false, message: plansRes.message }, { status: 400 });
  }

  rev.stage = "plan";
  rev.params = {
    ...(rev.params ?? {}),
    corridorM: rev.params?.corridorM ?? doc?.meta?.corridorM ?? 25,
    gapIdx,
  };

  rev.clusters = {
    gapIdx,
    count: clusters?.length ?? 0,
    items: clusters,
  };

  rev.plan = {
    gapIdx,
    maxWaypoints,
    count: plansRes.plans?.length ?? 0,
    items: plansRes.plans,
  };

  rev.markModified("clusters");
  rev.markModified("plan");
  rev.markModified("params");

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
    gapIdx,
    clusters,
    plans: plansRes.plans,
    meta: { corridorM: rev.params?.corridorM ?? 25, maxWaypoints },
  });
}
