import { connectDB } from "@/lib/db";
import Route from "@/models/RouteMap";
import { parseKmlToPolicyPack } from "@/lib/policy/parseKml";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await connectDB();

  const body = await req.json();
  const title = String(body?.title ?? "route 1").trim();
  const kml = String(body?.kml ?? "").trim();

  if (!title) {
    return Response.json({ ok: false, message: "title requerido" }, { status: 400 });
  }

  const policyPack = kml ? parseKmlToPolicyPack(kml) : null;

  const created = await Route.create({
    title,
    kml: kml || null,
    policyPack,
  });

  return Response.json({
    ok: true,
    id: String(created._id),
    summary: policyPack
      ? {
          routePoints: policyPack.route.length,
          zones: policyPack.zones.length,
          pois: policyPack.pois.length,
        }
      : null,
  });
}

export async function GET() {
  await connectDB();

  const items = await Route.find({})
    .select("title createdAt updatedAt nav")
    .sort({ createdAt: -1 })
    .lean();

  return Response.json({ ok: true, items });
}
