"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type LatLng = { latitude: number; longitude: number };

export type WorstPoint = { idx: number; errorM: number; point: LatLng };
export type DeviationPoint = { idx: number; errorM: number; point: LatLng };

export type MatchReport = {
  worstTop?: WorstPoint[];
  outOfCorridorPoints?: DeviationPoint[];
  matchPct?: number;
  inCorridor?: number;
  samples?: number;
  corridorM?: number;
};

export type Step = {
  start_location: any;
  end_location: any;
  html_instructions?: string;
  maneuver?: string | null;
  polyline?: string | null;
};

export type GoogleBlock = {
  overviewPolyline?: string | null;
  densePath?: LatLng[];
  matchReport?: MatchReport | null;
  steps?: Step[];
};

export type RepairDebug = {
  clusterFirst?: LatLng | null;
  clusterLast?: LatLng | null;
  kmlStart?: LatLng | null;
  kmlEnd?: LatLng | null;
  clusterPoints?: LatLng[] | null;

  stepOriginRaw?: LatLng | null;
  stepDestinationRaw?: LatLng | null;

  requestOrigin?: LatLng | null;
  requestDestination?: LatLng | null;

  waypoints?: LatLng[] | null;
};

export type PatchedSegment = {
  clusterIdx: number;
  decodedPath: LatLng[];
  googleSteps?: Step[];
  overviewPolyline?: string | null;
  googleStatus?: string | null;
};

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

