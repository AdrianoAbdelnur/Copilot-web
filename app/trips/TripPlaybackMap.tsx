"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps/loader";

type LatLng = { latitude: number; longitude: number };

type TripEventItem = {
  _id?: string;
  type?: string;
  pos?: LatLng;
  t?: string;
  seq?: number;
  segment?: {
    segmentId?: unknown;
    name?: string | null;
    type?: string | null;
  } | null;
};

type TripSampleItem = {
  _id?: string;
  pos?: LatLng;
  t?: string;
  seq?: number;
  speedKmh?: number | null;
};

type PlannedPoi = {
  id?: string;
  name?: string;
  message?: string;
  radiusM?: number;
  point?: LatLng | { lat?: number; lng?: number };
  pos?: LatLng | { lat?: number; lng?: number };
  center?: LatLng | { lat?: number; lng?: number };
};

type PlannedSegment = {
  id?: string;
  name?: string;
  type?: string;
  speedLimitKmh?: number;
  maxSpeed?: number;
  line?: unknown[];
  path?: unknown[];
  points?: unknown[];
  fromIdx?: number;
  toIdx?: number;
  idxA?: number;
  idxB?: number;
  aIdx?: number;
  bIdx?: number;
  a?: { idx?: number };
  b?: { idx?: number };
  vmax?: number;
};

type TimedTrackPoint = {
  kind: "sample" | "event";
  idx: number;
  tMs: number;
  seq: number;
  pos: LatLng;
};

type SpeedOverInterval = {
  startMs: number;
  endMs: number;
  path: { lat: number; lng: number }[];
  peakPos: { lat: number; lng: number } | null;
};

type SegmentInterval = {
  path: { lat: number; lng: number }[];
  color: string;
};

function toPoint(point: LatLng) {
  return { lat: Number(point.latitude), lng: Number(point.longitude) };
}

