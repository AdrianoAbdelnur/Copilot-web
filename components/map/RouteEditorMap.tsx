"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps/loader";
import { makeDotMarker, setMarkerOff } from "@/lib/gmaps/markers";
import { normalizeDensePath } from "@/lib/gmaps/route";
import { esText } from "@/lib/i18n/es";
import PoiModal, { PoiForm } from "./modals/PoiModal";
import SegmentModal, { SegmentForm } from "./modals/SegmentModal";

type Mode = "poi" | "segment" | "geofence" | null;

export type LatLng = { latitude: number; longitude: number };

type SnappedPoint = {
  idx: number;
  segI: number;
  t: number;
  distM: number;
  latitude: number;
  longitude: number;
};

type PendingPoi = SnappedPoint | null;
type PendingSegmentPoint = SnappedPoint;

type PendingSegment = {
  a: PendingSegmentPoint;
  b: PendingSegmentPoint;
} | null;

type PoiPolicy = {
  id: string;
  name: string;
  type: string;
  radiusM: number;
  idx: number;
  segI: number;
  t: number;
  latitude: number;
  longitude: number;
  ui: { color: string; sizePx: number };
  nav: {
    preAlert: { distanceM: number; message: string } | null;
    onEnter: { message: string };
    onExit: { message: string } | null;
  };
  navMessages: any[];
};

type SegmentPolicy = {
  id: string;
  name: string;
  type: string;
  maxSpeed?: number | null;
  note?: string;
  a: SnappedPoint;
  b: SnappedPoint;
  ui: { color: string; widthPx: number };
  navMessages: any[];
  path: LatLng[];
};

const POI_COLORS = [
  { label: "Verde", value: "#22c55e" },
  { label: "Azul", value: "#2563eb" },
  { label: "Naranja", value: "#f97316" },
  { label: "Rojo", value: "#ef4444" },
  { label: "Violeta", value: "#7c3aed" },
  { label: "Negro", value: "#111827" },
];

const SEGMENT_COLORS = [
  { label: "Azul", value: "#2563eb" },
  { label: "Naranja", value: "#f97316" },
  { label: "Rojo", value: "#ef4444" },
  { label: "Verde", value: "#22c55e" },
  { label: "Violeta", value: "#7c3aed" },
  { label: "Negro", value: "#111827" },
];

const defaultPoiForm = (): PoiForm => ({
  name: "",
  type: "peaje",
  radiusM: "50",
  color: POI_COLORS[0].value,
  sizePx: "20",
  navMessages: [],
});

const defaultSegmentForm = (): SegmentForm => ({
  name: "",
  type: "velocidad_maxima",
  maxSpeed: "80",
  note: "",
  widthPx: "6",
  color: SEGMENT_COLORS[0].value,
  navMessages: [],
});

function radiusColorByPoiType(type: unknown): string {
  const t = String(type ?? "").toLowerCase();
  if (t === "critical" || t === "peligro") return "#ef4444";
  if (t === "alert" || t === "alerta") return "#f59e0b";
  return "#22c55e";
}

