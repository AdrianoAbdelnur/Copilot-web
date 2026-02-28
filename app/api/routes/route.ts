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

const parseGoogleDraft = (raw: unknown) => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as any;

  const densePath = parseRoutePoints(obj?.densePath);
  if (densePath.length < 2) return null;

  const stepsRaw = Array.isArray(obj?.steps) ? obj.steps : [];
  const steps = stepsRaw
    .map((step: unknown) => {
      if (!step || typeof step !== "object") return null;
      const start = parseRoutePoints([(step as any).start_location])[0] ?? null;
      const end = parseRoutePoints([(step as any).end_location])[0] ?? null;
      if (!start || !end) return null;
      return {
        distance: (step as any).distance ?? null,
        duration: (step as any).duration ?? null,
        html_instructions: String((step as any).html_instructions ?? ""),
        start_location: start,
        end_location: end,
        maneuver: typeof (step as any).maneuver === "string" ? (step as any).maneuver : null,
        polyline: typeof (step as any).polyline === "string" ? (step as any).polyline : null,
      };
    })
    .filter(Boolean);

  const distanceM = toFiniteNumber(obj?.totals?.distanceM) ?? 0;
  const durationS = toFiniteNumber(obj?.totals?.durationS) ?? 0;
  const distanceKm = toFiniteNumber(obj?.totals?.distanceKm) ?? distanceM / 1000;
  const durationMin = toFiniteNumber(obj?.totals?.durationMin) ?? durationS / 60;

  const fetchedAtRaw = obj?.fetchedAt;
  const fetchedAt =
    typeof fetchedAtRaw === "string" || fetchedAtRaw instanceof Date ? new Date(fetchedAtRaw) : new Date();

  return {
    source: typeof obj?.source === "string" ? obj.source : "routebuilder_directions",
    fetchedAt: Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt,
    overviewPolyline: typeof obj?.overviewPolyline === "string" ? obj.overviewPolyline : null,
    steps,
    densePath,
    totals: { distanceM, durationS, distanceKm, durationMin },
  };
};

export async function POST(req: Request) {
  await connectDB();

  const body = await req.json();
  const title = String(body?.title ?? "route 1").trim();
  const kml = String(body?.kml ?? "").trim();
  const routePoints = parseRoutePoints(body?.route);
  const googleDraft = parseGoogleDraft(body?.googleDraft);

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

  if (googleDraft) {
    payload.google = googleDraft;
    payload.nav = {
      status: "ready",
      compiledAt: new Date(),
      mode: "google_steps",
      validate: {
        validatedAt: null,
        matchPct: 0,
        outCount: 0,
        pass: false,
        promoted: false,
      },
    };
  }

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
