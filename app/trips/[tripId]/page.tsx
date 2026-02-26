"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TripPlaybackMap from "../TripPlaybackMap";

type LatLng = { latitude: number; longitude: number };

function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizeObjectId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const maybeId = (value as { _id?: unknown })._id;
    return typeof maybeId === "string" ? maybeId : "";
  }
  return "";
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const local = localStorage.getItem("token") || "";
  const cookieToken = document.cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith("token="))?.split("=")[1] || "";
  const token = local || decodeURIComponent(cookieToken);
  return token ? { Authorization: token } : {};
}

function eventTypeLabel(type?: string) {
  if (type === "trip_start") return "Inicio de viaje";
  if (type === "trip_end") return "Fin de viaje";
  if (type === "poi_enter") return "Ingreso a POI";
  if (type === "poi_exit") return "Salida de POI";
  if (type === "segment_enter") return "Ingreso a tramo";
  if (type === "segment_exit") return "Salida de tramo";
  if (type === "step_change") return "Cambio de paso";
  if (type === "speed_over_start") return "Inicio exceso de velocidad";
  if (type === "speed_over_end") return "Fin exceso de velocidad";
  if (type === "offroute_start") return "Inicio fuera de ruta";
  if (type === "offroute_end") return "Fin fuera de ruta";
  if (type === "custom") return "Evento personalizado";
  return type || "evento";
}

function tripStatusLabel(status?: string) {
  if (status === "active") return "activo";
  if (status === "paused") return "pausado";
  if (status === "finished") return "finalizado";
  if (status === "aborted") return "abortado";
  return status || "-";
}

