"use client";

import { useRouter } from "next/navigation";
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
  const geocoderRef = useRef<any>(null);
  const geocodeCacheRef = useRef<Map<string, string>>(new Map());
  const geocodeRequestIdRef = useRef(0);
  const routeHistoryRef = useRef<any[]>([]);
  const isApplyingHistoryRef = useRef(false);
  const isClickDrawingRef = useRef(false);
  const routeMarkersRef = useRef<any[]>([]);
  const clickDrawMarkersRef = useRef<any[]>([]);
  const clickDrawStartRef = useRef<any>(null);
  const clickDrawStopsRef = useRef<Array<{ position: any; kind: "anchor" | "waypoint" }>>([]);
  const clickDrawEndRef = useRef<any>(null);
  const clickDrawWaypointLabelsRef = useRef<string[]>([]);
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
  const [routeTitle, setRouteTitle] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveMessageTone, setSaveMessageTone] = useState<"ok" | "error" | "">("");
  const [saveModal, setSaveModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    nextHref?: string;
  }>({ open: false, title: "", message: "" });
  const [canUndoRouteEdit, setCanUndoRouteEdit] = useState(false);
  const [isClickDrawing, setIsClickDrawing] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const router = useRouter();

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
      onClick?: (event?: any) => void,
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
      if (onClick) {
        marker.addListener?.("click", (e: any) => {
          e?.domEvent?.preventDefault?.();
          e?.domEvent?.stopPropagation?.();
          onClick(e);
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
      addMarker(stop.position, "", "#f59e0b", 1185 - i, 6, 0.6, () => removeAnchorAt(i));
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

  const getLatLngLiteral = (position: any) => {
    if (!position) return null;
    const lat = typeof position.lat === "function" ? position.lat() : position.lat;
    const lng = typeof position.lng === "function" ? position.lng() : position.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    return { lat, lng };
  };

  const formatLatLngForInput = (position: any) => {
    const literal = getLatLngLiteral(position);
    if (!literal) return "";
    return `${literal.lat.toFixed(6)}, ${literal.lng.toFixed(6)}`;
  };

  const isCoordinateLabel = (value: string) => {
    const text = value.trim();
    return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text);
  };

  const getLatLngCacheKey = (position: any) => {
    const literal = getLatLngLiteral(position);
    if (!literal) return "";
    return `${literal.lat.toFixed(6)},${literal.lng.toFixed(6)}`;
  };

  const getGeocoder = () => {
    if (geocoderRef.current) return geocoderRef.current;
    if (!window.google?.maps?.Geocoder) return null;
    geocoderRef.current = new window.google.maps.Geocoder();
    return geocoderRef.current;
  };

  const reverseGeocodePosition = async (position: any) => {
    if (!position) return "";
    const cacheKey = getLatLngCacheKey(position);
    if (cacheKey && geocodeCacheRef.current.has(cacheKey)) {
      return geocodeCacheRef.current.get(cacheKey) || "";
    }

    const fallback = formatLatLngForInput(position);
    const geocoder = getGeocoder();
    const location = getLatLngLiteral(position);
    if (!geocoder || !location) return fallback;

    try {
      const response = await geocoder.geocode({ location });
      const label = response?.results?.[0]?.formatted_address || fallback;
      if (cacheKey) geocodeCacheRef.current.set(cacheKey, label);
      return label;
    } catch {
      if (cacheKey) geocodeCacheRef.current.set(cacheKey, fallback);
      return fallback;
    }
  };

  const syncSidebarFromClickDraw = (
    resolveAddresses = false,
    routeResult?: any,
    promotedDestinationLabel = "",
    promotedDestinationPosition?: any,
  ) => {
    const start = clickDrawStartRef.current;
    const end = clickDrawEndRef.current;
    const allStops = clickDrawStopsRef.current.filter((stop) => stop?.position);
    const waypointStops = allStops.filter((stop) => stop.kind === "waypoint");

    endpointPreviewPositionsRef.current.origin = start || null;
    endpointPreviewPositionsRef.current.destination = end || null;
    waypointPreviewPositionsRef.current = waypointStops.map((stop) => stop.position);

    if (!resolveAddresses) {
      const waypointFallbacks = waypointStops.map((stop) => formatLatLngForInput(stop.position)).filter(Boolean);
      setWaypoints((prev) => {
        const next: string[] = [];
        for (let i = 0; i < waypointFallbacks.length; i += 1) {
          const previousValue = prev[i]?.trim();
          const rememberedValue = clickDrawWaypointLabelsRef.current[i]?.trim();
          if (previousValue && !isCoordinateLabel(previousValue)) {
            next.push(previousValue);
            continue;
          }
          if (rememberedValue && !isCoordinateLabel(rememberedValue)) {
            next.push(rememberedValue);
            continue;
          }
          if (!end && i === waypointFallbacks.length - 1) {
            const previousDestination = (promotedDestinationLabel || destination).trim();
            if (previousDestination && !isCoordinateLabel(previousDestination)) {
              next.push(previousDestination);
              continue;
            }
          }
          next.push(waypointFallbacks[i]);
        }
        clickDrawWaypointLabelsRef.current = next;
        return next;
      });
      if (!end) setDestination("");
      if (!end && promotedDestinationPosition) {
        const promotedLabel = promotedDestinationLabel.trim();
        if (promotedLabel && !isCoordinateLabel(promotedLabel)) {
          setWaypoints((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const lastIndex = next.length - 1;
            next[lastIndex] = promotedLabel;
            clickDrawWaypointLabelsRef.current = next;
            return next;
          });
        } else {
          void (async () => {
            const resolved = (await reverseGeocodePosition(promotedDestinationPosition)).trim();
            if (!resolved || isCoordinateLabel(resolved)) return;
            setWaypoints((prev) => {
              if (prev.length === 0) return prev;
              const next = [...prev];
              const lastIndex = next.length - 1;
              next[lastIndex] = resolved;
              clickDrawWaypointLabelsRef.current = next;
              return next;
            });
          })();
        }
      }
      return;
    }

    setOrigin(start ? formatLatLngForInput(start) : "");
    setDestination(end ? formatLatLngForInput(end) : "");
    setWaypoints(waypointStops.map((stop) => formatLatLngForInput(stop.position)).filter(Boolean));

    const requestId = geocodeRequestIdRef.current + 1;
    geocodeRequestIdRef.current = requestId;

    void (async () => {
      const routeLegs = Array.isArray(routeResult?.routes?.[0]?.legs) ? routeResult.routes[0].legs : [];
      const startAddress = routeLegs[0]?.start_address;
      const destinationAddress = routeLegs[routeLegs.length - 1]?.end_address;

      const originLabel = startAddress || (start ? await reverseGeocodePosition(start) : "");
      const destinationLabel = destinationAddress || (end ? await reverseGeocodePosition(end) : "");

      const waypointLabels: string[] = [];
      for (let stopIndex = 0; stopIndex < allStops.length; stopIndex += 1) {
        const stop = allStops[stopIndex];
        if (stop.kind !== "waypoint") continue;
        const legAddress = routeLegs[stopIndex]?.end_address;
        if (legAddress) {
          waypointLabels.push(legAddress);
          continue;
        }
        const rememberedLabel = clickDrawWaypointLabelsRef.current[waypointLabels.length]?.trim();
        if (rememberedLabel && !isCoordinateLabel(rememberedLabel)) {
          waypointLabels.push(rememberedLabel);
          continue;
        }
        waypointLabels.push(await reverseGeocodePosition(stop.position));
      }

      if (requestId !== geocodeRequestIdRef.current) return;
      setOrigin(originLabel);
      setDestination(destinationLabel);
      const nextWaypointLabels = waypointLabels.filter(Boolean);
      clickDrawWaypointLabelsRef.current = nextWaypointLabels;
      setWaypoints(nextWaypointLabels);
    })();
  };

  const { resetClickDrawState, promoteCurrentBToWaypointAndResume, removeAnchorAt } = useClickDrawRoute({
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
    getSidebarDestinationValue: () => destination,
    clearRenderedDirections,
    clearRouteMarkers,
    resetRouteHistory,
    pushRouteHistory,
    hidePreviewMarkersVisuals,
    renderClickDrawMarkers,
    hasRenderedRoute,
    setRouteError,
    syncSidebarFromClickDraw,
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
      gestureHandling: "greedy",
      scrollwheel: true,
      disableDoubleClickZoom: true,
      clickableIcons: false,
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
    setSaveMessage("");
    setSaveMessageTone("");
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

    const points: Array<{ kind: "origin" | "destination" | "waypoint" | "anchor"; position: any }> = [
      { kind: "origin", position: legs[0]?.start_location },
      ...legs.map((leg: any, index: number) => {
        if (index === legs.length - 1) return { kind: "destination" as const, position: leg?.end_location };
        const requestWaypoint = requestWaypoints[index];
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
    if (!endpointPreviewPositionsRef.current.origin || !endpointPreviewPositionsRef.current.destination) {
      setRouteError("Selecciona Inicio y Fin desde las sugerencias de direcciones.");
      return;
    }
    const hasUnselectedWaypoint = waypoints.some((value, index) => {
      if (!value.trim()) return false;
      return !waypointPreviewPositionsRef.current[index];
    });
    if (hasUnselectedWaypoint) {
      setRouteError("Selecciona cada waypoint desde las sugerencias de direcciones.");
      return;
    }

    setRouteLoading(true);
    setRouteError("");
    setSaveMessage("");
    setSaveMessageTone("");

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
      directionsRendererRef.current?.setOptions?.({ draggable: true });
      clearClickDrawMarkers();
      resetClickDrawState();
      setClickDrawingMode(false);
      resetRouteHistory();
      pushRouteHistory(result);
      drawRouteMarkers(result);
    } catch (error: any) {
      const status = error?.code || error?.status || "";
      if (String(status).includes("NOT_FOUND")) {
        setRouteError("Hay direcciones sin seleccionar. Elige Inicio/Waypoints/Fin desde las sugerencias.");
      } else {
        setRouteError("No se pudo calcular la ruta con esas direcciones.");
      }
    } finally {
      setRouteLoading(false);
    }
  };

  const getRenderedRoutePoints = () => {
    const directions = directionsRendererRef.current?.getDirections?.();
    const route = directions?.routes?.[0];
    if (!route) return [];

    const toPolicyPoint = (position: any) => {
      const literal = getLatLngLiteral(position);
      if (!literal) return null;
      return { latitude: literal.lat, longitude: literal.lng };
    };

    const areNear = (
      a: { latitude: number; longitude: number } | null,
      b: { latitude: number; longitude: number } | null,
      epsilon = 1e-6
    ) => {
      if (!a || !b) return false;
      return Math.abs(a.latitude - b.latitude) <= epsilon && Math.abs(a.longitude - b.longitude) <= epsilon;
    };

    const denseStepPath: Array<{ latitude: number; longitude: number }> = [];
    const legs = Array.isArray(route?.legs) ? route.legs : [];
    for (const leg of legs) {
      const steps = Array.isArray(leg?.steps) ? leg.steps : [];
      for (const step of steps) {
        const stepPath = Array.isArray(step?.path) ? step.path : [];
        if (stepPath.length > 0) {
          for (const pathPoint of stepPath) {
            const p = toPolicyPoint(pathPoint);
            if (p && !areNear(denseStepPath[denseStepPath.length - 1] ?? null, p)) denseStepPath.push(p);
          }
          continue;
        }

        const start = toPolicyPoint(step?.start_location);
        const end = toPolicyPoint(step?.end_location);
        if (start && !areNear(denseStepPath[denseStepPath.length - 1] ?? null, start)) denseStepPath.push(start);
        if (end && !areNear(denseStepPath[denseStepPath.length - 1] ?? null, end)) denseStepPath.push(end);
      }
    }
    if (denseStepPath.length >= 2) return denseStepPath;

    const overviewPath = route?.overview_path;
    if (!Array.isArray(overviewPath)) return [];
    const overviewPoints: Array<{ latitude: number; longitude: number }> = [];
    for (const point of overviewPath) {
      const p = toPolicyPoint(point);
      if (p && !areNear(overviewPoints[overviewPoints.length - 1] ?? null, p)) overviewPoints.push(p);
    }
    return overviewPoints;
  };

  const getRenderedGoogleDraft = () => {
    const directions = directionsRendererRef.current?.getDirections?.();
    const route = directions?.routes?.[0];
    if (!route) return null;

    const toPolicyPoint = (position: any) => {
      const literal = getLatLngLiteral(position);
      if (!literal) return null;
      return { latitude: literal.lat, longitude: literal.lng };
    };

    const areNear = (
      a: { latitude: number; longitude: number } | null,
      b: { latitude: number; longitude: number } | null,
      epsilon = 1e-6
    ) => {
      if (!a || !b) return false;
      return Math.abs(a.latitude - b.latitude) <= epsilon && Math.abs(a.longitude - b.longitude) <= epsilon;
    };

    const legs = Array.isArray(route?.legs) ? route.legs : [];
    const steps: Array<{
      distance: any;
      duration: any;
      html_instructions: string;
      start_location: { latitude: number; longitude: number };
      end_location: { latitude: number; longitude: number };
      maneuver: string | null;
      polyline: string | null;
    }> = [];
    const densePath: Array<{ latitude: number; longitude: number }> = [];

    for (const leg of legs) {
      const legSteps = Array.isArray(leg?.steps) ? leg.steps : [];
      for (const step of legSteps) {
        const start = toPolicyPoint(step?.start_location);
        const end = toPolicyPoint(step?.end_location);
        if (!start || !end) continue;

        steps.push({
          distance: step?.distance ?? null,
          duration: step?.duration ?? null,
          html_instructions: String(step?.instructions ?? step?.html_instructions ?? ""),
          start_location: start,
          end_location: end,
          maneuver: typeof step?.maneuver === "string" ? step.maneuver : null,
          polyline: typeof step?.encoded_lat_lngs === "string" ? step.encoded_lat_lngs : null,
        });

        const stepPath = Array.isArray(step?.path) ? step.path : [];
        if (stepPath.length > 0) {
          for (const pathPoint of stepPath) {
            const p = toPolicyPoint(pathPoint);
            if (p && !areNear(densePath[densePath.length - 1] ?? null, p)) densePath.push(p);
          }
          continue;
        }

        if (!areNear(densePath[densePath.length - 1] ?? null, start)) densePath.push(start);
        if (!areNear(densePath[densePath.length - 1] ?? null, end)) densePath.push(end);
      }
    }

    if (densePath.length < 2) return null;

    let distanceM = 0;
    let durationS = 0;
    for (const leg of legs) {
      distanceM += Number(leg?.distance?.value ?? 0);
      durationS += Number(leg?.duration?.value ?? 0);
    }

    return {
      source: "routebuilder_directions",
      fetchedAt: new Date().toISOString(),
      overviewPolyline:
        typeof route?.overview_polyline === "string"
          ? route.overview_polyline
          : typeof route?.overview_polyline?.points === "string"
            ? route.overview_polyline.points
            : null,
      steps,
      densePath,
      totals: {
        distanceM,
        durationS,
        distanceKm: distanceM / 1000,
        durationMin: durationS / 60,
      },
    };
  };

  const saveRoute = async () => {
    const title = routeTitle.trim();
    if (!title) {
      setSaveMessageTone("error");
      setSaveMessage("Ingresa un nombre para la ruta.");
      return;
    }

    const route = getRenderedRoutePoints();
    if (route.length < 2) {
      setSaveMessageTone("error");
      setSaveMessage("Primero traza una ruta valida en el mapa.");
      return;
    }

    setSaveLoading(true);
    setSaveMessage("");
    setSaveMessageTone("");
    try {
      const googleDraft = getRenderedGoogleDraft();

      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, route, googleDraft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setSaveMessageTone("error");
        setSaveMessage("No se pudo guardar la ruta.");
        return;
      }
      setSaveMessageTone("ok");
      setSaveMessage("Ruta guardada correctamente.");
      const createdId = String(json?.id ?? "").trim();
      setSaveModal({
        open: true,
        title: "Ruta guardada",
        message: "¿Deseas validar la ruta en el editor activo?",
        nextHref: createdId ? `/routes/editor?routeId=${createdId}` : undefined,
      });
    } catch {
      setSaveMessageTone("error");
      setSaveMessage("No se pudo guardar la ruta.");
    } finally {
      setSaveLoading(false);
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
        routeTitle={routeTitle}
        origin={origin}
        destination={destination}
        waypoints={waypoints}
        routeLoading={routeLoading}
        routeError={routeError}
        saveLoading={saveLoading}
        saveMessage={saveMessage}
        saveMessageTone={saveMessageTone}
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
        onRouteTitleChange={setRouteTitle}
        onSaveRoute={saveRoute}
      />

      <div style={{ position: "relative", zIndex: 1, minWidth: 0, background: "#e2e8f0" }}>
        <MapUndoOverlay visible={canUndoRouteEdit} onUndo={undoRouteEdit} />
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {saveModal.open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 20000,
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
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{saveModal.title}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{saveModal.message}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setSaveModal((prev) => ({ ...prev, open: false }))}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--foreground)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                No por ahora
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = saveModal.nextHref;
                  setSaveModal((prev) => ({ ...prev, open: false }));
                  if (href) router.push(href);
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
                Si, validar ahora
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
