"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TripPlaybackMap from "../TripPlaybackMap";

type LatLng = { latitude: number; longitude: number };

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const local = localStorage.getItem("token") || "";
  const cookieToken =
    document.cookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("token="))
      ?.split("=")[1] || "";
  const token = local || decodeURIComponent(cookieToken);
  return token ? { Authorization: token } : {};
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

  const samplePath: LatLng[] = useMemo(() => {
    return (samples || [])
      .map((s) => s?.pos)
      .filter((p) => p && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
  }, [samples]);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/trips" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", textDecoration: "none", color: "#111" }}>
          Volver a Trips
        </Link>
        <button onClick={loadAll} disabled={loading} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      <h1 style={{ marginTop: 12, marginBottom: 0 }}>Detalle de Viaje</h1>
      <div style={{ marginTop: 6, opacity: 0.8 }}>Trip ID: {tripId}</div>
      {error ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div> : null}

      {trip ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 8, marginTop: 12 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Status: <b>{trip.status}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Inicio: <b>{new Date(trip.startedAt).toLocaleString()}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Fin: <b>{trip.endedAt ? new Date(trip.endedAt).toLocaleString() : "-"}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Duración: <b>{trip?.totals?.durationS ?? 0}s</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Distance: <b>{trip?.totals?.distanceM ?? 0}m</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Max speed: <b>{trip?.totals?.maxSpeedKmh ?? 0} km/h</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Samples: <b>{trip?.totals?.samplesCount ?? samples.length}</b></div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>Events: <b>{trip?.totals?.eventsCount ?? events.length}</b></div>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <TripPlaybackMap routePath={routePath} samplePath={samplePath} events={events} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Eventos ({events.length})</h3>
          <div style={{ maxHeight: 280, overflow: "auto", display: "grid", gap: 6 }}>
            {events.map((e, i) => (
              <div key={e._id || i} style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, fontSize: 13 }}>
                <div><b>{e.type || "event"}</b></div>
                <div style={{ opacity: 0.8 }}>{e.t ? new Date(e.t).toLocaleString() : "-"}</div>
                <div style={{ opacity: 0.8 }}>
                  {e?.pos?.latitude ?? "-"}, {e?.pos?.longitude ?? "-"}
                </div>
              </div>
            ))}
            {events.length === 0 ? <div style={{ opacity: 0.7 }}>Sin eventos.</div> : null}
          </div>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Samples ({samples.length})</h3>
          <div style={{ maxHeight: 280, overflow: "auto", display: "grid", gap: 6 }}>
            {samples.slice(-300).map((s, i) => (
              <div key={s._id || i} style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, fontSize: 13 }}>
                <div>{s.t ? new Date(s.t).toLocaleString() : "-"}</div>
                <div style={{ opacity: 0.8 }}>
                  {s?.pos?.latitude ?? "-"}, {s?.pos?.longitude ?? "-"}
                </div>
                <div style={{ opacity: 0.8 }}>speed: {s?.speedKmh ?? "-"} km/h</div>
              </div>
            ))}
            {samples.length === 0 ? <div style={{ opacity: 0.7 }}>Sin samples.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
