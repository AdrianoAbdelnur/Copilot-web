import { connectDB } from "@/lib/db";
import { loadRouteDocByScope } from "@/lib/routeRepair";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;
  console.log("GET validate", { id });

  if (!/^[a-fA-F0-9]{24}$/.test(String(id))) {
    return Response.json({ ok: false, message: "ID de ruta invalido" }, { status: 400 });
  }

  const scoped = await loadRouteDocByScope(req, id);
  if (!scoped.ok) {
    return Response.json(
      { ok: false, error: scoped.error, message: scoped.message },
      { status: scoped.status },
    );
  }
  const doc = scoped.doc.toObject ? scoped.doc.toObject() : scoped.doc;

  return Response.json({
    ok: true,
    id: String(doc._id),
    route: doc,
    tenant: scoped.isSuperAdmin
      ? { resolved: false, scope: "all_companies", source: "superadmin" }
      : { resolved: true, tenantId: scoped.tenantId, source: "tenant_scope" },
  });
}
