"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps/loader";
import RouteBuilderSidebar from "./RouteBuilderSidebar";

export default function RouteBuilderMap() {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const routeMarkersRef = useRef<any[]>([]);
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
  const originAutocompleteRef = useRef<any>(null);
  const destinationAutocompleteRef = useRef<any>(null);
  const waypointAutocompletesRef = useRef<any[]>([]);
  const waypointAutocompleteListenersRef = useRef<any[]>([]);
  const originAutocompleteListenerRef = useRef<any>(null);
  const destinationAutocompleteListenerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing-key">("loading");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const clearEndpointPreviewMarker = (kind: "origin" | "destination") => {
    endpointPreviewMarkersRef.current[kind]?.setMap?.(null);
    endpointPreviewMarkersRef.current[kind] = null;
    endpointPreviewPositionsRef.current[kind] = null;
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

  const drawEndpointPreviewMarker = (kind: "origin" | "destination", position: any) => {
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
    fitPreviewPointsOrFocus(position);
  };

  const clearWaypointPreviewMarker = (index: number) => {
    waypointPreviewMarkersRef.current[index]?.setMap?.(null);
    waypointPreviewMarkersRef.current[index] = null;
    waypointPreviewPositionsRef.current[index] = null;
  };

  const drawWaypointPreviewMarker = (index: number, position: any) => {
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
    fitPreviewPointsOrFocus(position);
  };

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
    });

    directionsServiceRef.current = new window.google.maps.DirectionsService();
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map: mapRef.current,
      draggable: false,
      suppressMarkers: true,
    });
  }, [status]);

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
      for (const marker of routeMarkersRef.current) marker?.setMap?.(null);
      clearEndpointPreviewMarker("origin");
      clearEndpointPreviewMarker("destination");
      for (let i = 0; i < waypointPreviewMarkersRef.current.length; i += 1) clearWaypointPreviewMarker(i);
      directionsRendererRef.current?.setMap?.(null);
      originAutocompleteListenerRef.current?.remove?.();
      destinationAutocompleteListenerRef.current?.remove?.();
      for (const listener of waypointAutocompleteListenersRef.current) listener?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    if (!window.google?.maps?.places?.Autocomplete) return;
    if (!originInputRef.current || !destinationInputRef.current) return;

    if (!originAutocompleteRef.current) {
      originAutocompleteRef.current = new window.google.maps.places.Autocomplete(originInputRef.current, {
        fields: ["formatted_address", "geometry", "name"],
      });
      originAutocompleteListenerRef.current = originAutocompleteRef.current.addListener("place_changed", () => {
        const place = originAutocompleteRef.current?.getPlace?.();
        const value = place?.formatted_address || place?.name || originInputRef.current?.value || "";
        setOrigin(value);
        const pos = place?.geometry?.location;
        if (pos) drawEndpointPreviewMarker("origin", pos);
      });
    }

    if (!destinationAutocompleteRef.current) {
      destinationAutocompleteRef.current = new window.google.maps.places.Autocomplete(destinationInputRef.current, {
        fields: ["formatted_address", "geometry", "name"],
      });
      destinationAutocompleteListenerRef.current = destinationAutocompleteRef.current.addListener("place_changed", () => {
        const place = destinationAutocompleteRef.current?.getPlace?.();
        const value = place?.formatted_address || place?.name || destinationInputRef.current?.value || "";
        setDestination(value);
        const pos = place?.geometry?.location;
        if (pos) drawEndpointPreviewMarker("destination", pos);
      });
    }
  }, [status]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!window.google?.maps?.places?.Autocomplete) return;

    for (const listener of waypointAutocompleteListenersRef.current) listener?.remove?.();
    waypointAutocompleteListenersRef.current = [];
    waypointAutocompletesRef.current = [];

    waypointInputRefs.current.forEach((inputEl, index) => {
      if (!inputEl) return;
      const ac = new window.google.maps.places.Autocomplete(inputEl, {
        fields: ["formatted_address", "geometry", "name"],
      });
      const listener = ac.addListener("place_changed", () => {
        const place = ac.getPlace?.();
        const value = place?.formatted_address || place?.name || inputEl.value || "";
        setWaypoints((prev) => prev.map((item, i) => (i === index ? value : item)));
        const pos = place?.geometry?.location;
        if (pos) drawWaypointPreviewMarker(index, pos);
      });

      waypointAutocompletesRef.current.push(ac);
      waypointAutocompleteListenersRef.current.push(listener);
    });
  }, [status, waypoints.length]);

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
    directionsRendererRef.current?.setDirections?.({ routes: [] });
    for (const marker of routeMarkersRef.current) marker?.setMap?.(null);
    routeMarkersRef.current = [];
    setRouteError("");
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

    for (const marker of routeMarkersRef.current) marker?.setMap?.(null);
    routeMarkersRef.current = [];

    const route = result?.routes?.[0];
    const legs = Array.isArray(route?.legs) ? route.legs : [];
    if (legs.length === 0) return;

    const points = [
      { kind: "origin" as const, position: legs[0]?.start_location },
      ...legs.map((leg: any, index: number) => ({
        kind: index === legs.length - 1 ? ("destination" as const) : ("waypoint" as const),
        position: leg?.end_location,
      })),
    ];

    for (let i = 0; i < points.length; i += 1) {
      const item = points[i];
      if (!item?.position) continue;

      const color =
        item.kind === "origin" ? "#16a34a" : item.kind === "destination" ? "#dc2626" : "#2563eb";

      const label =
        item.kind === "origin" ? "A" : item.kind === "destination" ? "B" : String(i);

      const marker = new window.google.maps.Marker({
        map,
        position: item.position,
        label: {
          text: label,
          color: "#ffffff",
          fontWeight: "700",
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#0f172a",
          strokeWeight: 1,
        },
        zIndex: 1000 + i,
      });

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
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
