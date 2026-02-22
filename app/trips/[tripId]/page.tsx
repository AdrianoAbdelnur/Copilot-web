"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TripPlaybackMap from "../TripPlaybackMap";

type LatLng = { latitude: number; longitude: number };

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

      if (item?.routeId) {
        const routeRes = await fetch(`/api/routes/${item.routeId}`);
        const routeJson = await routeRes.json().catch(() => ({}));
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

  const samplePath: LatLng[] = useMemo(
    () =>
      (samples || [])
        .map((sample) => sample?.pos)
        .filter((point) => point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))),
    [samples]
  );

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/trips" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", textDecoration: "none", color: "#111" }}>
          Volver a Viajes
        </Link>
        <button onClick={loadAll} disabled={loading} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}>
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
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Distancia: <b>{trip?.totals?.distanceM ?? 0}m</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Velocidad máxima: <b>{trip?.totals?.maxSpeedKmh ?? 0} km/h</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Muestras: <b>{trip?.totals?.samplesCount ?? samples.length}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Eventos: <b>{trip?.totals?.eventsCount ?? events.length}</b></div>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <TripPlaybackMap routePath={routePath} samplePath={samplePath} events={events} />
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
