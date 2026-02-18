import { connectDB } from "@/lib/db";
import Route from "@/models/RouteMap";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  await connectDB();
  const { id } = await ctx.params;
  console.log("GET validate", { id });

  const doc = await Route.findById(id).lean();
  if (!doc) {
    return Response.json({ ok: false, message: "Route no encontrada" }, { status: 404 });
  }

  return Response.json({ ok: true, id: String(doc._id), route: doc });
}