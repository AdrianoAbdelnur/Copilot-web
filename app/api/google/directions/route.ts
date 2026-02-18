export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const { origin, destination, waypoints, debug } = body;

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Response.json({ ok: false, message: "Falta GOOGLE_MAPS_API_KEY" }, { status: 500 });
  }

  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) {
    return Response.json({ ok: false, message: "origin/destination inválidos" }, { status: 400 });
  }

  const wp =
    Array.isArray(waypoints) && waypoints.length
      ? "&waypoints=" + waypoints.map((p: any) => `via:${p.latitude},${p.longitude}`).join("|")
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
    return Response.json({ ok: false, message: "Sin rutas", raw: json }, { status: 400 });
  }

  const route0 = json.routes[0];
  const leg0 = route0.legs[0];

  const steps = leg0.steps.map((s: any) => ({
    distance: s.distance,
    duration: s.duration,
    html_instructions: s.html_instructions,
    start_location: { latitude: s.start_location.lat, longitude: s.start_location.lng },
    end_location: { latitude: s.end_location.lat, longitude: s.end_location.lng },
    maneuver: s.maneuver ?? null,
    polyline: s.polyline?.points ?? null,
  }));

  if (debug) {
    return Response.json({
      ok: true,
      url,
      overviewPolyline: route0.overview_polyline?.points ?? null,
      leg: leg0,
      steps,
      raw: json,
    });
  }

  return Response.json({ ok: true, steps });
}
