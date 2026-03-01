"use client";

import { useEffect, useRef, useState } from "react";
import { findNearestPolicyIndexByPoint } from "@/lib/routeMatch";

declare global {
  interface Window {
    google?: any;
    __gmaps_loader_promise__?: Promise<void>;
  }
}

const waitUntil = (fn: () => boolean, timeoutMs = 15000) =>
  new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Google Maps timeout"));
      requestAnimationFrame(tick);
    };
    tick();
  });

const loadGoogleMaps = async (apiKey: string) => {
  if (window.google?.maps?.importLibrary) {
    await window.google.maps.importLibrary("maps");
    return;
  }

  if (window.__gmaps_loader_promise__) {
    await window.__gmaps_loader_promise__;
    await window.google.maps.importLibrary("maps");
    return;
  }

  window.__gmaps_loader_promise__ = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&loading=async`;
    s.onload = async () => {
      try {
        await waitUntil(() => !!window.google?.maps?.importLibrary, 15000);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    s.onerror = () => reject(new Error("Google script error"));
    document.head.appendChild(s);
  });

  await window.__gmaps_loader_promise__;
  await window.google.maps.importLibrary("maps");
};

function toLatLng(p: any) {
  const num = (v: any) => {
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
  };

  let lat: number | null = null;
  let lng: number | null = null;

  if (Array.isArray(p) && p.length >= 2) {
    lat = num(p[0]);
    lng = num(p[1]);
  } else if (p && typeof p === "object") {
    lat = num(p.lat ?? p.latitude ?? p.y);
    lng = num(p.lng ?? p.longitude ?? p.x);
  }

  if (lat === null || lng === null) return null;

  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const t = lat;
    lat = lng;
    lng = t;
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

type Mode = "poi" | "segment" | "geofence" | null;

type PendingPoi = {
  idx: number;
  distM: number;
  latitude: number;
  longitude: number;
} | null;

type PendingSegmentPoint = {
  idx: number;
  distM: number;
  latitude: number;
  longitude: number;
};

type PendingSegment = {
  a: PendingSegmentPoint;
  b: PendingSegmentPoint;
} | null;

function sliceRouteByIdx(route: { latitude: number; longitude: number }[], aIdx: number, bIdx: number) {
  const from = Math.min(aIdx, bIdx);
  const to = Math.max(aIdx, bIdx);
  const pts = route.slice(from, to + 1);
  return pts.map((p) => ({ lat: p.latitude, lng: p.longitude }));
}

const setMarkerOff = (m: any) => {
  if (!m) return;
  if (typeof m.setMap === "function") m.setMap(null);
  else if ("map" in m) m.map = null;
};

const makeDotMarker = ({
  map,
  position,
  title,
  color,
  sizePx,
}: {
  map: any;
  position: { lat: number; lng: number };
  title: string;
  color: string;
  sizePx: number;
}) => {
  return new window.google.maps.Marker({
    map,
    position,
    title,
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
      scale: Math.max(6, Math.round(sizePx / 2)),
    },
  });
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

export default function SimpleClickMap() {
  const ROUTE_ID = "6976b42b85151e5440bdd0df";

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);

  const routeRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const normalMarkersRef = useRef<any[]>([]);
  const poiMarkersRef = useRef<any[]>([]);
  const segmentDraftMarkersRef = useRef<any[]>([]);
  const segmentOverlaysRef = useRef<{ poly: any; meta: any }[]>([]);

  const [status, setStatus] = useState("Cargando...");
  const [mode, setMode] = useState<Mode>(null);

  const modeRef = useRef<Mode>(null);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const [poiModalOpen, setPoiModalOpen] = useState(false);
  const [pendingPoi, setPendingPoi] = useState<PendingPoi>(null);

  const [poiName, setPoiName] = useState("");
  const [poiType, setPoiType] = useState("peaje");
  const [poiRadiusM, setPoiRadiusM] = useState("50");
  const [poiColor, setPoiColor] = useState(POI_COLORS[0].value);
  const [poiSize, setPoiSize] = useState("20");

  const [segmentModalOpen, setSegmentModalOpen] = useState(false);
  const [pendingSegment, setPendingSegment] = useState<PendingSegment>(null);
  const segmentPickRef = useRef<PendingSegmentPoint | null>(null);

  const [segmentName, setSegmentName] = useState("");
  const [segmentType, setSegmentType] = useState("velocidad_maxima");
  const [segmentMaxSpeed, setSegmentMaxSpeed] = useState("80");
  const [segmentNote, setSegmentNote] = useState("");
  const [segmentLineWidth, setSegmentLineWidth] = useState("6");
  const [segmentColor, setSegmentColor] = useState(SEGMENT_COLORS[0].value);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mode === "poi" || mode === "segment" || mode === "geofence") {
      mapRef.current.setOptions({ draggableCursor: "crosshair", draggingCursor: "crosshair" });
    } else {
      mapRef.current.setOptions({ draggableCursor: "grab", draggingCursor: "grabbing" });
    }
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
          gestureHandling: "greedy",
          scrollwheel: true,
          draggableCursor: "grab",
          draggingCursor: "grabbing",
        });

        setStatus("Buscando ruta en DB...");
        const res = await fetch(`/api/routes/${ROUTE_ID}`);
        if (!res.ok) throw new Error("No pude traer la ruta");
        const data = await res.json();

        const dense = data?.route?.google?.densePath;
        if (!Array.isArray(dense) || dense.length < 2) throw new Error("La ruta no trae google.densePath válido");

        routeRef.current = dense
          .map((p: any) => {
            const lat = p?.lat ?? p?.latitude ?? p?.y ?? (Array.isArray(p) ? p[0] : null);
            const lng = p?.lng ?? p?.longitude ?? p?.x ?? (Array.isArray(p) ? p[1] : null);
            const latitude = typeof lat === "string" ? Number(lat) : lat;
            const longitude = typeof lng === "string" ? Number(lng) : lng;
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
            if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
            return { latitude, longitude };
          })
          .filter(Boolean) as { latitude: number; longitude: number }[];

        const path = dense.map(toLatLng).filter(Boolean) as { lat: number; lng: number }[];
        if (path.length < 2) throw new Error("densePath no tiene coords usables");

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

        mapRef.current.addListener("click", (ev: any) => {
          if (!mapRef.current) return;

          const currentMode = modeRef.current;

          if (currentMode === "poi") {
            if (!routeRef.current.length) return;

            const click = { latitude: ev.latLng.lat(), longitude: ev.latLng.lng() };
            const { idx, distM } = findNearestPolicyIndexByPoint(routeRef.current, click);
            const snapped = routeRef.current[idx];

            setPendingPoi({ idx, distM, latitude: snapped.latitude, longitude: snapped.longitude });

            setPoiName("");
            setPoiType("peaje");
            setPoiRadiusM("50");
            setPoiColor(POI_COLORS[0].value);
            setPoiSize("20");

            setPoiModalOpen(true);
            setStatus(`POI: seleccioná datos (dist click→ruta ${distM.toFixed(1)}m)`);
            return;
          }

          if (currentMode === "segment") {
            if (!routeRef.current.length) return;

            const click = { latitude: ev.latLng.lat(), longitude: ev.latLng.lng() };
            const { idx, distM } = findNearestPolicyIndexByPoint(routeRef.current, click);
            const snapped = routeRef.current[idx];

            const picked: PendingSegmentPoint = { idx, distM, latitude: snapped.latitude, longitude: snapped.longitude };

            const draft = makeDotMarker({
              map: mapRef.current,
              position: { lat: picked.latitude, lng: picked.longitude },
              title: `Draft idx=${picked.idx}`,
              color: "#111827",
              sizePx: 14,
            });
            segmentDraftMarkersRef.current.push(draft);

            if (!segmentPickRef.current) {
              segmentPickRef.current = picked;
              setStatus(`TRAMO: punto A seleccionado (idx=${picked.idx}) | elegí punto B`);
              return;
            }

            const a = segmentPickRef.current;
            const b = picked;

            segmentPickRef.current = null;

            for (const m of segmentDraftMarkersRef.current) setMarkerOff(m);
            segmentDraftMarkersRef.current = [];

            setPendingSegment({ a, b });

            setSegmentName("");
            setSegmentType("velocidad_maxima");
            setSegmentMaxSpeed("80");
            setSegmentNote("");
            setSegmentLineWidth("6");
            setSegmentColor(SEGMENT_COLORS[0].value);

            setSegmentModalOpen(true);

            setStatus(
              `TRAMO: A idx=${a.idx} → B idx=${b.idx} | dist click→ruta A ${a.distM.toFixed(1)}m, B ${b.distM.toFixed(
                1
              )}m`
            );
            return;
          }

          const lat = ev.latLng.lat();
          const lng = ev.latLng.lng();

          const marker = new window.google.maps.Marker({
            position: { lat, lng },
            map: mapRef.current,
            title: `(${lat.toFixed(6)}, ${lng.toFixed(6)})`,
          });

          normalMarkersRef.current.push(marker);
          setStatus(`Punto agregado: ${lat.toFixed(6)}, ${lng.toFixed(6)} (total ${normalMarkersRef.current.length})`);
        });

        setStatus("Listo: ruta dibujada.");
      } catch (e: any) {
        setStatus(e?.message || "Error");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const btnStyle = (active: boolean) => ({
    padding: "8px 10px",
    background: active ? "#111827" : "#ffffff",
    color: active ? "#ffffff" : "#111827",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    cursor: "pointer",
  });

  const clearDraftSegment = () => {
    segmentPickRef.current = null;
    for (const m of segmentDraftMarkersRef.current) setMarkerOff(m);
    segmentDraftMarkersRef.current = [];
  };

  const clear = () => {
    for (const m of normalMarkersRef.current) setMarkerOff(m);
    normalMarkersRef.current = [];

    for (const m of poiMarkersRef.current) setMarkerOff(m);
    poiMarkersRef.current = [];

    for (const s of segmentOverlaysRef.current) {
      if (s?.poly?.setMap) s.poly.setMap(null);
      else if (s?.poly && "map" in s.poly) s.poly.map = null;
    }
    segmentOverlaysRef.current = [];

    clearDraftSegment();

    setPendingSegment(null);
    setStatus("Borré todos los puntos.");
  };

  const closePoiModal = () => {
    setPoiModalOpen(false);
    setPendingPoi(null);
  };

  const savePoi = () => {
    if (!pendingPoi) return;
    const name = poiName.trim();
    if (!name) {
      setStatus("POI: falta nombre");
      return;
    }

    const radiusM = Number(poiRadiusM);
    if (!Number.isFinite(radiusM) || radiusM <= 0) {
      setStatus("POI: radio inválido");
      return;
    }

    const sizePx = Number(poiSize);
    if (!Number.isFinite(sizePx) || sizePx < 12 || sizePx > 64) {
      setStatus("POI: tamaño inválido (12..64)");
      return;
    }

    const marker = makeDotMarker({
      map: mapRef.current,
      position: { lat: pendingPoi.latitude, lng: pendingPoi.longitude },
      title: `${name} (${poiType})`,
      color: poiColor,
      sizePx,
    });

    poiMarkersRef.current.push(marker);

    setStatus(
      `POI guardado: ${name} (${poiType}) | idx=${pendingPoi.idx} | r=${radiusM}m | dist=${pendingPoi.distM.toFixed(
        1
      )}m`
    );

    closePoiModal();
  };

  const closeSegmentModal = () => {
    setSegmentModalOpen(false);
    setPendingSegment(null);
    clearDraftSegment();
  };

  const saveSegment = () => {
    if (!pendingSegment) return;

    const name = segmentName.trim();
    if (!name) {
      setStatus("TRAMO: falta nombre");
      return;
    }

    const vmax = Number(segmentMaxSpeed);
    if (segmentType === "velocidad_maxima" && (!Number.isFinite(vmax) || vmax <= 0)) {
      setStatus("TRAMO: velocidad máxima inválida");
      return;
    }

    const lineWidth = Number(segmentLineWidth);
    if (!Number.isFinite(lineWidth) || lineWidth < 2 || lineWidth > 18) {
      setStatus("TRAMO: ancho inválido (2..18)");
      return;
    }

    const path = sliceRouteByIdx(routeRef.current, pendingSegment.a.idx, pendingSegment.b.idx);
    if (path.length < 2) {
      setStatus("TRAMO: no pude armar path entre índices");
      return;
    }

    const poly = new window.google.maps.Polyline({
      path,
      map: mapRef.current,
      clickable: true,
      strokeColor: segmentColor,
      strokeOpacity: 1,
      strokeWeight: lineWidth,
      zIndex: 10,
    });

    const meta = {
      name,
      type: segmentType,
      vmax: segmentType === "velocidad_maxima" ? vmax : undefined,
      note: segmentNote.trim() || undefined,
      color: segmentColor,
      width: lineWidth,
      aIdx: pendingSegment.a.idx,
      bIdx: pendingSegment.b.idx,
    };

    poly.addListener("click", () => {
      setStatus(
        `TRAMO: ${meta.name} (${meta.type}) | A idx=${meta.aIdx} → B idx=${meta.bIdx}${meta.vmax ? ` | vmax=${meta.vmax}` : ""}${
          meta.note ? ` | ${meta.note}` : ""
        } | color=${meta.color}`
      );
    });

    segmentOverlaysRef.current.push({ poly, meta });

    setStatus(
      `TRAMO guardado: ${name} (${segmentType}) | A idx=${pendingSegment.a.idx} → B idx=${pendingSegment.b.idx} | color=${segmentColor}`
    );

    closeSegmentModal();
  };

  return (
    <div style={{ padding: 12, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => {
            setMode("poi");
            clearDraftSegment();
          }}
          style={btnStyle(mode === "poi")}
        >
          Punto de interés
        </button>

        <button
          onClick={() => {
            setMode("segment");
            clearDraftSegment();
            setStatus("TRAMO: elegí punto A sobre el mapa");
          }}
          style={btnStyle(mode === "segment")}
        >
          Tramo
        </button>

        <button
          onClick={() => {
            setMode("geofence");
            clearDraftSegment();
          }}
          style={btnStyle(mode === "geofence")}
        >
          Geocerca
        </button>

        <button
          onClick={() => {
            setMode(null);
            clearDraftSegment();
          }}
          style={btnStyle(mode === null)}
        >
          Normal
        </button>

        <button
          onClick={clear}
          style={{
            padding: "8px 10px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Borrar puntos
        </button>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {status} {mode ? `| modo: ${mode}` : "| modo: normal"}
        </div>
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

      {poiModalOpen && (
        <div
          onClick={closePoiModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: 14,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Nuevo Punto de Interés</div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Nombre</div>
                <input
                  value={poiName}
                  onChange={(e) => setPoiName(e.target.value)}
                  placeholder="Ej: Peaje Molle Yaco"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Tipo</div>
                <select
                  value={poiType}
                  onChange={(e) => setPoiType(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                    cursor: "pointer",
                    background: "#fff",
                  }}
                >
                  <option value="peaje">Peaje</option>
                  <option value="base">Base</option>
                  <option value="planta">Planta</option>
                  <option value="control">Control</option>
                  <option value="balanza">Balanza</option>
                  <option value="parada">Parada</option>
                  <option value="riesgo">Riesgo</option>
                  <option value="estacion_servicio">Estación de servicio</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Radio (metros)</div>
                <input
                  value={poiRadiusM}
                  onChange={(e) => setPoiRadiusM(e.target.value)}
                  inputMode="numeric"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Color marcador</div>
                <select
                  value={poiColor}
                  onChange={(e) => setPoiColor(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                    cursor: "pointer",
                    background: "#fff",
                  }}
                >
                  {POI_COLORS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Tamaño (px)</div>
                <input
                  value={poiSize}
                  onChange={(e) => setPoiSize(e.target.value)}
                  inputMode="numeric"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {pendingPoi
                  ? `Se guardará sobre la ruta (idx ${pendingPoi.idx}) | dist click→ruta ${pendingPoi.distM.toFixed(1)}m`
                  : ""}
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <button
                  onClick={closePoiModal}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={savePoi}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Guardar POI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {segmentModalOpen && (
        <div
          onClick={closeSegmentModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(620px, 100%)",
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: 14,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Nuevo Tramo</div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {pendingSegment
                  ? `Se guardará sobre la ruta: A idx ${pendingSegment.a.idx} → B idx ${pendingSegment.b.idx}`
                  : ""}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Nombre</div>
                <input
                  value={segmentName}
                  onChange={(e) => setSegmentName(e.target.value)}
                  placeholder="Ej: Tramo zona urbana"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Tipo</div>
                <select
                  value={segmentType}
                  onChange={(e) => setSegmentType(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                    cursor: "pointer",
                    background: "#fff",
                  }}
                >
                  <option value="velocidad_maxima">Velocidad máxima</option>
                  <option value="alerta">Alerta</option>
                  <option value="riesgo">Riesgo</option>
                  <option value="prohibido">Prohibido</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              {segmentType === "velocidad_maxima" && (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Velocidad máxima</div>
                  <input
                    value={segmentMaxSpeed}
                    onChange={(e) => setSegmentMaxSpeed(e.target.value)}
                    inputMode="numeric"
                    style={{
                      padding: "10px 12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      outline: "none",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Color del tramo</div>
                <select
                  value={segmentColor}
                  onChange={(e) => setSegmentColor(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                    cursor: "pointer",
                    background: "#fff",
                  }}
                >
                  {SEGMENT_COLORS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Ancho línea (px)</div>
                <input
                  value={segmentLineWidth}
                  onChange={(e) => setSegmentLineWidth(e.target.value)}
                  inputMode="numeric"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Detalle (opcional)</div>
                <input
                  value={segmentNote}
                  onChange={(e) => setSegmentNote(e.target.value)}
                  placeholder="Ej: escuela / loma de burro / curva cerrada"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <button
                  onClick={closeSegmentModal}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={saveSegment}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Guardar tramo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
