"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

type Stop = { position: any; kind: "anchor" | "waypoint" };

type UseClickDrawRouteParams = {
  status: "loading" | "ready" | "error" | "missing-key";
  mapReady: boolean;
  mapRef: MutableRefObject<any>;
  directionsServiceRef: MutableRefObject<any>;
  directionsRendererRef: MutableRefObject<any>;
  isApplyingHistoryRef: MutableRefObject<boolean>;
  isClickDrawingRef: MutableRefObject<boolean>;
  setClickDrawingMode: (value: boolean) => void;
  clickDrawStartRef: MutableRefObject<any>;
  clickDrawStopsRef: MutableRefObject<Stop[]>;
  clickDrawEndRef: MutableRefObject<any>;
  getSidebarOriginPosition: () => any;
  getSidebarDestinationValue: () => string;
  clearRenderedDirections: () => void;
  clearRouteMarkers: () => void;
  resetRouteHistory: () => void;
  pushRouteHistory: (result: any) => void;
  hidePreviewMarkersVisuals: () => void;
  renderClickDrawMarkers: () => void;
  hasRenderedRoute: () => boolean;
  setRouteError: (message: string) => void;
  syncSidebarFromClickDraw: (
    resolveAddresses?: boolean,
    routeResult?: any,
    promotedDestinationLabel?: string,
    promotedDestinationPosition?: any,
  ) => void;
};

type UseClickDrawRouteResult = {
  resetClickDrawState: () => void;
  promoteCurrentBToWaypointAndResume: () => void;
  removeAnchorAt: (stopIndex: number) => void;
};

