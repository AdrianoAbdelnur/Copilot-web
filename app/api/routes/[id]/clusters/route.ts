import { connectDB } from "@/lib/db";
import { loadRouteDocByScope, buildClusters } from "@/lib/routeRepair";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

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

  const body = await req.json().catch(() => ({} as any));
  const gapIdx = Math.max(1, Math.floor(Number(body?.gapIdx ?? 8)));

  const usePatched = Boolean(body?.usePatched ?? false);

  const report = usePatched
    ? doc.google?.patched?.matchReport
    : doc.google?.matchReport;

  if (!report) {
    return Response.json(
      { ok: false, message: "No hay matchReport guardado. Ejecutá /match primero." },
      { status: 400 }
    );
  }

  const clusters = buildClusters(report, gapIdx);

  return Response.json({
    ok: true,
    id: String(doc._id),
    gapIdx,
    usePatched,
    clusters,
  });
}
