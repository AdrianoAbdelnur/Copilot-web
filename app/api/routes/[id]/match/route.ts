import { connectDB } from "@/lib/db";
import { loadRouteDocOrThrow, buildMatchReport } from "@/lib/routeRepair";
import RouteRevision from "@/models/RouteRevision";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;

  const doc = await loadRouteDocOrThrow(id);
  if (!doc) {
    return Response.json({ ok: false, message: "Route no encontrada" }, { status: 404 });
  }

  const r = buildMatchReport(doc);
  if (!r.ok) {
    return Response.json({ ok: false, message: r.message }, { status: 400 });
  }

  const matchPct = Number(r.report?.matchPct ?? 0);
  const outCount = Number(r.report?.outOfCorridorPoints?.length ?? 0);
  const reverseMatchPct = Number(r.report?.googleToPolicy?.matchPct ?? r.report?.matchPct ?? 0);
  const reverseOutCount = Number(r.report?.reverseOutOfCorridorPoints?.length ?? 0);
  const isPerfect =
    matchPct >= 99.999 &&
    reverseMatchPct >= 99.999 &&
    outCount === 0 &&
    reverseOutCount === 0;

  doc.meta.corridorM = r.corridorM;

  doc.nav.validate = {
    validatedAt: new Date(),
    matchPct,
    outCount,
    pass: isPerfect,
    promoted: isPerfect,
  };
  doc.markModified("nav.validate");

  doc.google = doc.google ?? ({} as any);
  doc.google.matchReport = r.report;
  doc.markModified("google.matchReport");

  const last = await RouteRevision.findOne({ routeId: doc._id }).sort({ version: -1 }).select({ version: 1 });
  const version = (last?.version ?? 0) + 1;

  const rev = await RouteRevision.create({
    routeId: doc._id,
    version,
    stage: isPerfect ? "final" : "match",
    params: { corridorM: r.corridorM, gapIdx: 8 },
    base: { kind: "google", revisionId: null },

    google: {
      source: doc.google?.source ?? "directions_v1",
      overviewPolyline: doc.google?.overviewPolyline ?? null,
      steps: doc.google?.steps ?? [],
      densePath: doc.google?.densePath ?? [],
    },

    matchReport: r.report,
    clusters: null,
    plan: null,
  });

  await doc.save();

  return Response.json({
    ok: true,
    id: String(doc._id),
    created: true,
    revision: {
      id: String(rev._id),
      version,
      stage: rev.stage,
      createdAt: rev.createdAt,
    },
    validate: doc.nav.validate,
    report: r.report,
    meta: { corridorM: r.corridorM },
  });
}
