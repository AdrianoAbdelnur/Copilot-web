import { connectDB } from "@/lib/db";
import RouteRevision from "@/models/RouteRevision";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type LatLng = { latitude: number; longitude: number };

type Step = {
  distance?: any;
  duration?: any;

  start_location: LatLng;
  end_location: LatLng;

  html_instructions?: string;
  maneuver?: string | null;
  polyline?: string | null;
};

type PatchPayload = {
  originalDensePath: LatLng[];
  originalSteps: Step[];
  patches: Array<{
    clusterIdx: number;
    stepIdxStart: number;
    stepIdxEnd: number;
    patchedPath: LatLng[];
    patchedSteps: Step[];
  }>;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function haversineM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestDenseIndexByPoint(densePath: LatLng[], p: LatLng) {
  let bestIdx = 0;
  let best = Infinity;

  for (let i = 0; i < densePath.length; i++) {
    const d = haversineM(densePath[i], p);
    if (d < best) {
      best = d;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function mergeSteps(originalSteps: Step[], patches: PatchPayload["patches"]) {
  const safePatches = patches
    .filter(
      (p) =>
        Number.isFinite(p.stepIdxStart) &&
        Number.isFinite(p.stepIdxEnd) &&
        Array.isArray(p.patchedSteps)
    )
    .map((p) => ({
      ...p,
      stepIdxStart: Math.floor(p.stepIdxStart),
      stepIdxEnd: Math.floor(p.stepIdxEnd),
    }))
    .sort((a, b) => b.stepIdxStart - a.stepIdxStart);

  let out = [...originalSteps];

  for (const p of safePatches) {
    const a = clamp(Math.min(p.stepIdxStart, p.stepIdxEnd), 0, out.length - 1);
    const b = clamp(Math.max(p.stepIdxStart, p.stepIdxEnd), 0, out.length - 1);

    const prefix = out.slice(0, a);
    const suffix = out.slice(b + 1);

    out = [...prefix, ...(p.patchedSteps ?? []), ...suffix];
  }

  return out;
}

function mergeDensePath(originalDensePath: LatLng[], patches: PatchPayload["patches"]) {
  const safePatches = patches
    .filter((p) => Array.isArray(p.patchedPath) && p.patchedPath.length >= 2)
    .map((p) => {
      const first = p.patchedPath[0];
      const last = p.patchedPath[p.patchedPath.length - 1];

      const iA = nearestDenseIndexByPoint(originalDensePath, first);
      const iB = nearestDenseIndexByPoint(originalDensePath, last);

      const a = Math.min(iA, iB);
      const b = Math.max(iA, iB);

      return {
        clusterIdx: p.clusterIdx,
        cutStart: a,
        cutEnd: b,
        patchedPath: p.patchedPath,
      };
    })
    .sort((a, b) => b.cutStart - a.cutStart);

  let out = [...originalDensePath];

  for (const p of safePatches) {
    const a = clamp(p.cutStart, 0, out.length - 1);
    const b = clamp(p.cutEnd, 0, out.length - 1);

    const prefix = out.slice(0, a);
    const suffix = out.slice(b + 1);

    out = [...prefix, ...p.patchedPath, ...suffix];
  }

  return out;
}

export async function POST(req: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as PatchPayload | null;

  if (!body) {
    return Response.json({ ok: false, message: "Body inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.originalDensePath) || body.originalDensePath.length < 2) {
    return Response.json({ ok: false, message: "originalDensePath inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.originalSteps) || body.originalSteps.length < 2) {
    return Response.json({ ok: false, message: "originalSteps inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.patches) || body.patches.length === 0) {
    return Response.json({ ok: false, message: "patches vacío" }, { status: 400 });
  }

  const rev = await RouteRevision.findOne({ routeId: id }).sort({ version: -1 });
  if (!rev) {
    return Response.json(
      { ok: false, message: "No existe RouteRevision. Ejecutá /match primero." },
      { status: 400 }
    );
  }

  const mergedSteps = mergeSteps(body.originalSteps, body.patches);
  const mergedDensePath = mergeDensePath(body.originalDensePath, body.patches);

  rev.stage = "candidate";
  rev.note = `merge preview patches=${body.patches.length}`;

  rev.google = {
    source: "merge_preview",
    overviewPolyline: rev.google?.overviewPolyline ?? null,
    steps: mergedSteps as any,
    densePath: mergedDensePath as any,
  };

  rev.markModified("google");
  rev.markModified("stage");
  rev.markModified("note");

  await rev.save();

  return Response.json({
    ok: true,
    routeId: id,
    revision: {
      id: String(rev._id),
      version: rev.version,
      stage: rev.stage,
      createdAt: rev.createdAt,
    },
    merged: {
      densePath: mergedDensePath,
      steps: mergedSteps,
    },
    summary: {
      originalSteps: body.originalSteps.length,
      mergedSteps: mergedSteps.length,
      originalDensePath: body.originalDensePath.length,
      mergedDensePath: mergedDensePath.length,
      patches: body.patches.length,
    },
  });
}