function toAnyPoint(point: unknown): { lat: number; lng: number } | null {
  if (!point || typeof point !== "object") return null;
  const p = point as Record<string, unknown>;
  const lat = Number(p.latitude ?? p.lat);
  const lng = Number(p.longitude ?? p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function markerColorByType(type: string) {
  if (type === "trip_start") return "#16a34a";
  if (type === "trip_end") return "#dc2626";
  if (type.includes("offroute")) return "#b45309";
  if (type.includes("speed_over")) return "#dc2626";
  if (type.includes("poi")) return "#2563eb";
  return "#334155";
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

export default function TripPlaybackMap({
  routePath,
  samplePath,
  events,
  samples = [],
  plannedPois = [],
  plannedSegments = [],
  segmentBasePath = [],
}: {
  routePath: LatLng[];
  samplePath: LatLng[];
  events: TripEventItem[];
  samples?: TripSampleItem[];
  plannedPois?: PlannedPoi[];
  plannedSegments?: PlannedSegment[];
  segmentBasePath?: LatLng[];
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showPlannedPois, setShowPlannedPois] = useState(true);

  const routePts = useMemo(() => (routePath || []).map(toPoint), [routePath]);
  const samplePts = useMemo(() => (samplePath || []).map(toPoint), [samplePath]);
  const segmentBasePts = useMemo(() => (segmentBasePath || []).map(toPoint), [segmentBasePath]);
  const enrichedSamplePts = useMemo(() => {
    const timed: TimedTrackPoint[] = [];

    for (let i = 0; i < (samples || []).length; i += 1) {
      const sample = samples[i];
      if (!sample?.pos) continue;
      const tMs = sample.t ? Date.parse(sample.t) : Number.NaN;
      if (!Number.isFinite(tMs)) continue;
      timed.push({
        kind: "sample",
        idx: i,
        tMs,
        seq: Number.isFinite(Number(sample.seq)) ? Number(sample.seq) : Number.MAX_SAFE_INTEGER,
        pos: sample.pos,
      });
    }

    for (let i = 0; i < (events || []).length; i += 1) {
      const event = events[i];
      if (!event?.pos) continue;
      const tMs = event.t ? Date.parse(event.t) : Number.NaN;
      if (!Number.isFinite(tMs)) continue;
      timed.push({
        kind: "event",
        idx: i,
        tMs,
        seq: Number.isFinite(Number(event.seq)) ? Number(event.seq) : Number.MAX_SAFE_INTEGER,
        pos: event.pos,
      });
    }

    timed.sort((a, b) => {
      if (a.tMs !== b.tMs) return a.tMs - b.tMs;
      if (a.seq !== b.seq) return a.seq - b.seq;
      if (a.kind !== b.kind) return a.kind === "sample" ? -1 : 1;
      return a.idx - b.idx;
    });

    const out: { lat: number; lng: number }[] = [];
    for (const item of timed) {
      const p = toPoint(item.pos);
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      const prev = out[out.length - 1];
      if (prev && prev.lat === p.lat && prev.lng === p.lng) continue;
      out.push(p);
    }

    return out.length >= 2 ? out : samplePts;
  }, [events, samplePts, samples]);

  const normalizedTimedSamples = useMemo(() => {
    return [...(samples || [])]
      .map((sample, idx) => {
        const pos = sample?.pos ? toAnyPoint(sample.pos) : null;
        const tMs = sample?.t ? Date.parse(String(sample.t)) : Number.NaN;
        if (!pos || !Number.isFinite(tMs)) return null;
        return {
          idx,
          tMs,
          pos,
          speedKmh: Number.isFinite(Number(sample?.speedKmh)) ? Number(sample?.speedKmh) : null,
          seq: Number.isFinite(Number(sample?.seq)) ? Number(sample?.seq) : Number.MAX_SAFE_INTEGER,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (a.tMs !== b.tMs) return a.tMs - b.tMs;
        if (a.seq !== b.seq) return a.seq - b.seq;
        return a.idx - b.idx;
      });
  }, [samples]);

  const segmentIntervals = useMemo(() => {
    const plannedById = new Map<string, PlannedSegment>();
    const plannedByName = new Map<string, PlannedSegment>();
    for (const seg of plannedSegments || []) {
      if (seg?.id) plannedById.set(String(seg.id), seg);
      if (seg?.name) plannedByName.set(String(seg.name), seg);
    }

    const orderedEvents = [...(events || [])]
      .map((event, idx) => {
        const tMs = event?.t ? Date.parse(String(event.t)) : Number.NaN;
        const pos = event?.pos ? toAnyPoint(event.pos) : null;
        if (!Number.isFinite(tMs) || !pos) return null;
        return { idx, tMs, type: String(event?.type || ""), pos, segment: event?.segment ?? null };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (a.tMs === b.tMs ? a.idx - b.idx : a.tMs - b.tMs));

    const dedupePath = (pts: { lat: number; lng: number }[]) => {
      const out: { lat: number; lng: number }[] = [];
      for (const p of pts) {
        const prev = out[out.length - 1];
        if (prev && prev.lat === p.lat && prev.lng === p.lng) continue;
        out.push(p);
      }
      return out;
    };

    const intervals: SegmentInterval[] = [];
    let currentStart: any = null;

    const hasSpeedLimitMeta = (segmentInfo: any) => {
      const segType = String(segmentInfo?.type || "").toLowerCase();
      if (segType.includes("velocidad") || segType.includes("speed")) return true;
      const segId = segmentInfo?.segmentId != null ? String(segmentInfo.segmentId) : "";
      const segName = segmentInfo?.name ? String(segmentInfo.name) : "";
      const planned = (segId && plannedById.get(segId)) || (segName && plannedByName.get(segName)) || null;
      if (!planned) return false;
      const limit = Number(planned?.speedLimitKmh ?? planned?.maxSpeed ?? planned?.vmax);
      return Number.isFinite(limit) && limit > 0;
    };

    for (const event of orderedEvents as any[]) {
      if (event.type === "segment_enter") {
        currentStart = event;
        continue;
      }
      if (!currentStart) continue;
      if (event.type !== "segment_exit") continue;

      const startMs = currentStart.tMs;
      const endMs = event.tMs;
      const inRangeSamples = normalizedTimedSamples.filter((s: any) => s.tMs >= startMs && s.tMs <= endMs);
      let path = inRangeSamples.map((s: any) => s.pos);
      if (path.length === 0) path = [currentStart.pos, event.pos];
      else path = [currentStart.pos, ...path, event.pos];
      path = dedupePath(path);

      if (path.length >= 2) {
        intervals.push({
          path,
          color: hasSpeedLimitMeta(currentStart.segment ?? event.segment) ? "#7c3aed" : "#facc15",
        });
      }

      currentStart = null;
    }

    return intervals;
  }, [events, normalizedTimedSamples, plannedSegments]);

  const speedOverIntervals = useMemo(() => {
    const orderedEvents = [...(events || [])]
      .map((event, idx) => {
        const pos = event?.pos ? toAnyPoint(event.pos) : null;
        const tMs = event?.t ? Date.parse(String(event.t)) : Number.NaN;
        if (!pos || !Number.isFinite(tMs)) return null;
        return { idx, tMs, type: String(event?.type || ""), pos };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (a.tMs === b.tMs ? a.idx - b.idx : a.tMs - b.tMs));

    const intervals: SpeedOverInterval[] = [];
    let currentStart: { tMs: number; pos: { lat: number; lng: number } } | null = null;
    let currentPeak: { tMs: number; pos: { lat: number; lng: number } } | null = null;

    const dedupePath = (pts: { lat: number; lng: number }[]) => {
      const out: { lat: number; lng: number }[] = [];
      for (const p of pts) {
        const prev = out[out.length - 1];
        if (prev && prev.lat === p.lat && prev.lng === p.lng) continue;
        out.push(p);
      }
      return out;
    };

    for (const event of orderedEvents as any[]) {
      if (event.type === "speed_over_start") {
        currentStart = { tMs: event.tMs, pos: event.pos };
        currentPeak = null;
        continue;
      }
      if (!currentStart) continue;
      if (event.type === "speed_over_peak") {
        currentPeak = { tMs: event.tMs, pos: event.pos };
        continue;
      }
      if (event.type !== "speed_over_end") continue;

      const startMs = currentStart.tMs;
      const endMs = event.tMs;
      const inRangeSamples = normalizedTimedSamples.filter((s: any) => s.tMs >= startMs && s.tMs <= endMs);
      let path = inRangeSamples.map((s: any) => s.pos);
      if (path.length === 0) {
        path = [currentStart.pos, event.pos];
      } else {
        path = [currentStart.pos, ...path, event.pos];
      }
      path = dedupePath(path);

      let peakPos = currentPeak?.pos ?? null;
      if (!peakPos && inRangeSamples.length > 0) {
        const best = [...inRangeSamples]
          .filter((s: any) => s.speedKmh !== null)
          .sort((a: any, b: any) => Number(b.speedKmh) - Number(a.speedKmh))[0];
        if (best?.pos) peakPos = best.pos;
      }

      if (path.length >= 2) {
        intervals.push({ startMs, endMs, path, peakPos });
      }

      currentStart = null;
      currentPeak = null;
    }

    return intervals;
  }, [events, normalizedTimedSamples]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) return;
    loadGoogleMaps(key).then(() => setReady(true)).catch(() => null);
  }, []);

  useEffect(() => {
    if (!ready || !mapDivRef.current || !window.google?.maps) return;
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

    for (const overlay of overlaysRef.current) overlay.setMap?.(null);
    overlaysRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    const extend = (p: { lat: number; lng: number }) => bounds.extend(p);

    const addPolyline = (path: { lat: number; lng: number }[], color: string, weight: number, opacity: number) => {
      if (path.length < 2) return;
      const polyline = new window.google.maps.Polyline({ path, geodesic: true, strokeOpacity: opacity, strokeWeight: weight, strokeColor: color });
      polyline.setMap(map);
      overlaysRef.current.push(polyline);
      for (const p of path) extend(p);
    };

    const addMarker = (pos: { lat: number; lng: number }, color: string, title?: string, scale = 5) => {
      const marker = new window.google.maps.Marker({
        position: pos,
        map,
        title,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: "#0f172a", strokeWeight: 1 },
      });
      overlaysRef.current.push(marker);
      extend(pos);
    };

    const addCircle = (center: { lat: number; lng: number }, radiusM: number, color: string) => {
      if (!Number.isFinite(radiusM) || radiusM <= 0) return;
      const circle = new window.google.maps.Circle({
        center,
        radius: radiusM,
        map,
        strokeColor: color,
        strokeOpacity: 0.75,
        strokeWeight: 1,
        fillColor: color,
        fillOpacity: 0.08,
      });
      overlaysRef.current.push(circle);
      extend(center);
    };

    if (showRoute) {
      addPolyline(routePts, "#111827", 4, 0.9);
    }
    if (showSamples) {
      addPolyline(enrichedSamplePts, "#16a34a", 4, 0.95);
      for (const seg of segmentIntervals) {
        addPolyline(seg.path, seg.color, 6, 0.95);
      }
      for (const interval of speedOverIntervals) {
        addPolyline(interval.path, "#dc2626", 6, 0.95);
        if (interval.peakPos) addMarker(interval.peakPos, "#dc2626", "Pico exceso de velocidad", 5);
      }
    }

    if (showEvents) {
      for (const event of events || []) {
        if (!event?.pos) continue;
        const pos = toPoint(event.pos);
        if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) continue;
        addMarker(pos, markerColorByType(String(event.type || "custom")), `${eventTypeLabel(event.type)} ${event.t || ""}`, 4);
      }
    }

    if (showPlannedPois) {
      for (const poi of plannedPois || []) {
        const pos = toAnyPoint(poi) || toAnyPoint(poi?.point) || toAnyPoint(poi?.pos) || toAnyPoint(poi?.center);
        if (!pos) continue;
        addCircle(pos, Number(poi.radiusM || 0), "#7c3aed");
        addMarker(pos, "#7c3aed", `POI planificado: ${poi.name || "POI"}`, 5);
      }
    }

    if (!bounds.isEmpty()) map.fitBounds(bounds);
  }, [enrichedSamplePts, events, plannedPois, routePts, samplePts, segmentIntervals, showEvents, showPlannedPois, showRoute, showSamples, speedOverIntervals]);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: 10, fontSize: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} />Ruta planificada (negra)</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={showSamples} onChange={(e) => setShowSamples(e.target.checked)} />Recorrido real (verde)</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />Eventos</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={showPlannedPois} onChange={(e) => setShowPlannedPois(e.target.checked)} />POIs planificados</label>
      </div>
      <div ref={mapDivRef} style={{ width: "100%", height: 520 }} />
    </div>
  );
}