export default function TripDetailPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = String(params?.tripId || "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trip, setTrip] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [samples, setSamples] = useState<any[]>([]);
  const [routeDoc, setRouteDoc] = useState<any>(null);

  const loadAll = async () => {
    if (!tripId) return;
    setLoading(true);
    setError("");
    try {
      const [tripRes, eventsRes, samplesRes] = await Promise.all([
        fetch(`/api/trips/${tripId}`, { headers: authHeaders() }),
        fetch(`/api/trips/${tripId}/events?limit=2000`, { headers: authHeaders() }),
        fetch(`/api/trips/${tripId}/samples?limit=5000`, { headers: authHeaders() }),
      ]);

      const tripJson = await tripRes.json().catch(() => ({}));
      const eventsJson = await eventsRes.json().catch(() => ({}));
      const samplesJson = await samplesRes.json().catch(() => ({}));

      if (!tripRes.ok || !tripJson?.ok) {
        setError(tripJson?.error || "No se pudo cargar el viaje.");
        return;
      }

      const item = tripJson.item;
      setTrip(item);
      setEvents(eventsJson?.items || []);
      setSamples(samplesJson?.items || []);

      const routeId = normalizeObjectId(item?.routeId);
      if (routeId) {
        const routeRes = await fetch(`/api/routes/${routeId}`);
        const routeJson = await routeRes.json().catch(() => ({}));
        console.log("routeJson", routeJson);
        setRouteDoc(routeJson?.route ?? null);
      } else {
        setRouteDoc(null);
      }
    } catch {
      setError("Error de red cargando detalle.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [tripId]);

  const routePath: LatLng[] = useMemo(() => {
    const dense = routeDoc?.google?.densePath;
    return Array.isArray(dense) ? dense : [];
  }, [routeDoc]);

  const policyRoutePath: LatLng[] = useMemo(() => {
    const line = routeDoc?.policyPack?.route?.line;
    if (Array.isArray(line)) {
      return line
        .map((p: any) => {
          const lat = Number(p?.latitude ?? p?.lat);
          const lng = Number(p?.longitude ?? p?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return { latitude: lat, longitude: lng };
        })
        .filter(Boolean) as LatLng[];
    }
    return [];
  }, [routeDoc]);

  const plannedPois = useMemo(() => {
    const pois = routeDoc?.policyPack?.pois;
    return Array.isArray(pois) ? pois : [];
  }, [routeDoc]);

  const plannedSegments = useMemo(() => {
    const segments = routeDoc?.policyPack?.segments;
    return Array.isArray(segments) ? segments : [];
  }, [routeDoc]);

  const samplePath: LatLng[] = useMemo(
    () =>
      [...(samples || [])]
        .sort((a, b) => {
          const aMs = a?.t ? Date.parse(String(a.t)) : Number.NaN;
          const bMs = b?.t ? Date.parse(String(b.t)) : Number.NaN;
          if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) return aMs - bMs;
          const aSeq = Number(a?.seq);
          const bSeq = Number(b?.seq);
          if (Number.isFinite(aSeq) && Number.isFinite(bSeq) && aSeq !== bSeq) return aSeq - bSeq;
          return 0;
        })
        .map((sample) => sample?.pos)
        .filter((point) => point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))),
    [samples]
  );

  const realDistanceM = useMemo(() => {
    if (samplePath.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < samplePath.length; i += 1) {
      total += haversineMeters(samplePath[i - 1], samplePath[i]);
    }
    return Math.round(total);
  }, [samplePath]);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui", color: "var(--foreground)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Link
          href="/trips"
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            textDecoration: "none",
            color: "var(--foreground)",
          }}
        >
          Volver a Viajes
        </Link>
        <button
          onClick={loadAll}
          disabled={loading}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--foreground)",
          }}
        >
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      <h1 style={{ marginTop: 12, marginBottom: 0 }}>Detalle de Viaje</h1>
      <div style={{ marginTop: 6, opacity: 0.8 }}>ID de viaje: {tripId}</div>
      {error ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div> : null}

      {trip ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 8, marginTop: 12 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Estado: <b>{tripStatusLabel(trip.status)}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Inicio: <b>{new Date(trip.startedAt).toLocaleString()}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Fin: <b>{trip.endedAt ? new Date(trip.endedAt).toLocaleString() : "-"}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Duración: <b>{trip?.totals?.durationS ?? 0}s</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
            Distancia: <b>{realDistanceM || trip?.totals?.distanceM || 0}m</b>
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Velocidad máxima: <b>{trip?.totals?.maxSpeedKmh ?? 0} km/h</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Muestras: <b>{trip?.totals?.samplesCount ?? samples.length}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Eventos: <b>{trip?.totals?.eventsCount ?? events.length}</b></div>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <TripPlaybackMap
          routePath={routePath}
          samplePath={samplePath}
          events={events}
          samples={samples}
          plannedPois={plannedPois}
          plannedSegments={plannedSegments}
          segmentBasePath={policyRoutePath}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Eventos ({events.length})</h3>
          <div style={{ maxHeight: 280, overflow: "auto", display: "grid", gap: 6 }}>
            {events.map((event, i) => (
              <div key={event._id || i} style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, fontSize: 13 }}>
                <div><b>{eventTypeLabel(event.type)}</b></div>
                <div style={{ opacity: 0.8 }}>{event.t ? new Date(event.t).toLocaleString() : "-"}</div>
                <div style={{ opacity: 0.8 }}>{event?.pos?.latitude ?? "-"}, {event?.pos?.longitude ?? "-"}</div>
              </div>
            ))}
            {events.length === 0 ? <div style={{ opacity: 0.7 }}>Sin eventos.</div> : null}
          </div>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Muestras ({samples.length})</h3>
          <div style={{ maxHeight: 280, overflow: "auto", display: "grid", gap: 6 }}>
            {samples.slice(-300).map((sample, i) => (
              <div key={sample._id || i} style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, fontSize: 13 }}>
                <div>{sample.t ? new Date(sample.t).toLocaleString() : "-"}</div>
                <div style={{ opacity: 0.8 }}>{sample?.pos?.latitude ?? "-"}, {sample?.pos?.longitude ?? "-"}</div>
                <div style={{ opacity: 0.8 }}>velocidad: {sample?.speedKmh ?? "-"} km/h</div>
              </div>
            ))}
            {samples.length === 0 ? <div style={{ opacity: 0.7 }}>Sin muestras.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
