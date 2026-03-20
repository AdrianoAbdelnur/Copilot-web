import { connectDB } from "@/lib/db";
import Route from "@/models/RouteMap";
import { getTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;
  console.log("GET validate", { id });

  if (!/^[a-fA-F0-9]{24}$/.test(String(id))) {
    return Response.json({ ok: false, message: "ID de ruta invalido" }, { status: 400 });
  }

  const tenantContext = await getTenantContext(req);
  if (!tenantContext.ok) {
    return Response.json(
      { ok: false, error: tenantContext.error, message: tenantContext.message },
      { status: tenantContext.status },
    );
  }
  const doc = await Route.findOne({ _id: id, companyId: tenantContext.tenantId }).lean();
  if (!doc) {
    return Response.json({ ok: false, message: "Route no encontrada" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    id: String(doc._id),
    route: doc,
    tenant: { resolved: true, tenantId: tenantContext.tenantId, source: tenantContext.source },
  });
}
