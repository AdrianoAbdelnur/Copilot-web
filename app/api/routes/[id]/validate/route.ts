import { connectDB } from "@/lib/db";
import Route from "@/models/RouteMap";
import RouteRevision from "@/models/RouteRevision";
import { buildMatchReport, computeTotalsFromSteps } from "@/lib/routeRepair";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function serializeMongo(value: any): any {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map(serializeMongo);

  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeMongo(v);
    return out;
  }

  return value;
}

export async function GET(req: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;

  const doc = await Route.findById(id).lean();
  if (!doc) {
    return Response.json({ ok: false, message: "Route no encontrada" }, { status: 404 });
  }

  return Response.json({ ok: true, id: String(doc._id), route: doc });
}

export async function POST(req: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;

  const doc = await Route.findById(id);
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

  const candGoogle = rev.google;
  if (!candGoogle?.steps?.length || !candGoogle?.densePath?.length) {
    return Response.json(
      { ok: false, message: "La revision no tiene google candidato. Ejecutá /merge primero." },
      { status: 400 }
    );
  }

  const fake = doc.toObject();
  (fake as any).google = {
    source: candGoogle.source ?? "candidate",
    fetchedAt: new Date(),
    overviewPolyline: candGoogle.overviewPolyline ?? null,
    steps: candGoogle.steps ?? [],
    densePath: candGoogle.densePath ?? [],
  };

  const r = buildMatchReport(fake as any);
  if (!r.ok) {
    return Response.json({ ok: false, message: r.message }, { status: 400 });
  }

  const report = r.report;
  const matchPct = Number(report?.matchPct ?? 0);
  const outCount = Number(report?.outOfCorridorPoints?.length ?? 0);

  const pass = matchPct >= 99.999 && outCount === 0;

  if (pass) {
    const totals = computeTotalsFromSteps(candGoogle.steps ?? []);

    doc.google = {
      source: candGoogle.source ?? "candidate",
      fetchedAt: new Date(),
      overviewPolyline: candGoogle.overviewPolyline ?? null,
      steps: candGoogle.steps ?? [],
      densePath: candGoogle.densePath ?? [],
      totals,
    };

    doc.nav = doc.nav ?? ({} as any);

    doc.nav.validate = {
      validatedAt: new Date(),
      matchPct,
      outCount,
      pass: true,
      promoted: true,
    };
    doc.markModified("nav.validate");

    doc.nav.status = "ready";
    doc.nav.compiledAt = new Date();
    doc.meta.corridorM = r.corridorM;

    await doc.save();

    rev.stage = "final";
    rev.note = "validated 100% -> promoted";
    rev.markModified("stage");
    rev.markModified("note");
    await rev.save();

    return Response.json({
      ok: true,
      id: String(doc._id),
      validated: { pass: true, promoted: true, matchPct, outCount },
      totals,
      meta: { corridorM: r.corridorM },
    });
  }

  const last = await RouteRevision.findOne({ routeId: doc._id })
    .sort({ version: -1 })
    .select({ version: 1 });

  const nextVersion = (last?.version ?? 0) + 1;

  const newRev = await RouteRevision.create({
    routeId: doc._id,
    version: nextVersion,
    stage: "match",
    params: {
      corridorM: r.corridorM,
      gapIdx: rev?.params?.gapIdx ?? 8,
    },
    base: {
      kind: "revision",
      revisionId: rev._id,
    },
    google: {
      source: candGoogle.source ?? "candidate",
      overviewPolyline: candGoogle.overviewPolyline ?? null,
      steps: candGoogle.steps ?? [],
      densePath: candGoogle.densePath ?? [],
    },
    matchReport: report,
    clusters: null,
    plan: null,
  });

  return Response.json({
    ok: true,
    id: String(doc._id),
    validated: { pass: false, promoted: false, matchPct, outCount },
    newRevision: {
      id: String(newRev._id),
      version: newRev.version,
      stage: newRev.stage,
      createdAt: newRev.createdAt,
      baseVersion: rev.version,
    },
    report,
    meta: { corridorM: r.corridorM },
  });
}
