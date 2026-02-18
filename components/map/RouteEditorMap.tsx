"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps/loader";
import { makeDotMarker, setMarkerOff } from "@/lib/gmaps/markers";
import { normalizeDensePath } from "@/lib/gmaps/route";
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
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  const routeRef = useRef<LatLng[]>([]);
  const polylineRef = useRef<any>(null);

  const poiMarkersRef = useRef<any[]>([]);
  const segmentOverlaysRef = useRef<any[]>([]);
  const segmentPickRef = useRef<PendingSegmentPoint | null>(null);
  const segmentDraftMarkersRef = useRef<any[]>([]);

  const [status, setStatus] = useState("Cargando...");
  const [mode, setMode] = useState<Mode>(null);
  const modeRef = useRef<Mode>(null);

  const [poiOpen, setPoiOpen] = useState(false);
  const [pendingPoi, setPendingPoi] = useState<PendingPoi>(null);
  const [poiForm, setPoiForm] = useState<PoiForm>(defaultPoiForm());

  const [segmentOpen, setSegmentOpen] = useState(false);
  const [pendingSegment, setPendingSegment] = useState<PendingSegment>(null);
  const [segmentForm, setSegmentForm] = useState<SegmentForm>(defaultSegmentForm());

  const [pois, setPois] = useState<PoiPolicy[]>([]);
  const [segments, setSegments] = useState<SegmentPolicy[]>([]);

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
    if (!mapRef.current) return;
    if (mode) mapRef.current.setOptions({ draggableCursor: "crosshair", draggingCursor: "crosshair" });
    else mapRef.current.setOptions({ draggableCursor: "grab", draggingCursor: "grabbing" });
  }, [mode]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) {
      setStatus("Falta NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY");
      return;
    }

    let alive = true;

    (async () => {
      try {
        setStatus("Cargando Google Maps...");
        await loadGoogleMaps(key);
        if (!alive) return;
        if (!mapDivRef.current) return;

        mapRef.current = new window.google.maps.Map(mapDivRef.current, {
          center: { lat: -26.8318, lng: -65.2194 },
          zoom: 6,
          mapTypeId: "roadmap",
          draggableCursor: "grab",
          draggingCursor: "grabbing",
        });

        setStatus("Buscando ruta en DB...");
        const res = await fetch(`/api/routes/${routeId}`);
        if (!res.ok) throw new Error("No pude traer la ruta");
        const data = await res.json();

        const dense = data?.route?.google?.densePath;
        if (!Array.isArray(dense) || dense.length < 2) throw new Error("La ruta no trae google.densePath válido");

        const { route, path } = normalizeDensePath(dense);
        if (route.length < 2 || path.length < 2) throw new Error("densePath no tiene coords usables");
        routeRef.current = route;

        if (polylineRef.current) polylineRef.current.setMap(null);
        polylineRef.current = new window.google.maps.Polyline({
          path,
          map: mapRef.current,
          clickable: false,
          strokeColor: "#ff0000",
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
            setStatus(`POI: dist click→línea ${picked.distM.toFixed(1)}m`);
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
              title: `draft`,
              color: "#111827",
              sizePx: 14,
            });
            segmentDraftMarkersRef.current.push(draft);

            if (!segmentPickRef.current) {
              segmentPickRef.current = picked;
              setStatus(`TRAMO: A listo (elegí B) | dist ${picked.distM.toFixed(1)}m`);
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
            setStatus(`TRAMO: A → B | distB ${b.distM.toFixed(1)}m`);
          }
        });

        setLoaded(true);
        setStatus("Listo.");
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

    for (const m of poiMarkersRef.current) setMarkerOff(m);
    poiMarkersRef.current = [];

    for (const s of segmentOverlaysRef.current) {
      if (s?.setMap) s.setMap(null);
      else if (s && "map" in s) s.map = null;
    }
    segmentOverlaysRef.current = [];

    for (const p of pois) {
      if (!p) continue;
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

      poiMarkersRef.current.push(m);
    }

    for (const s of segments) {
      if (!s) continue;

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
  }, [loaded, pois, segments]);

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
    setStatus("Borré todo (en pantalla).");
  };

  const saveAllToDB = async () => {
    try {
      setStatus("Guardando policy (pois + segments)...");
      const res = await fetch(`/api/routes/${routeId}/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pois, segments }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "No se pudo guardar");
      setStatus("Guardado OK");
    } catch (e: any) {
      setStatus(e?.message || "Error guardando");
    }
  };

  const savePoi = () => {
    if (!pendingPoi) return;

    const name = poiForm.name.trim();
    if (!name) return setStatus("POI: falta nombre");

    const radiusM = Number(poiForm.radiusM);
    if (!Number.isFinite(radiusM) || radiusM <= 0) return setStatus("POI: radio inválido");

    const sizePx = Number(poiForm.sizePx);
    if (!Number.isFinite(sizePx) || sizePx < 12 || sizePx > 64) return setStatus("POI: tamaño inválido");

    const msgs = poiForm.navMessages ?? [];
    const pre = msgs.find((m: any) => m.type === "pre");
    const enter = msgs.find((m: any) => m.type === "enter");
    const exit = msgs.find((m: any) => m.type === "exit");

    if (pre) {
      const d = Number(pre.distanceM ?? 200);
      if (!Number.isFinite(d) || d <= 0) return setStatus("POI: distancia aviso previo inválida");
      if (!String(pre.text || "").trim()) return setStatus("POI: falta texto del aviso previo");
    }
    if (enter && !String(enter.text || "").trim()) return setStatus("POI: falta texto al ingresar");
    if (exit && !String(exit.text || "").trim()) return setStatus("POI: falta texto al salir");

    const poi: PoiPolicy = {
      id: uid(),
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

    setPois((prev) => [...prev, poi]);

    setPoiOpen(false);
    setPendingPoi(null);
    setStatus(`POI agregado: ${name}`);
  };

  const saveSegment = () => {
    if (!pendingSegment) return;

    const name = segmentForm.name.trim();
    if (!name) return setStatus("TRAMO: falta nombre");

    const widthPx = Number(segmentForm.widthPx);
    if (!Number.isFinite(widthPx) || widthPx < 2 || widthPx > 18) return setStatus("TRAMO: ancho inválido");

    const vmax = Number(segmentForm.maxSpeed);
    if (segmentForm.type === "velocidad_maxima" && (!Number.isFinite(vmax) || vmax <= 0))
      return setStatus("TRAMO: vmax inválida");

    const { path, A, B } = buildSegmentPath(routeRef.current, pendingSegment.a, pendingSegment.b);
    if (path.length < 2) return setStatus("TRAMO: no pude armar path");

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
    setStatus(`TRAMO agregado: ${name}`);
  };

  const btnStyle = (active: boolean) => ({
    padding: "8px 10px",
    background: active ? "#111827" : "#ffffff",
    color: active ? "#ffffff" : "#111827",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    cursor: "pointer",
  });

  const poiPendingText = pendingPoi ? `Se guardará sobre la ruta | dist click→línea ${pendingPoi.distM.toFixed(1)}m` : "";
  const segPendingText = pendingSegment ? `Se guardará sobre la ruta: A → B` : "";

  return (
    <div style={{ padding: 12, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={() => setMode("poi")} style={btnStyle(mode === "poi")}>
          POI
        </button>
        <button
          onClick={() => {
            setMode("segment");
            setStatus("TRAMO: elegí A");
          }}
          style={btnStyle(mode === "segment")}
        >
          Tramo
        </button>
        <button onClick={() => setMode(null)} style={btnStyle(mode === null)}>
          Normal
        </button>

        <button
          onClick={saveAllToDB}
          style={{ padding: "8px 10px", border: "1px solid #111827", borderRadius: 8, cursor: "pointer", background: "#111827", color: "#fff" }}
        >
          Guardar en DB
        </button>

        <button
          onClick={clear}
          style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" }}
        >
          Borrar
        </button>

        <div style={{ fontSize: 12, opacity: 0.8 }}>{status}</div>
      </div>

      <div
        ref={mapDivRef}
        style={{
          width: "100%",
          height: "75vh",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
        }}
      />

      <PoiModal
        open={poiOpen}
        pendingText={poiPendingText}
        colors={POI_COLORS}
        value={poiForm}
        onChange={(p) => setPoiForm((v) => ({ ...v, ...p }))}
        onCancel={() => {
          setPoiOpen(false);
          setPendingPoi(null);
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
    </div>
  );
}
