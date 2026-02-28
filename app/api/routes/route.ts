import { connectDB } from "@/lib/db";
import Route from "@/models/RouteMap";
import { parseKmlToPolicyPack } from "@/lib/policy/parseKml";
import type { PolicyPack } from "@/lib/policy/types";

export const runtime = "nodejs";

const toFiniteNumber = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseRoutePoints = (raw: unknown) => {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ latitude: number; longitude: number }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const lat = toFiniteNumber((item as any).latitude ?? (item as any).lat);
    const lng = toFiniteNumber((item as any).longitude ?? (item as any).lng);
    if (lat == null || lng == null) continue;
    out.push({ latitude: lat, longitude: lng });
  }
  return out;
};

export async function POST(req: Request) {
  await connectDB();

  const body = await req.json();
  const title = String(body?.title ?? "route 1").trim();
  const kml = String(body?.kml ?? "").trim();
  const routePoints = parseRoutePoints(body?.route);

  if (!title) {
    return Response.json({ ok: false, message: "title requerido" }, { status: 400 });
  }

  let policyPack: PolicyPack | null = null;
  if (kml) {
    policyPack = parseKmlToPolicyPack(kml);
  } else if (routePoints.length >= 2) {
    policyPack = {
      version: 1,
      route: routePoints,
      zones: [],
      pois: [],
    };
  } else {
    return Response.json({ ok: false, message: "kml o route requerido" }, { status: 400 });
  }

  const payload: any = {
    title,
    kml: kml || null,
    policyPack,
  };

  const created = await Route.create(payload);

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
