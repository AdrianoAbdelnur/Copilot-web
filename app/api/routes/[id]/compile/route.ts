import { connectDB } from "@/lib/db";
import Route from "@/models/RouteMap";
import { computeTotalsFromSteps } from "@/lib/routeRepair";

export const runtime = "nodejs";

type LatLng = { latitude: number; longitude: number };

function decodePolyline(encoded: string): LatLng[] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const out: LatLng[] = [];

  while (index < len) {
    let b = 0;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    out.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return out;
}

const pickAnchors = (route: LatLng[], maxAnchors: number) => {
  if (!route?.length) return [];
  if (route.length <= maxAnchors) return route;

  const out: LatLng[] = [];
  const step = (route.length - 1) / (maxAnchors - 1);

  for (let i = 0; i < maxAnchors; i++) {
    const idx = Math.round(i * step);
    out.push(route[Math.min(idx, route.length - 1)]);
  }

  return out;
};

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  await connectDB();

  const { id } = await ctx.params;

  const doc = await Route.findById(id);
  if (!doc) {
    return Response.json({ ok: false, message: "Route no encontrada" }, { status: 404 });
  }

  const policyRoute: LatLng[] = doc.policyPack?.route ?? [];
  if (policyRoute.length < 2) {
    return Response.json(
      { ok: false, message: "La route no tiene policyPack.route (min 2 puntos)" },
      { status: 400 }
    );
  }

  const hasRouteBuilderGoogle =
    doc.google?.source === "routebuilder_directions" &&
    Array.isArray(doc.google?.densePath) &&
    doc.google.densePath.length >= 2;

  if (hasRouteBuilderGoogle) {
    doc.nav.compiledAt = new Date();
    doc.nav.status = "ready";
    await doc.save();

    return Response.json({
      ok: true,
      id: String(doc._id),
      skipped: true,
      reason: "routebuilder_geometry_preserved",
      anchorsCount: doc.meta?.anchorsCount ?? 0,
      totals: doc.google?.totals ?? { distanceM: 0, durationS: 0, distanceKm: 0, durationMin: 0 },
      summary: {
        legs: null,
        steps: Array.isArray(doc.google?.steps) ? doc.google.steps.length : 0,
        densePoints: Array.isArray(doc.google?.densePath) ? doc.google.densePath.length : 0,
        overviewPolyline: Boolean(doc.google?.overviewPolyline),
      },
    });
  }

  const anchors = pickAnchors(policyRoute, 23);
  const origin = anchors[0];
  const destination = anchors[anchors.length - 1];
  const via = anchors.slice(1, -1);

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Response.json({ ok: false, message: "Falta GOOGLE_MAPS_API_KEY" }, { status: 500 });
  }

  const wp =
    via.length > 0
      ? "&waypoints=" + via.map((p) => `via:${p.latitude},${p.longitude}`).join("|")
      : "";

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}` +
    `&mode=driving&language=es&key=${key}` +
    wp;

  const r = await fetch(url);
  const json = await r.json();

  if (!json.routes?.length) {
    doc.nav.status = "failed";
    doc.google = {
      source: "directions_v1",
      fetchedAt: new Date(),
      overviewPolyline: null,
      steps: [],
      densePath: [],
      totals: { distanceM: 0, durationS: 0, distanceKm: 0, durationMin: 0 },
    };
    await doc.save();
    return Response.json(
      { ok: false, message: "Google no devolvió rutas", raw: json },
      { status: 400 }
    );
  }

  const legs = json.routes[0].legs ?? [];

  const steps = legs.flatMap((leg: any) =>
    (leg.steps ?? []).map((s: any) => ({
      distance: s.distance ?? null,
      duration: s.duration ?? null,
      html_instructions: s.html_instructions ?? "",
      start_location: { latitude: s.start_location.lat, longitude: s.start_location.lng },
      end_location: { latitude: s.end_location.lat, longitude: s.end_location.lng },
      maneuver: s.maneuver ?? null,
      polyline: s.polyline?.points ?? null,
    }))
  );

  const densePath: LatLng[] = [];
  for (const st of steps) {
    if (!st.polyline) continue;
    densePath.push(...decodePolyline(st.polyline));
  }

  const totals = computeTotalsFromSteps(steps);

  doc.google = {
    source: "directions_v1",
    fetchedAt: new Date(),
    overviewPolyline: json.routes[0].overview_polyline?.points ?? null,
    steps,
    densePath,
    totals,
  };

  doc.meta.anchorsCount = anchors.length;
  doc.nav.compiledAt = new Date();
  doc.nav.status = "ready";

  await doc.save();

  return Response.json({
    ok: true,
    id: String(doc._id),
    anchorsCount: anchors.length,
    totals,
    summary: {
      legs: legs.length,
      steps: steps.length,
      densePoints: densePath.length,
      overviewPolyline: !!doc.google.overviewPolyline,
    },
  });
}