export default function useClickDrawRoute({
  status,
  mapReady,
  mapRef,
  directionsServiceRef,
  directionsRendererRef,
  isApplyingHistoryRef,
  isClickDrawingRef,
  setClickDrawingMode,
  clickDrawStartRef,
  clickDrawStopsRef,
  clickDrawEndRef,
  getSidebarOriginPosition,
  getSidebarDestinationValue,
  clearRenderedDirections,
  clearRouteMarkers,
  resetRouteHistory,
  pushRouteHistory,
  hidePreviewMarkersVisuals,
  renderClickDrawMarkers,
  hasRenderedRoute,
  setRouteError,
  syncSidebarFromClickDraw,
}: UseClickDrawRouteParams): UseClickDrawRouteResult {
  const mapClickListenerRef = useRef<any>(null);
  const mapDblClickListenerRef = useRef<any>(null);
  const pendingMapClickTimeoutRef = useRef<number | null>(null);
  const ignoreMapClickUntilRef = useRef(0);
  const routeRequestIdRef = useRef(0);

  const getLatLngLiteral = (position: any) => {
    if (!position) return null;
    const lat = typeof position.lat === "function" ? position.lat() : position.lat;
    const lng = typeof position.lng === "function" ? position.lng() : position.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    return { lat, lng };
  };

  const isNearLatLng = (a: any, b: any, epsilon = 8e-5) => {
    const p1 = getLatLngLiteral(a);
    const p2 = getLatLngLiteral(b);
    if (!p1 || !p2) return false;
    return Math.abs(p1.lat - p2.lat) <= epsilon && Math.abs(p1.lng - p2.lng) <= epsilon;
  };

  const clearPendingMapClick = () => {
    if (pendingMapClickTimeoutRef.current == null) return;
    window.clearTimeout(pendingMapClickTimeoutRef.current);
    pendingMapClickTimeoutRef.current = null;
  };

  const beginClickDrawFrom = (startLatLng: any) => {
    if (!startLatLng) return;

    clearRenderedDirections();
    clearRouteMarkers();
    resetRouteHistory();
    setRouteError("");

    clickDrawStartRef.current = startLatLng;
    clickDrawStopsRef.current = [];
    clickDrawEndRef.current = null;
    setClickDrawingMode(true);
    directionsRendererRef.current?.setOptions?.({ draggable: false });
    hidePreviewMarkersVisuals();
    renderClickDrawMarkers();
    syncSidebarFromClickDraw(true);
  };

  const applyClickDrawRoute = async (finalizeRoute: boolean) => {
    if (!directionsServiceRef.current || !directionsRendererRef.current || !window.google?.maps) return;
    const requestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = requestId;
    const start = clickDrawStartRef.current;
    const stops = [...clickDrawStopsRef.current];
    const end = clickDrawEndRef.current;
    if (!start) return;

    let destination: any = null;
    let waypointStops: Stop[] = [];

    if (finalizeRoute) {
      if (!end) return;
      destination = end;
      waypointStops = stops.filter((s) => s?.position);
    } else {
      if (stops.length === 0) return;
      destination = stops[stops.length - 1]?.position;
      waypointStops = stops.slice(0, -1).filter((s) => s?.position);
    }

    try {
      const result = await directionsServiceRef.current.route({
        origin: start,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
        waypoints: waypointStops.map((stop) => ({ location: stop.position, stopover: stop.kind === "waypoint" })),
        optimizeWaypoints: false,
      });
      if (requestId !== routeRequestIdRef.current) return;

      isApplyingHistoryRef.current = true;
      directionsRendererRef.current.setDirections(result);

      // Keep user-picked click positions exactly as placed. Re-snapping them to
      // Google's returned geometry causes anchors to drift on every recalculation.
      clickDrawStopsRef.current = stops;
      syncSidebarFromClickDraw(finalizeRoute, result);

      if (finalizeRoute) {
        resetRouteHistory();
        pushRouteHistory(result);
        clearRouteMarkers();
        hidePreviewMarkersVisuals();
        renderClickDrawMarkers();
        setClickDrawingMode(false);
        directionsRendererRef.current?.setOptions?.({ draggable: true });
      } else {
        clearRouteMarkers();
        hidePreviewMarkersVisuals();
        renderClickDrawMarkers();
      }
    } catch {
      setRouteError("No se pudo calcular el tramo desde el mapa.");
    } finally {
      window.setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    }
  };

  const resetClickDrawState = () => {
    clearPendingMapClick();
    routeRequestIdRef.current += 1;
    clickDrawStartRef.current = null;
    clickDrawStopsRef.current = [];
    clickDrawEndRef.current = null;
    setClickDrawingMode(false);
  };

  const promoteCurrentBToWaypointAndResume = () => {
    if (!clickDrawEndRef.current) return;
    clearPendingMapClick();
    ignoreMapClickUntilRef.current = Date.now() + 450;
    const promotedDestinationPosition = clickDrawEndRef.current;
    const promotedDestinationLabel = getSidebarDestinationValue().trim();
    clickDrawStopsRef.current = [
      ...clickDrawStopsRef.current,
      { position: promotedDestinationPosition, kind: "waypoint" },
    ];
    clickDrawEndRef.current = null;
    setClickDrawingMode(true);
    directionsRendererRef.current?.setOptions?.({ draggable: false });
    resetRouteHistory();
    hidePreviewMarkersVisuals();
    renderClickDrawMarkers();
    syncSidebarFromClickDraw(false, undefined, promotedDestinationLabel, promotedDestinationPosition);
  };

  const removeAnchorAt = (stopIndex: number) => {
    if (!isClickDrawingRef.current) return;
    if (clickDrawEndRef.current) return;

    const stop = clickDrawStopsRef.current[stopIndex];
    if (!stop || stop.kind !== "anchor") return;

    clearPendingMapClick();
    ignoreMapClickUntilRef.current = Date.now() + 300;

    const nextStops = clickDrawStopsRef.current.filter((_, i) => i !== stopIndex);
    clickDrawStopsRef.current = nextStops;

    if (nextStops.length === 0) {
      clearRenderedDirections();
      clearRouteMarkers();
      hidePreviewMarkersVisuals();
      renderClickDrawMarkers();
      syncSidebarFromClickDraw(false);
      return;
    }

    renderClickDrawMarkers();
    syncSidebarFromClickDraw(false);
    void applyClickDrawRoute(false);
  };

  useEffect(() => {
    if (status !== "ready") return;
    if (!mapReady) return;
    if (!mapRef.current || !window.google?.maps) return;

    mapClickListenerRef.current?.remove?.();
    mapDblClickListenerRef.current?.remove?.();

    mapClickListenerRef.current = mapRef.current.addListener("click", (e: any) => {
      if (Date.now() < ignoreMapClickUntilRef.current) return;
      const latLng = e?.latLng;
      if (!latLng) return;

      clearPendingMapClick();
      pendingMapClickTimeoutRef.current = window.setTimeout(() => {
        pendingMapClickTimeoutRef.current = null;
        if (Date.now() < ignoreMapClickUntilRef.current) return;

        if (!isClickDrawingRef.current) {
          if (hasRenderedRoute()) return;
          const sidebarOrigin = getSidebarOriginPosition();
          if (!sidebarOrigin) return;
          beginClickDrawFrom(sidebarOrigin);
        }

        if (clickDrawEndRef.current) return;
        if (!clickDrawStartRef.current) return;

        clickDrawStopsRef.current = [...clickDrawStopsRef.current, { position: latLng, kind: "anchor" }];
        renderClickDrawMarkers();
        syncSidebarFromClickDraw(false);
        void applyClickDrawRoute(false);
      }, 360);
    });

    mapDblClickListenerRef.current = mapRef.current.addListener("dblclick", (e: any) => {
      clearPendingMapClick();
      ignoreMapClickUntilRef.current = Date.now() + 250;
      e?.domEvent?.preventDefault?.();
      e?.domEvent?.stopPropagation?.();

      const latLng = e?.latLng;
      if (!latLng) return;

      // Promote B even if marker dblclick does not fire first (event ordering can vary).
      if (!isClickDrawingRef.current && clickDrawEndRef.current) {
        if (isNearLatLng(latLng, clickDrawEndRef.current)) {
          promoteCurrentBToWaypointAndResume();
          return;
        }
      }

      if (!clickDrawStartRef.current || !isClickDrawingRef.current) {
        beginClickDrawFrom(latLng);
        return;
      }

      if (!clickDrawEndRef.current) {
        clickDrawEndRef.current = latLng;
        renderClickDrawMarkers();
        syncSidebarFromClickDraw(false);
        void applyClickDrawRoute(true);
      }
    });

    return () => {
      clearPendingMapClick();
      mapClickListenerRef.current?.remove?.();
      mapDblClickListenerRef.current?.remove?.();
      mapClickListenerRef.current = null;
      mapDblClickListenerRef.current = null;
    };
  }, [status, mapReady]);

  return {
    resetClickDrawState,
    promoteCurrentBToWaypointAndResume,
    removeAnchorAt,
  };
}