const loadGoogleMapsPerfect = async (apiKey: string) => {
  if (window.google?.maps?.importLibrary) {
    await window.google.maps.importLibrary("maps");
    await window.google.maps.importLibrary("marker");
    return;
  }

  if (window.__gmaps_loader_promise__) {
    await window.__gmaps_loader_promise__;
    await window.google.maps.importLibrary("maps");
    await window.google.maps.importLibrary("marker");
    return;
  }

  window.__gmaps_loader_promise__ = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps="1"]');

    const finalize = async () => {
      try {
        await waitUntil(() => !!window.google?.maps?.importLibrary, 15000);
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    if (existing) {
      existing.addEventListener("load", finalize);
      existing.addEventListener("error", () => reject(new Error("Google script error")));
      finalize();
      return;
    }

    const s = document.createElement("script");
    (s as any).dataset.googleMaps = "1";
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&loading=async`;
    s.onload = () => finalize();
    s.onerror = () => reject(new Error("Google script error"));
    document.head.appendChild(s);
  });

  await window.__gmaps_loader_promise__;
  await window.google.maps.importLibrary("maps");
  await window.google.maps.importLibrary("marker");
};

const toPos = (p: any) => {
  if (!p) return null;

  if (typeof p.latitude === "number" && typeof p.longitude === "number") {
    return { lat: Number(p.latitude), lng: Number(p.longitude) };
  }

  if (typeof p.lat === "number" && typeof p.lng === "number") {
    return { lat: Number(p.lat), lng: Number(p.lng) };
  }

  return null;
};

export function RouteMapViewer({
  policyRoute,
  googleOriginal,
  debug,
  patchedSegments,
  mergedGoogle,
}: {
  policyRoute: LatLng[];
  googleOriginal?: GoogleBlock | null;
  debug?: RepairDebug | null;
  patchedSegments?: PatchedSegment[] | any[];
  mergedGoogle?: any | null;
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  const overlaysRef = useRef<any[]>([]);
  const dataLayersRef = useRef<any[]>([]);

  const [ready, setReady] = useState(false);

  const [showPolicy, setShowPolicy] = useState(true);
  const [showGoogleOriginal, setShowGoogleOriginal] = useState(true);

  const [showPatchedSegments, setShowPatchedSegments] = useState(true);
  const [showMerged, setShowMerged] = useState(true);

  const [showStepsOriginal, setShowStepsOriginal] = useState(true);
  const [showStepsPatched, setShowStepsPatched] = useState(true);

  const [showClusterPoints, setShowClusterPoints] = useState(true);
  const [showClusterAnchors, setShowClusterAnchors] = useState(true);
  const [showKmlAnchors, setShowKmlAnchors] = useState(true);

  const [showRequestAnchors, setShowRequestAnchors] = useState(true);
  const [showWaypoints, setShowWaypoints] = useState(true);

  const policyPath = useMemo(
    () => (policyRoute ?? []).map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })),
    [policyRoute]
  );

  const googleOriginalPath = useMemo(() => {
    const arr = googleOriginal?.densePath ?? [];
    return (arr ?? []).map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }));
  }, [googleOriginal?.densePath]);

  const mergedPath = useMemo(() => {
    const arr = mergedGoogle?.densePath ?? [];
    return (arr ?? []).map((p: LatLng) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }));
  }, [mergedGoogle?.densePath]);

  const hasMerged = mergedPath.length >= 2;

  const patchedSegmentsSafe = useMemo(() => {
    const arr = (patchedSegments ?? []) as any[];
    return arr
      .filter((x) => Array.isArray(x?.decodedPath) && x.decodedPath.length >= 2)
      .map((x) => ({
        clusterIdx: x.clusterIdx,
        path: (x.decodedPath ?? []).map((p: LatLng) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })),
        googleSteps: Array.isArray(x?.googleSteps) ? x.googleSteps : [],
      }));
  }, [patchedSegments]);

  const hasPatchedSegments = patchedSegmentsSafe.length > 0;

  const originalStepsSafe = useMemo(() => {
    const steps = (googleOriginal?.steps ?? []) as any[];
    return steps.filter(Boolean);
  }, [googleOriginal?.steps]);

  const patchedStepsSafe = useMemo(() => {
    const out: any[] = [];
    for (const seg of patchedSegmentsSafe) {
      for (const s of seg.googleSteps ?? []) out.push(s);
    }
    return out;
  }, [patchedSegmentsSafe]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) return;

    loadGoogleMapsPerfect(key)
      .then(() => setReady(true))
      .catch((e) => console.error(e));
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
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;

    for (const o of overlaysRef.current) o.setMap?.(null);
    overlaysRef.current = [];

    for (const d of dataLayersRef.current) d.setMap?.(null);
    dataLayersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    const extend = (p: { lat: number; lng: number }) => bounds.extend(p);

    const addPolyline = (
      path: { lat: number; lng: number }[],
      color: string,
      weight: number,
      zIndex: number,
      opacity: number
    ) => {
      const pl = new window.google.maps.Polyline({
        path,
        geodesic: true,
        strokeOpacity: opacity,
        strokeWeight: weight,
        strokeColor: color,
        zIndex,
      });
      pl.setMap(map);
      overlaysRef.current.push(pl);
      for (const p of path) extend(p);
    };

    const addMarker = (
      pos: { lat: number; lng: number },
      color: string,
      scale: number,
      zIndex: number,
      title?: string
    ) => {
      const m = new window.google.maps.Marker({
        position: pos,
        map,
        title,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#111827",
          strokeWeight: 1,
        },
        zIndex,
      });
      overlaysRef.current.push(m);
      extend(pos);
    };

    const addWaypointsLayer = (pts: LatLng[]) => {
      const layer = new window.google.maps.Data();
      layer.setMap(map);
      layer.setStyle(() => ({
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: "#38bdf8",
          fillOpacity: 1,
          strokeColor: "#111827",
          strokeOpacity: 1,
          strokeWeight: 1,
        },
      }));
      dataLayersRef.current.push(layer);

      const BATCH = 2000;
      let i = 0;

      const addBatch = () => {
        const end = Math.min(i + BATCH, pts.length);
        for (; i < end; i++) {
          const p = pts[i];
          const lat = Number(p.latitude);
          const lng = Number(p.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

          layer.add(new window.google.maps.Data.Feature({ geometry: new window.google.maps.Data.Point({ lat, lng }) }));
          extend({ lat, lng });
        }
        if (i < pts.length) requestAnimationFrame(addBatch);
      };

      addBatch();
    };

    const paintSteps = (steps: any[], color: string, scale: number, zIndex: number) => {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const a = toPos(s?.start_location);
        const b = toPos(s?.end_location);
        if (a) addMarker(a, color, scale, zIndex, `step ${i} start`);
        if (b) addMarker(b, color, scale, zIndex, `step ${i} end`);
      }
    };

    if (showPolicy && policyPath.length >= 2) addPolyline(policyPath, "#1f6feb", 4, 10, 0.9);

    if (showGoogleOriginal && googleOriginalPath.length >= 2) {
      addPolyline(googleOriginalPath, "#d1242f", 4, 20, 0.85);
    }

    if (showPatchedSegments && hasPatchedSegments) {
      for (const seg of patchedSegmentsSafe) {
        addPolyline(seg.path, "#ffff00", 8, 999999, 0.95);
      }
    }

    if (showMerged && hasMerged) {
      addPolyline(mergedPath, "#00ff3b", 8, 2000000, 1);
    }

    if (showStepsOriginal && originalStepsSafe.length) {
      paintSteps(originalStepsSafe, "#facc15", 3, 900000);
    }

    if (showStepsPatched && patchedStepsSafe.length) {
      paintSteps(patchedStepsSafe, "#00ff3b", 4, 999999);
    }

    if (showClusterPoints && (debug?.clusterPoints?.length ?? 0) > 0) {
      const layer = new window.google.maps.Data();
      layer.setMap(map);
      layer.setStyle(() => ({
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 4,
          fillColor: "#a855f7",
          fillOpacity: 1,
          strokeColor: "#111827",
          strokeOpacity: 1,
          strokeWeight: 1,
        },
      }));
      dataLayersRef.current.push(layer);

      const pts = debug!.clusterPoints!;
      const BATCH = 2000;
      let i = 0;

      const addBatch = () => {
        const end = Math.min(i + BATCH, pts.length);
        for (; i < end; i++) {
          const p = pts[i];
          const lat = Number(p.latitude);
          const lng = Number(p.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

          layer.add(new window.google.maps.Data.Feature({ geometry: new window.google.maps.Data.Point({ lat, lng }) }));
          extend({ lat, lng });
        }
        if (i < pts.length) requestAnimationFrame(addBatch);
      };

      addBatch();
    }

    if (showClusterAnchors) {
      if (debug?.clusterFirst) addMarker(toPos(debug.clusterFirst)!, "#7c3aed", 8, 999999, "clusterFirst");
      if (debug?.clusterLast) addMarker(toPos(debug.clusterLast)!, "#7c3aed", 8, 999999, "clusterLast");
    }

    if (showKmlAnchors) {
      if (debug?.kmlStart) addMarker(toPos(debug.kmlStart)!, "#22c55e", 8, 999999, "kmlStart");
      if (debug?.kmlEnd) addMarker(toPos(debug.kmlEnd)!, "#ef4444", 8, 999999, "kmlEnd");
    }

    if (showRequestAnchors) {
      if (debug?.requestOrigin) addMarker(toPos(debug.requestOrigin)!, "#22c55e", 12, 999999, "REQUEST origin");
      if (debug?.requestDestination) addMarker(toPos(debug.requestDestination)!, "#ef4444", 12, 999999, "REQUEST destination");
    }

    if (showWaypoints && (debug?.waypoints?.length ?? 0) > 0) {
      addWaypointsLayer(debug!.waypoints as LatLng[]);
    }

    if (!bounds.isEmpty()) map.fitBounds(bounds);
  }, [
    ready,
    showPolicy,
    showGoogleOriginal,
    showPatchedSegments,
    showMerged,
    showStepsOriginal,
    showStepsPatched,
    showClusterPoints,
    showClusterAnchors,
    showKmlAnchors,
    showRequestAnchors,
    showWaypoints,
    policyPath,
    googleOriginalPath,
    patchedSegmentsSafe,
    hasPatchedSegments,
    mergedPath,
    hasMerged,
    originalStepsSafe,
    patchedStepsSafe,
    debug?.clusterPoints,
    debug?.clusterFirst,
    debug?.clusterLast,
    debug?.kmlStart,
    debug?.kmlEnd,
    debug?.requestOrigin,
    debug?.requestDestination,
    debug?.waypoints,
  ]);

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
      <div style={{ padding: 10, fontSize: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showPolicy} onChange={(e) => setShowPolicy(e.target.checked)} />
          Policy (Azul)
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showGoogleOriginal} onChange={(e) => setShowGoogleOriginal(e.target.checked)} />
          Google original (Rojo)
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showPatchedSegments} disabled={!hasPatchedSegments} onChange={(e) => setShowPatchedSegments(e.target.checked)} />
          Tramos Google nuevos (Verde FUERTE)
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showMerged} disabled={!hasMerged} onChange={(e) => setShowMerged(e.target.checked)} />
          MERGED (Amarillo BRILLANTE)
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showStepsOriginal} onChange={(e) => setShowStepsOriginal(e.target.checked)} />
          Steps originales (Amarillo)
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showStepsPatched} onChange={(e) => setShowStepsPatched(e.target.checked)} />
          Steps reparados (Verde FUERTE)
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showClusterPoints} onChange={(e) => setShowClusterPoints(e.target.checked)} />
          Cluster points (Violeta)
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showClusterAnchors} onChange={(e) => setShowClusterAnchors(e.target.checked)} />
          Cluster first/last
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showKmlAnchors} onChange={(e) => setShowKmlAnchors(e.target.checked)} />
          kmlStart/kmlEnd
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showRequestAnchors} onChange={(e) => setShowRequestAnchors(e.target.checked)} />
          Request origin/destination
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showWaypoints} onChange={(e) => setShowWaypoints(e.target.checked)} />
          Waypoints (Celeste)
        </label>
      </div>

      <div ref={mapDivRef} style={{ width: "100%", height: 520 }} />
    </div>
  );
}