function uid() {
  return (globalThis.crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function snapToRouteSegments(route: LatLng[], click: LatLng, segStart: number, segEnd: number): SnappedPoint {
  const lat0 = (click.latitude * Math.PI) / 180;
  const mPerDegLat = 111132;
  const mPerDegLng = 111320 * Math.cos(lat0);

  const cx = click.longitude * mPerDegLng;
  const cy = click.latitude * mPerDegLat;

  let best = { segI: Math.max(0, segStart), t: 0, px: 0, py: 0, d2: Infinity };

  const start = Math.max(0, segStart);
  const end = Math.min(route.length - 2, segEnd);

  for (let i = start; i <= end; i++) {
    const a = route[i];
    const b = route[i + 1];

    const ax = a.longitude * mPerDegLng;
    const ay = a.latitude * mPerDegLat;
    const bx = b.longitude * mPerDegLng;
    const by = b.latitude * mPerDegLat;

    const abx = bx - ax;
    const aby = by - ay;

    const apx = cx - ax;
    const apy = cy - ay;

    const ab2 = abx * abx + aby * aby;
    let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    const px = ax + abx * t;
    const py = ay + aby * t;

    const dx = cx - px;
    const dy = cy - py;
    const d2 = dx * dx + dy * dy;

    if (d2 < best.d2) best = { segI: i, t, px, py, d2 };
  }

  const snappedLat = best.py / mPerDegLat;
  const snappedLng = best.px / mPerDegLng;

  const distM = haversineMeters(click.latitude, click.longitude, snappedLat, snappedLng);
  const idx = best.t >= 0.5 ? best.segI + 1 : best.segI;

  return {
    idx,
    segI: best.segI,
    t: best.t,
    distM,
    latitude: snappedLat,
    longitude: snappedLng,
  };
}

function snapToRoute(route: LatLng[], click: LatLng) {
  return snapToRouteSegments(route, click, 0, route.length - 2);
}

function snapToRouteNearSeg(route: LatLng[], click: LatLng, centerSegI: number, windowSegs: number) {
  return snapToRouteSegments(route, click, centerSegI - windowSegs, centerSegI + windowSegs);
}

function buildSegmentPath(route: LatLng[], a: PendingSegmentPoint, b: PendingSegmentPoint) {
  let A = a;
  let B = b;

  if (B.segI < A.segI || (B.segI === A.segI && B.t < A.t)) {
    const tmp = A;
    A = B;
    B = tmp;
  }

  const pts: LatLng[] = [];

  if (A.segI === B.segI) {
    pts.push({ latitude: A.latitude, longitude: A.longitude });
    pts.push({ latitude: B.latitude, longitude: B.longitude });
    return { path: pts, A, B };
  }

  pts.push({ latitude: A.latitude, longitude: A.longitude });

  const startVertex = Math.max(0, Math.min(route.length - 1, A.segI + 1));
  const endVertex = Math.max(0, Math.min(route.length - 1, B.segI));

  for (let i = startVertex; i <= endVertex; i++) {
    pts.push({ latitude: route[i].latitude, longitude: route[i].longitude });
  }

  pts.push({ latitude: B.latitude, longitude: B.longitude });
  if (pts.length < 2) pts.push({ latitude: B.latitude, longitude: B.longitude });

  return { path: pts, A, B };
}

export default function RouteEditorMap({ routeId }: { routeId: string }) {
  const t = esText.routeEditor;
  const router = useRouter();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  const routeRef = useRef<LatLng[]>([]);
  const polylineRef = useRef<any>(null);

  const poiMarkersRef = useRef<any[]>([]);
  const segmentOverlaysRef = useRef<any[]>([]);
  const segmentPickRef = useRef<PendingSegmentPoint | null>(null);
  const segmentDraftMarkersRef = useRef<any[]>([]);

  const [status, setStatus] = useState<string>(t.loading);
  const [mode, setMode] = useState<Mode>(null);
  const modeRef = useRef<Mode>(null);

  const [poiOpen, setPoiOpen] = useState(false);
  const [pendingPoi, setPendingPoi] = useState<PendingPoi>(null);
  const [poiForm, setPoiForm] = useState<PoiForm>(defaultPoiForm());
  const [editingPoiId, setEditingPoiId] = useState<string | null>(null);

  const [segmentOpen, setSegmentOpen] = useState(false);
  const [pendingSegment, setPendingSegment] = useState<PendingSegment>(null);
  const [segmentForm, setSegmentForm] = useState<SegmentForm>(defaultSegmentForm());

  const [pois, setPois] = useState<PoiPolicy[]>([]);
  const [segments, setSegments] = useState<SegmentPolicy[]>([]);

  const [showRouteLayer, setShowRouteLayer] = useState(true);
  const [showPoiLayer, setShowPoiLayer] = useState(true);
  const [showSegmentLayer, setShowSegmentLayer] = useState(true);
  const [sideTab, setSideTab] = useState<"layers" | "pois" | "segments">("layers");

  const [loaded, setLoaded] = useState(false);
  const [readyModalOpen, setReadyModalOpen] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
    if (!mapRef.current) return;
    if (mode) mapRef.current.setOptions({ draggableCursor: "crosshair", draggingCursor: "crosshair" });
    else mapRef.current.setOptions({ draggableCursor: "grab", draggingCursor: "grabbing" });
  }, [mode]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) {
      setStatus(t.missingKey);
      return;
    }

    let alive = true;

    (async () => {
      try {
        setStatus(t.loadingMaps);
        await loadGoogleMaps(key);
        if (!alive || !mapDivRef.current) return;

        mapRef.current = new window.google.maps.Map(mapDivRef.current, {
          center: { lat: -26.8318, lng: -65.2194 },
          zoom: 6,
          mapTypeId: "roadmap",
          gestureHandling: "greedy",
          scrollwheel: true,
          draggableCursor: "grab",
          draggingCursor: "grabbing",
        });

        setStatus(t.loadingRoute);
        const res = await fetch(`/api/routes/${routeId}`);
        if (!res.ok) throw new Error(t.routeFetchError);
        const data = await res.json();

        const dense = data?.route?.google?.densePath;
        if (!Array.isArray(dense) || dense.length < 2) throw new Error(t.invalidDensePath);

        const { route, path } = normalizeDensePath(dense);
        if (route.length < 2 || path.length < 2) throw new Error(t.invalidDensePoints);
        routeRef.current = route;

        if (polylineRef.current) polylineRef.current.setMap(null);
        polylineRef.current = new window.google.maps.Polyline({
          path,
          map: showRouteLayer ? mapRef.current : null,
          clickable: false,
          strokeColor: "#ef4444",
          strokeOpacity: 1,
          strokeWeight: 4,
        });

        const bounds = new window.google.maps.LatLngBounds();
        for (const p of path) bounds.extend(p);
        mapRef.current.fitBounds(bounds);

        const existingPois = Array.isArray(data?.route?.policyPack?.pois) ? data.route.policyPack.pois : [];
        const existingSegments = Array.isArray(data?.route?.policyPack?.segments) ? data.route.policyPack.segments : [];

        setPois(existingPois);
        setSegments(existingSegments);

        mapRef.current.addListener("click", (ev: any) => {
          const currentMode = modeRef.current;
          if (!currentMode) return;

          const click = { latitude: ev.latLng.lat(), longitude: ev.latLng.lng() } as LatLng;
          const route = routeRef.current;
          if (route.length < 2) return;

          if (currentMode === "poi") {
            const picked = snapToRoute(route, click);
            setPendingPoi(picked);
            setPoiForm(defaultPoiForm());
            setPoiOpen(true);
            setStatus(`${t.poiSelected} ${picked.distM.toFixed(1)}m`);
            return;
          }

          if (currentMode === "segment") {
            let picked: PendingSegmentPoint;

            if (!segmentPickRef.current) {
              picked = snapToRoute(route, click);
            } else {
              const a = segmentPickRef.current;
              picked = snapToRouteNearSeg(route, click, a.segI, 800);
            }

            const draft = makeDotMarker({
              map: mapRef.current,
              position: { lat: picked.latitude, lng: picked.longitude },
              title: "draft",
              color: "#111827",
              sizePx: 14,
            });
            segmentDraftMarkersRef.current.push(draft);

            if (!segmentPickRef.current) {
              segmentPickRef.current = picked;
              setStatus(`${t.segmentASelected} ${picked.distM.toFixed(1)}m`);
              return;
            }

            const a = segmentPickRef.current;
            const b = picked;

            segmentPickRef.current = null;
            for (const m of segmentDraftMarkersRef.current) setMarkerOff(m);
            segmentDraftMarkersRef.current = [];

            setPendingSegment({ a, b });
            setSegmentForm(defaultSegmentForm());
            setSegmentOpen(true);
            setStatus(`${t.segmentABSelected} ${b.distM.toFixed(1)}m`);
          }
        });

        setLoaded(true);
        setStatus(t.ready);
      } catch (e: any) {
        setStatus(e?.message || "Error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [routeId]);

  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current;
    if (!map) return;

    if (polylineRef.current) {
      polylineRef.current.setMap(showRouteLayer ? map : null);
    }

    for (const m of poiMarkersRef.current) setMarkerOff(m);
    poiMarkersRef.current = [];

    for (const s of segmentOverlaysRef.current) {
      if (s?.setMap) s.setMap(null);
      else if (s && "map" in s) s.map = null;
    }
    segmentOverlaysRef.current = [];

    if (showPoiLayer) {
      const openPoiEditor = (poi: any) => {
        const lat = Number(poi?.latitude);
        const lng = Number(poi?.longitude);
        const idx = Number(poi?.idx);
        const segI = Number(poi?.segI);
        const t = Number(poi?.t);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        setEditingPoiId(String(poi?.id ?? ""));
        setPendingPoi({
          idx: Number.isFinite(idx) ? idx : 0,
          segI: Number.isFinite(segI) ? segI : 0,
          t: Number.isFinite(t) ? t : 0,
          distM: 0,
          latitude: lat,
          longitude: lng,
        });
        setPoiForm({
          name: String(poi?.name ?? ""),
          type: String(poi?.type ?? "info"),
          radiusM: String(poi?.radiusM ?? "50"),
          color: String(poi?.ui?.color ?? "#22c55e"),
          sizePx: String(poi?.ui?.sizePx ?? 20),
          navMessages: Array.isArray(poi?.navMessages) ? poi.navMessages : [],
        });
        setPoiOpen(true);
        setStatus(`Editando POI: ${String(poi?.name ?? "POI")}`);
      };

      for (const p of pois) {
        const lat = Number((p as any).latitude);
        const lng = Number((p as any).longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const color = (p as any)?.ui?.color || "#111827";
        const sizePx = Number((p as any)?.ui?.sizePx || 20);

        const m = makeDotMarker({
          map,
          position: { lat, lng },
          title: (p as any)?.name ? String((p as any).name) : "POI",
          color,
          sizePx,
        });
        m?.addListener?.("click", () => openPoiEditor(p));

        poiMarkersRef.current.push(m);

        const radiusM = Number((p as any)?.radiusM || 0);
        if (Number.isFinite(radiusM) && radiusM > 0) {
          const radiusColor = radiusColorByPoiType((p as any)?.type);
          const circle = new window.google.maps.Circle({
            map,
            center: { lat, lng },
            radius: radiusM,
            strokeColor: radiusColor,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: radiusColor,
            fillOpacity: 0.14,
            clickable: false,
          });
          circle?.addListener?.("click", () => openPoiEditor(p));
          segmentOverlaysRef.current.push(circle);
        }
      }
    }

    if (showSegmentLayer) {
      for (const s of segments) {
        const widthPx = Number((s as any)?.ui?.widthPx || (s as any)?.widthPx || 6);
        const color = (s as any)?.ui?.color || (s as any)?.color || "#2563eb";

        const pathArr = Array.isArray((s as any)?.path) ? (s as any).path : null;
        let path: { lat: number; lng: number }[] = [];

        if (pathArr && pathArr.length >= 2) {
          path = pathArr
            .map((pp: any) => ({ lat: Number(pp.latitude), lng: Number(pp.longitude) }))
            .filter((pp: any) => Number.isFinite(pp.lat) && Number.isFinite(pp.lng));
        } else if ((s as any)?.a && (s as any)?.b) {
          const built = buildSegmentPath(routeRef.current, (s as any).a, (s as any).b);
          path = built.path.map((pp) => ({ lat: pp.latitude, lng: pp.longitude }));
        }

        if (path.length < 2) continue;

        const poly = new window.google.maps.Polyline({
          path,
          map,
          clickable: true,
          strokeColor: color,
          strokeOpacity: 1,
          strokeWeight: widthPx,
          zIndex: 10,
        });

        segmentOverlaysRef.current.push(poly);
      }
    }
  }, [loaded, pois, segments, showPoiLayer, showSegmentLayer, showRouteLayer]);

  const clear = () => {
    for (const m of poiMarkersRef.current) setMarkerOff(m);
    poiMarkersRef.current = [];

    for (const s of segmentOverlaysRef.current) {
      if (s?.setMap) s.setMap(null);
      else if (s && "map" in s) s.map = null;
    }
    segmentOverlaysRef.current = [];

    segmentPickRef.current = null;
    for (const m of segmentDraftMarkersRef.current) setMarkerOff(m);
    segmentDraftMarkersRef.current = [];

    setPois([]);
    setSegments([]);
    setStatus(t.cleared);
  };

  const saveAllToDB = async () => {
    try {
      setStatus(t.saving);
      const res = await fetch(`/api/routes/${routeId}/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pois, segments }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || t.saveFailed);
      setStatus(t.saved);
      setReadyModalOpen(true);
    } catch (e: any) {
      setStatus(e?.message || t.saveFailed);
    }
  };

  const savePoi = () => {
    if (!pendingPoi) return;

    const name = poiForm.name.trim();
    if (!name) return setStatus(t.poiNameRequired);

    const radiusM = Number(poiForm.radiusM);
    if (!Number.isFinite(radiusM) || radiusM <= 0) return setStatus(t.poiInvalidRadius);

    const sizePx = Number(poiForm.sizePx);
    if (!Number.isFinite(sizePx) || sizePx < 12 || sizePx > 64) return setStatus(t.poiInvalidMarkerSize);

    const msgs = poiForm.navMessages ?? [];
    const pre = msgs.find((m: any) => m.type === "pre");
    const enter = msgs.find((m: any) => m.type === "enter");
    const exit = msgs.find((m: any) => m.type === "exit");

    if (pre) {
      const d = Number(pre.distanceM ?? 200);
      if (!Number.isFinite(d) || d <= 0) return setStatus(t.poiInvalidPreDistance);
      if (!String(pre.text || "").trim()) return setStatus(t.poiPreTextRequired);
    }
    if (enter && !String(enter.text || "").trim()) return setStatus(t.poiEnterTextRequired);
    if (exit && !String(exit.text || "").trim()) return setStatus(t.poiExitTextRequired);

    const poi: PoiPolicy = {
      id: editingPoiId ?? uid(),
      name,
      type: poiForm.type,
      radiusM,
      idx: pendingPoi.idx,
      segI: pendingPoi.segI,
      t: pendingPoi.t,
      latitude: pendingPoi.latitude,
      longitude: pendingPoi.longitude,
      ui: { color: poiForm.color, sizePx },
      nav: {
        preAlert: pre ? { distanceM: Number(pre.distanceM ?? 200), message: String(pre.text || "").trim() } : null,
        onEnter: { message: String(enter?.text || "").trim() || "Puede detenerse en [NOMBRE]" },
        onExit: exit ? { message: String(exit.text || "").trim() } : null,
      },
      navMessages: msgs,
    };

    if (editingPoiId) {
      setPois((prev) => prev.map((item) => (item.id === editingPoiId ? poi : item)));
    } else {
      setPois((prev) => [...prev, poi]);
    }

    setPoiOpen(false);
    setPendingPoi(null);
    setEditingPoiId(null);
    setStatus(`${t.poiAdded}: ${name}`);
  };

  const saveSegment = () => {
    if (!pendingSegment) return;

    const name = segmentForm.name.trim();
    if (!name) return setStatus(t.segmentNameRequired);

    const widthPx = Number(segmentForm.widthPx);
    if (!Number.isFinite(widthPx) || widthPx < 2 || widthPx > 18) return setStatus(t.segmentInvalidWidth);

    const vmax = Number(segmentForm.maxSpeed);
    if (segmentForm.type === "velocidad_maxima" && (!Number.isFinite(vmax) || vmax <= 0)) {
      return setStatus(t.segmentInvalidSpeed);
    }

    const { path, A, B } = buildSegmentPath(routeRef.current, pendingSegment.a, pendingSegment.b);
    if (path.length < 2) return setStatus(t.segmentPathError);

    const segment: SegmentPolicy = {
      id: uid(),
      name,
      type: segmentForm.type,
      maxSpeed: segmentForm.type === "velocidad_maxima" ? vmax : null,
      note: segmentForm.note,
      a: A,
      b: B,
      ui: { color: segmentForm.color, widthPx },
      navMessages: segmentForm.navMessages ?? [],
      path,
    };

    setSegments((prev) => [...prev, segment]);

    setSegmentOpen(false);
    setPendingSegment(null);
    setStatus(`${t.segmentAdded}: ${name}`);
  };

  const btnStyle = (active: boolean) => ({
    padding: "8px 10px",
    background: active ? "#111827" : "#ffffff",
    color: active ? "#ffffff" : "#111827",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    cursor: "pointer",
  });

  const poiPendingText = pendingPoi ? `${t.willSnapPoi} ${pendingPoi.distM.toFixed(1)}m` : "";
  const segPendingText = pendingSegment ? t.willSnapSegment : "";

  const compactPois = useMemo(() => pois.slice(0, 200), [pois]);
  const compactSegments = useMemo(() => segments.slice(0, 200), [segments]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <button onClick={() => setMode("poi")} style={btnStyle(mode === "poi")}>{t.modePoi}</button>
        <button
          onClick={() => {
            setMode("segment");
            setStatus(t.modeSegmentPickA);
          }}
          style={btnStyle(mode === "segment")}
        >
          {t.modeSegment}
        </button>
        <button onClick={() => setMode(null)} style={btnStyle(mode === null)}>{t.modeNormal}</button>

        <span className="mx-1 h-6 w-px bg-slate-200" />

        <button
          onClick={saveAllToDB}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #0f766e",
            background: "#0d9488",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Guardar cambios
        </button>

        <button
          onClick={clear}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
        >
          {t.clear}
        </button>

        <div className="ml-auto text-xs text-slate-500">{status}</div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setSideTab("layers")}
              className={`rounded px-2 py-1 text-xs ${sideTab === "layers" ? "bg-white text-slate-900" : "text-slate-600"}`}
            >
              {t.sideTabs.layers}
            </button>
            <button
              type="button"
              onClick={() => setSideTab("pois")}
              className={`rounded px-2 py-1 text-xs ${sideTab === "pois" ? "bg-white text-slate-900" : "text-slate-600"}`}
            >
              {t.sideTabs.pois} ({pois.length})
            </button>
            <button
              type="button"
              onClick={() => setSideTab("segments")}
              className={`rounded px-2 py-1 text-xs ${sideTab === "segments" ? "bg-white text-slate-900" : "text-slate-600"}`}
            >
              {t.sideTabs.segments} ({segments.length})
            </button>
          </div>

          {sideTab === "layers" ? (
            <div className="grid gap-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showRouteLayer} onChange={(e) => setShowRouteLayer(e.target.checked)} />
                {t.layers.routeLine}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showPoiLayer} onChange={(e) => setShowPoiLayer(e.target.checked)} />
                {t.layers.poiMarkers}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showSegmentLayer} onChange={(e) => setShowSegmentLayer(e.target.checked)} />
                {t.layers.segmentOverlays}
              </label>
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
                {t.layers.tip}
              </div>
            </div>
          ) : null}

          {sideTab === "pois" ? (
            <div className="grid max-h-[58vh] gap-2 overflow-auto">
              {compactPois.map((poi) => (
                <div key={poi.id} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{poi.name}</div>
                      <div className="text-xs text-slate-500">{poi.type} | r={poi.radiusM}m | idx={poi.idx}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPois((prev) => prev.filter((p) => p.id !== poi.id))}
                      className="rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700"
                    >
                      {t.remove}
                    </button>
                  </div>
                </div>
              ))}
              {compactPois.length === 0 ? <div className="text-xs text-slate-500">{t.noPois}</div> : null}
              {pois.length > compactPois.length ? (
                <div className="text-xs text-slate-500">{t.showingFirstPois} {compactPois.length} POIs</div>
              ) : null}
            </div>
          ) : null}

          {sideTab === "segments" ? (
            <div className="grid max-h-[58vh] gap-2 overflow-auto">
              {compactSegments.map((segment) => (
                <div key={segment.id} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{segment.name}</div>
                      <div className="text-xs text-slate-500">
                        {segment.type} | vmax={segment.maxSpeed ?? "-"} | width={segment.ui.widthPx}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSegments((prev) => prev.filter((s) => s.id !== segment.id))}
                      className="rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700"
                    >
                      {t.remove}
                    </button>
                  </div>
                </div>
              ))}
              {compactSegments.length === 0 ? <div className="text-xs text-slate-500">{t.noSegments}</div> : null}
              {segments.length > compactSegments.length ? (
                <div className="text-xs text-slate-500">{t.showingFirstSegments} {compactSegments.length} tramos</div>
              ) : null}
            </div>
          ) : null}
        </aside>

        <div
          ref={mapDivRef}
          className="h-[75vh] w-full overflow-hidden rounded-lg border border-slate-200"
        />
      </div>

      <PoiModal
        open={poiOpen}
        pendingText={poiPendingText}
        colors={POI_COLORS}
        value={poiForm}
        onChange={(p) => setPoiForm((v) => ({ ...v, ...p }))}
        onCancel={() => {
          setPoiOpen(false);
          setPendingPoi(null);
          setEditingPoiId(null);
        }}
        onSave={savePoi}
      />

      <SegmentModal
        open={segmentOpen}
        pendingText={segPendingText}
        colors={SEGMENT_COLORS}
        value={segmentForm}
        onChange={(p) => setSegmentForm((v) => ({ ...v, ...p }))}
        onCancel={() => {
          setSegmentOpen(false);
          setPendingSegment(null);
          segmentPickRef.current = null;
          for (const m of segmentDraftMarkersRef.current) setMarkerOff(m);
          segmentDraftMarkersRef.current = [];
        }}
        onSave={saveSegment}
      />

      {readyModalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 12000,
          }}
        >
          <div
            style={{
              width: "min(420px, 100%)",
              background: "var(--surface)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#0f766e" }}>
              Ruta lista
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
              Tu ruta esta lista para ser navegada.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setReadyModalOpen(false)}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--foreground)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setReadyModalOpen(false);
                  router.push("/trips");
                }}
                style={{
                  border: "1px solid #0f766e",
                  background: "#0d9488",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                Ir a viajes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}




