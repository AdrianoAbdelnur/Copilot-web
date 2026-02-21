"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps/loader";

type LatLng = { latitude: number; longitude: number };

type TripEventItem = {
  _id?: string;
  type?: string;
  pos?: LatLng;
  t?: string;
};

function toPoint(p: LatLng) {
  return { lat: Number(p.latitude), lng: Number(p.longitude) };
}

function markerColorByType(type: string) {
  if (type === "trip_start") return "#16a34a";
  if (type === "trip_end") return "#dc2626";
  if (type.includes("offroute")) return "#b45309";
  if (type.includes("speed_over")) return "#ea580c";
  if (type.includes("poi")) return "#2563eb";
  return "#334155";
}

export default function TripPlaybackMap({
  routePath,
  samplePath,
  events,
}: {
  routePath: LatLng[];
  samplePath: LatLng[];
  events: TripEventItem[];
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [showEvents, setShowEvents] = useState(true);

  const routePts = useMemo(() => (routePath || []).map(toPoint), [routePath]);
  const samplePts = useMemo(() => (samplePath || []).map(toPoint), [samplePath]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) return;

    loadGoogleMaps(key)
      .then(() => setReady(true))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!mapDivRef.current) return;
    if (!window.google?.maps) return;

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: -26.8318, lng: -65.2194 },
        zoom: 7,
        mapTypeId: "roadmap",
      });
    }
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const o of overlaysRef.current) o.setMap?.(null);
    overlaysRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    const extend = (p: { lat: number; lng: number }) => bounds.extend(p);

    const addPolyline = (path: { lat: number; lng: number }[], color: string, weight: number, opacity: number) => {
      if (path.length < 2) return;
      const pl = new window.google.maps.Polyline({
        path,
        geodesic: true,
        strokeOpacity: opacity,
        strokeWeight: weight,
        strokeColor: color,
      });
      pl.setMap(map);
      overlaysRef.current.push(pl);
      for (const p of path) extend(p);
    };

    const addMarker = (pos: { lat: number; lng: number }, color: string, title?: string, scale = 5) => {
      const m = new window.google.maps.Marker({
        position: pos,
        map,
        title,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#0f172a",
          strokeWeight: 1,
        },
      });
      overlaysRef.current.push(m);
      extend(pos);
    };

    if (showRoute) addPolyline(routePts, "#2563eb", 4, 0.85);
    if (showSamples) addPolyline(samplePts, "#dc2626", 4, 0.9);

    if (samplePts.length > 0) {
      addMarker(samplePts[0], "#16a34a", "Trip start", 6);
      addMarker(samplePts[samplePts.length - 1], "#dc2626", "Trip end", 6);
    }

    if (showEvents) {
      for (const e of events || []) {
        if (!e?.pos) continue;
        const pos = toPoint(e.pos);
        if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) continue;
        addMarker(pos, markerColorByType(String(e.type || "custom")), `${e.type || "event"} ${e.t || ""}`, 4);
      }
    }

    if (!bounds.isEmpty()) map.fitBounds(bounds);
  }, [events, routePts, samplePts, showEvents, showRoute, showSamples]);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: 10, fontSize: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} />
          Ruta planificada (azul)
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showSamples} onChange={(e) => setShowSamples(e.target.checked)} />
          Recorrido real (rojo)
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
          Eventos
        </label>
      </div>
      <div ref={mapDivRef} style={{ width: "100%", height: 520 }} />
    </div>
  );
}

