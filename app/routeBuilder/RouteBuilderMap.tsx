"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps/loader";
import RouteBuilderSidebar from "./RouteBuilderSidebar";
import MapUndoOverlay from "./components/MapUndoOverlay";
import usePlacesAutocomplete from "./hooks/usePlacesAutocomplete";
import useClickDrawRoute from "./hooks/useClickDrawRoute";

export default function RouteBuilderMap() {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const directionsChangedListenerRef = useRef<any>(null);
  const routeHistoryRef = useRef<any[]>([]);
  const isApplyingHistoryRef = useRef(false);
  const isClickDrawingRef = useRef(false);
  const routeMarkersRef = useRef<any[]>([]);
  const clickDrawMarkersRef = useRef<any[]>([]);
  const clickDrawStartRef = useRef<any>(null);
  const clickDrawStopsRef = useRef<Array<{ position: any; kind: "anchor" | "waypoint" }>>([]);
  const clickDrawEndRef = useRef<any>(null);
  const endpointPreviewMarkersRef = useRef<{ origin: any | null; destination: any | null }>({
    origin: null,
    destination: null,
  });
  const endpointPreviewPositionsRef = useRef<{ origin: any | null; destination: any | null }>({
    origin: null,
    destination: null,
  });
  const waypointPreviewMarkersRef = useRef<any[]>([]);
  const waypointPreviewPositionsRef = useRef<any[]>([]);
  const originInputRef = useRef<HTMLInputElement | null>(null);
  const destinationInputRef = useRef<HTMLInputElement | null>(null);
  const waypointInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing-key">("loading");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [canUndoRouteEdit, setCanUndoRouteEdit] = useState(false);
  const [isClickDrawing, setIsClickDrawing] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  const setClickDrawingMode = (value: boolean) => {
    isClickDrawingRef.current = value;
    setIsClickDrawing(value);
  };

  const clearEndpointPreviewMarker = (kind: "origin" | "destination") => {
    endpointPreviewMarkersRef.current[kind]?.setMap?.(null);
    endpointPreviewMarkersRef.current[kind] = null;
    endpointPreviewPositionsRef.current[kind] = null;
  };

  const pushRouteHistory = (result: any) => {
    if (!result) return;
    const last = routeHistoryRef.current[routeHistoryRef.current.length - 1];
    if (last === result) return;
    routeHistoryRef.current.push(result);
    setCanUndoRouteEdit(routeHistoryRef.current.length > 1);
  };

  const clearRouteMarkers = () => {
    for (const marker of routeMarkersRef.current) marker?.setMap?.(null);
    routeMarkersRef.current = [];
  };

  const resetRouteHistory = () => {
    routeHistoryRef.current = [];
    setCanUndoRouteEdit(false);
  };

  const clearClickDrawMarkers = () => {
    for (const marker of clickDrawMarkersRef.current) marker?.setMap?.(null);
    clickDrawMarkersRef.current = [];
  };

  const renderClickDrawMarkers = () => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    clearClickDrawMarkers();

    const addMarker = (
      position: any,
      labelText: string,
      color: string,
      zIndex: number,
      scale = 9,
      fillOpacity = 1,
    ) => {
      if (!position) return;
      const markerOptions: any = {
        map,
        position,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity,
          strokeColor: "#0f172a",
          strokeWeight: 1,
        },
        zIndex,
      };
      if (labelText) {
        markerOptions.label = { text: labelText, color: "#ffffff", fontWeight: "700" };
      }
      const marker = new window.google.maps.Marker(markerOptions);

      if (labelText === "B") {
        marker.addListener?.("dblclick", (e: any) => {
          e?.domEvent?.preventDefault?.();
          e?.domEvent?.stopPropagation?.();
          promoteCurrentBToWaypointAndResume();
        });
      }
      clickDrawMarkersRef.current.push(marker);
    };

    addMarker(clickDrawStartRef.current, "A", "#16a34a", 1200, 10);
    let waypointNumber = 1;
    clickDrawStopsRef.current.forEach((stop, i) => {
      if (!stop?.position) return;
      if (stop.kind === "waypoint") {
        addMarker(stop.position, String(waypointNumber), "#2563eb", 1190 - i, 8);
        waypointNumber += 1;
        return;
      }
      addMarker(stop.position, "", "#f59e0b", 1185 - i, 6, 0.6);
    });
    if (clickDrawEndRef.current) addMarker(clickDrawEndRef.current, "B", "#dc2626", 1180, 10);
  };

  const fitPreviewPointsOrFocus = (fallbackPosition?: any) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    const previewPoints = [
      endpointPreviewPositionsRef.current.origin,
      ...waypointPreviewPositionsRef.current.filter(Boolean),
      endpointPreviewPositionsRef.current.destination,
    ].filter(Boolean);

    if (previewPoints.length >= 2) {
      const bounds = new window.google.maps.LatLngBounds();
      for (const p of previewPoints) bounds.extend(p);
      map.fitBounds(bounds);
      return;
    }

    const p = previewPoints[0] || fallbackPosition;
    if (!p) return;
    map.panTo(p);
    if ((map.getZoom?.() ?? 0) < 14) map.setZoom?.(14);
  };

  const drawEndpointPreviewMarker = (kind: "origin" | "destination", position: any, shouldFit = true) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !position) return;

    clearEndpointPreviewMarker(kind);

    const marker = new window.google.maps.Marker({
      map,
      position,
      label: {
        text: kind === "origin" ? "A" : "B",
        color: "#ffffff",
        fontWeight: "700",
      },
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: kind === "origin" ? "#16a34a" : "#dc2626",
        fillOpacity: 1,
        strokeColor: "#0f172a",
        strokeWeight: 1,
      },
      zIndex: 900,
    });

    endpointPreviewMarkersRef.current[kind] = marker;
    endpointPreviewPositionsRef.current[kind] = position;
    if (shouldFit) fitPreviewPointsOrFocus(position);
  };

  const clearWaypointPreviewMarker = (index: number) => {
    waypointPreviewMarkersRef.current[index]?.setMap?.(null);
    waypointPreviewMarkersRef.current[index] = null;
    waypointPreviewPositionsRef.current[index] = null;
  };

  const drawWaypointPreviewMarker = (index: number, position: any, shouldFit = true) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !position) return;

    clearWaypointPreviewMarker(index);

    const marker = new window.google.maps.Marker({
      map,
      position,
      label: {
        text: String(index + 1),
        color: "#ffffff",
        fontWeight: "700",
      },
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#2563eb",
        fillOpacity: 1,
        strokeColor: "#0f172a",
        strokeWeight: 1,
      },
      zIndex: 850 + index,
    });

    waypointPreviewMarkersRef.current[index] = marker;
    waypointPreviewPositionsRef.current[index] = position;
    if (shouldFit) fitPreviewPointsOrFocus(position);
  };

  const hidePreviewMarkersVisuals = () => {
    endpointPreviewMarkersRef.current.origin?.setMap?.(null);
    endpointPreviewMarkersRef.current.destination?.setMap?.(null);
    waypointPreviewMarkersRef.current.forEach((marker) => marker?.setMap?.(null));
  };

  const restorePreviewMarkersVisuals = () => {
    const originPos = endpointPreviewPositionsRef.current.origin;
    const destinationPos = endpointPreviewPositionsRef.current.destination;
    if (originPos) drawEndpointPreviewMarker("origin", originPos, false);
    if (destinationPos) drawEndpointPreviewMarker("destination", destinationPos, false);

    waypointPreviewPositionsRef.current.forEach((pos, index) => {
      if (!pos) return;
      drawWaypointPreviewMarker(index, pos, false);
    });
  };

  usePlacesAutocomplete({
    status,
    originInputRef,
    destinationInputRef,
    waypointInputRefs,
    waypointCount: waypoints.length,
    onOriginSelected: (value, pos) => {
      setOrigin(value);
      if (pos) drawEndpointPreviewMarker("origin", pos);
    },
    onDestinationSelected: (value, pos) => {
      setDestination(value);
      if (pos) drawEndpointPreviewMarker("destination", pos);
    },
    onWaypointSelected: (index, value, pos) => {
      setWaypoints((prev) => prev.map((item, i) => (i === index ? value : item)));
      if (pos) drawWaypointPreviewMarker(index, pos);
    },
  });

  const clearRenderedDirections = () => {
    const renderer = directionsRendererRef.current;
    if (!renderer) return;
    try {
      renderer.set("directions", null);
    } catch {
      try {
        renderer.setDirections?.({ routes: [] });
      } catch {
        console.log("[RouteBuilder] clearRenderedDirections failed");
      }
    }
  };

  const hasRenderedRoute = () => {
    const directions = directionsRendererRef.current?.getDirections?.();
    return Array.isArray(directions?.routes) && directions.routes.length > 0;
  };

  const { resetClickDrawState, promoteCurrentBToWaypointAndResume } = useClickDrawRoute({
    status,
    mapReady: isMapReady,
    mapRef,
    directionsServiceRef,
    directionsRendererRef,
    isApplyingHistoryRef,
    isClickDrawingRef,
    setClickDrawingMode,
    clickDrawStartRef,
    clickDrawStopsRef,
    clickDrawEndRef,
    getSidebarOriginPosition: () => endpointPreviewPositionsRef.current.origin,
    clearRenderedDirections,
    clearRouteMarkers,
    resetRouteHistory,
    pushRouteHistory,
    hidePreviewMarkersVisuals,
    renderClickDrawMarkers,
    hasRenderedRoute,
    setRouteError,
  });

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) {
      setStatus("missing-key");
      return;
    }

    let cancelled = false;

    loadGoogleMaps(key)
      .then(async () => {
        await window.google?.maps?.importLibrary?.("places");
        await window.google?.maps?.importLibrary?.("routes");
        if (cancelled) return;
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    if (!mapDivRef.current) return;
    if (!window.google?.maps) return;
    if (mapRef.current) return;

    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: -26.8318, lng: -65.2194 },
      zoom: 7,
      mapTypeId: "roadmap",
      disableDoubleClickZoom: true,
    });

    directionsServiceRef.current = new window.google.maps.DirectionsService();
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map: mapRef.current,
      draggable: true,
      suppressMarkers: true,
    });

    directionsChangedListenerRef.current = directionsRendererRef.current.addListener("directions_changed", () => {
      const result = directionsRendererRef.current?.getDirections?.();
      if (!result) return;
      if (isApplyingHistoryRef.current) return;
      pushRouteHistory(result);
      drawRouteMarkers(result);
    });

    setIsMapReady(true);
  }, [status]);

  useEffect(() => {
    if (!directionsRendererRef.current) return;
    directionsRendererRef.current.setOptions?.({ draggable: !isClickDrawing });
  }, [isClickDrawing]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "gmaps-pac-zindex-fix";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .pac-container {
        z-index: 100000 !important;
      }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;

    const t = window.setTimeout(() => {
      window.google.maps.event.trigger(mapRef.current, "resize");
      fitPreviewPointsOrFocus();
    }, 220);

    return () => window.clearTimeout(t);
  }, [sidebarCollapsed]);

  useEffect(() => {
    return () => {
      clearRouteMarkers();
      clearClickDrawMarkers();
      clearEndpointPreviewMarker("origin");
      clearEndpointPreviewMarker("destination");
      for (let i = 0; i < waypointPreviewMarkersRef.current.length; i += 1) clearWaypointPreviewMarker(i);
      directionsChangedListenerRef.current?.remove?.();
      directionsRendererRef.current?.setMap?.(null);
      setIsMapReady(false);
    };
  }, []);

  const setWaypointAt = (index: number, value: string) => {
    setWaypoints((prev) => prev.map((item, i) => (i === index ? value : item)));
    if (!value.trim()) clearWaypointPreviewMarker(index);
  };

  const addWaypoint = () => {
    setWaypoints((prev) => [...prev, ""]);
  };

  const relabelWaypointPreviewMarkers = () => {
    waypointPreviewMarkersRef.current.forEach((marker, i) => {
      marker?.setLabel?.({
        text: String(i + 1),
        color: "#ffffff",
        fontWeight: "700",
      });
      marker?.setZIndex?.(850 + i);
    });
  };

  const swapArrayItems = <T,>(arr: T[], a: number, b: number) => {
    const next = [...arr];
    const tmp = next[a];
    next[a] = next[b];
    next[b] = tmp;
    return next;
  };

  const removeWaypoint = (index: number) => {
    clearWaypointPreviewMarker(index);
    waypointPreviewMarkersRef.current = waypointPreviewMarkersRef.current.filter((_, i) => i !== index);
    waypointPreviewPositionsRef.current = waypointPreviewPositionsRef.current.filter((_, i) => i !== index);
    relabelWaypointPreviewMarkers();
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
    fitPreviewPointsOrFocus();
  };

  const moveWaypointUp = (index: number) => {
    if (index <= 0) return;
    setWaypoints((prev) => swapArrayItems(prev, index, index - 1));
    waypointPreviewMarkersRef.current = swapArrayItems(waypointPreviewMarkersRef.current, index, index - 1);
    waypointPreviewPositionsRef.current = swapArrayItems(waypointPreviewPositionsRef.current, index, index - 1);
    relabelWaypointPreviewMarkers();
    fitPreviewPointsOrFocus();
  };

  const moveWaypointDown = (index: number) => {
    if (index >= waypoints.length - 1) return;
    setWaypoints((prev) => swapArrayItems(prev, index, index + 1));
    waypointPreviewMarkersRef.current = swapArrayItems(waypointPreviewMarkersRef.current, index, index + 1);
    waypointPreviewPositionsRef.current = swapArrayItems(waypointPreviewPositionsRef.current, index, index + 1);
    relabelWaypointPreviewMarkers();
    fitPreviewPointsOrFocus();
  };

  const clearRoute = () => {
    clearRenderedDirections();
    clearRouteMarkers();
    clearClickDrawMarkers();
    resetClickDrawState();
    restorePreviewMarkersVisuals();
    resetRouteHistory();
    setRouteError("");
  };

  const undoRouteEdit = () => {
    if (!directionsRendererRef.current) return;
    if (routeHistoryRef.current.length <= 1) return;

    routeHistoryRef.current.pop();
    const previous = routeHistoryRef.current[routeHistoryRef.current.length - 1];
    if (!previous) {
      setCanUndoRouteEdit(false);
      return;
    }

    isApplyingHistoryRef.current = true;
    directionsRendererRef.current.setDirections(previous);
    drawRouteMarkers(previous);
    setCanUndoRouteEdit(routeHistoryRef.current.length > 1);
    window.setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  };

  const handleOriginChange = (value: string) => {
    setOrigin(value);
    if (!value.trim()) clearEndpointPreviewMarker("origin");
  };

  const handleDestinationChange = (value: string) => {
    setDestination(value);
    if (!value.trim()) clearEndpointPreviewMarker("destination");
  };

  const drawRouteMarkers = (result: any) => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    hidePreviewMarkersVisuals();

    clearRouteMarkers();

    const route = result?.routes?.[0];
    const legs = Array.isArray(route?.legs) ? route.legs : [];
    if (legs.length === 0) return;
    const requestWaypoints = Array.isArray(result?.request?.waypoints) ? result.request.waypoints : [];
    const hasDragAnchors = legs.some(
      (leg: any) => Array.isArray(leg?.via_waypoints) && leg.via_waypoints.length > 0,
    );

    const points: Array<{ kind: "origin" | "destination" | "waypoint" | "anchor"; position: any }> = [
      { kind: "origin", position: legs[0]?.start_location },
      ...legs.map((leg: any, index: number) => {
        if (index === legs.length - 1) return { kind: "destination" as const, position: leg?.end_location };
        if (hasDragAnchors) return { kind: "anchor" as const, position: leg?.end_location };
        const requestWaypoint = requestWaypoints[index];
        // In draggable edits, Google can add intermediate legs without exposing matching request.waypoints.
        // Be conservative: only draw a numbered waypoint when we can positively identify a stopover.
        const isStopover = requestWaypoint ? requestWaypoint.stopover !== false : false;
        return {
          kind: isStopover ? ("waypoint" as const) : ("anchor" as const),
          position: leg?.end_location,
        };
      }),
    ];

    let waypointNumber = 1;

    for (let i = 0; i < points.length; i += 1) {
      const item = points[i];
      if (!item?.position) continue;
      if (hasDragAnchors && item.kind === "anchor") continue;

      const color =
        item.kind === "origin"
          ? "#16a34a"
          : item.kind === "destination"
            ? "#dc2626"
            : item.kind === "waypoint"
              ? "#2563eb"
              : "#f59e0b";

      let label = "";
      if (item.kind === "origin") label = "A";
      else if (item.kind === "destination") label = "B";
      else if (item.kind === "waypoint") {
        label = String(waypointNumber);
        waypointNumber += 1;
      }

      const marker = new window.google.maps.Marker({
        map,
        position: item.position,
        ...(label
          ? {
              label: {
                text: label,
                color: "#ffffff",
                fontWeight: "700",
              },
            }
          : {}),
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: item.kind === "anchor" ? 7 : 10,
          fillColor: color,
          fillOpacity: item.kind === "anchor" ? 0.6 : 1,
          strokeColor: "#0f172a",
          strokeWeight: 1,
        },
        zIndex: 1000 + i,
      });

      if (item.kind === "destination") {
        marker.addListener?.("dblclick", (e: any) => {
          e?.domEvent?.preventDefault?.();
          e?.domEvent?.stopPropagation?.();
          promoteCurrentBToWaypointAndResume();
        });
      }

      routeMarkersRef.current.push(marker);
    }
  };

  const calculateRoute = async () => {
    if (!directionsServiceRef.current || !window.google?.maps) return;
    if (!origin.trim() || !destination.trim()) {
      setRouteError("Ingresa origen y destino.");
      return;
    }

    setRouteLoading(true);
    setRouteError("");

    try {
      const request = {
        origin: origin.trim(),
        destination: destination.trim(),
        travelMode: window.google.maps.TravelMode.DRIVING,
        waypoints: waypoints
          .map((value) => value.trim())
          .filter(Boolean)
          .map((location) => ({ location, stopover: true })),
        optimizeWaypoints: false,
      };

      const result = await directionsServiceRef.current.route(request);
      directionsRendererRef.current?.setDirections?.(result);
      clearClickDrawMarkers();
      resetClickDrawState();
      resetRouteHistory();
      pushRouteHistory(result);
      drawRouteMarkers(result);
    } catch {
      setRouteError("No se pudo calcular la ruta con esas direcciones.");
    } finally {
      setRouteLoading(false);
    }
  };

  const statusLabel =
    status === "loading"
      ? "Cargando Google Maps..."
      : status === "ready"
        ? "Google Maps listo"
        : status === "missing-key"
          ? "Falta NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY"
          : "Error cargando Google Maps";

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: sidebarCollapsed ? "42px minmax(0, 1fr)" : "340px minmax(0, 1fr)",
        height: 520,
        background: "#f8fafc",
        transition: "grid-template-columns 220ms ease",
      }}
    >
      <RouteBuilderSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        statusLabel={statusLabel}
        isReady={status === "ready"}
        origin={origin}
        destination={destination}
        waypoints={waypoints}
        routeLoading={routeLoading}
        routeError={routeError}
        originInputRef={originInputRef}
        destinationInputRef={destinationInputRef}
        setWaypointInputRef={(index, el) => {
          waypointInputRefs.current[index] = el;
        }}
        onDestinationChange={handleDestinationChange}
        onOriginChange={handleOriginChange}
        onWaypointChange={setWaypointAt}
        onAddWaypoint={addWaypoint}
        onRemoveWaypoint={removeWaypoint}
        onMoveWaypointUp={moveWaypointUp}
        onMoveWaypointDown={moveWaypointDown}
        onCalculateRoute={calculateRoute}
        onClearRoute={clearRoute}
      />

      <div style={{ position: "relative", zIndex: 1, minWidth: 0, background: "#e2e8f0" }}>
        <MapUndoOverlay visible={canUndoRouteEdit} onUndo={undoRouteEdit} />
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
