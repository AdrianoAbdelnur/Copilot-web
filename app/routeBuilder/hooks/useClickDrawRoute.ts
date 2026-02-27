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

      isApplyingHistoryRef.current = true;
      directionsRendererRef.current.setDirections(result);

      const snappedLegs = result?.routes?.[0]?.legs;
      const firstLeg = Array.isArray(snappedLegs) ? snappedLegs[0] : null;
      if (firstLeg?.start_location) {
        clickDrawStartRef.current = firstLeg.start_location;
      }
      if (Array.isArray(snappedLegs) && snappedLegs.length > 0) {
        clickDrawStopsRef.current = clickDrawStopsRef.current.map((stop, index) => ({
          ...stop,
          position: snappedLegs[index]?.end_location || stop.position,
        }));
      }
      if (finalizeRoute) {
        const lastLeg = Array.isArray(snappedLegs) ? snappedLegs[snappedLegs.length - 1] : null;
        if (lastLeg?.end_location) {
          clickDrawEndRef.current = lastLeg.end_location;
        }
      }
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
    clickDrawStartRef.current = null;
    clickDrawStopsRef.current = [];
    clickDrawEndRef.current = null;
    setClickDrawingMode(false);
  };

  const promoteCurrentBToWaypointAndResume = () => {
    if (!clickDrawEndRef.current) return;
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
      }, 220);
    });

    mapDblClickListenerRef.current = mapRef.current.addListener("dblclick", (e: any) => {
      clearPendingMapClick();
      ignoreMapClickUntilRef.current = Date.now() + 250;
      e?.domEvent?.preventDefault?.();
      e?.domEvent?.stopPropagation?.();

      const latLng = e?.latLng;
      if (!latLng) return;

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
  };
}
