"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

type UsePlacesAutocompleteParams = {
  status: "loading" | "ready" | "error" | "missing-key";
  originInputRef: MutableRefObject<HTMLInputElement | null>;
  destinationInputRef: MutableRefObject<HTMLInputElement | null>;
  waypointInputRefs: MutableRefObject<Array<HTMLInputElement | null>>;
  waypointCount: number;
  onOriginSelected: (value: string, position: any) => void;
  onDestinationSelected: (value: string, position: any) => void;
  onWaypointSelected: (index: number, value: string, position: any) => void;
};

export default function usePlacesAutocomplete({
  status,
  originInputRef,
  destinationInputRef,
  waypointInputRefs,
  waypointCount,
  onOriginSelected,
  onDestinationSelected,
  onWaypointSelected,
}: UsePlacesAutocompleteParams) {
  const originAutocompleteRef = useRef<any>(null);
  const destinationAutocompleteRef = useRef<any>(null);
  const waypointAutocompletesRef = useRef<any[]>([]);
  const waypointAutocompleteListenersRef = useRef<any[]>([]);
  const originAutocompleteListenerRef = useRef<any>(null);
  const destinationAutocompleteListenerRef = useRef<any>(null);
  const onOriginSelectedRef = useRef(onOriginSelected);
  const onDestinationSelectedRef = useRef(onDestinationSelected);
  const onWaypointSelectedRef = useRef(onWaypointSelected);

  useEffect(() => {
    onOriginSelectedRef.current = onOriginSelected;
  }, [onOriginSelected]);

  useEffect(() => {
    onDestinationSelectedRef.current = onDestinationSelected;
  }, [onDestinationSelected]);

  useEffect(() => {
    onWaypointSelectedRef.current = onWaypointSelected;
  }, [onWaypointSelected]);

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
        onOriginSelectedRef.current(value, place?.geometry?.location ?? null);
      });
    }

    if (!destinationAutocompleteRef.current) {
      destinationAutocompleteRef.current = new window.google.maps.places.Autocomplete(
        destinationInputRef.current,
        {
          fields: ["formatted_address", "geometry", "name"],
        },
      );
      destinationAutocompleteListenerRef.current = destinationAutocompleteRef.current.addListener(
        "place_changed",
        () => {
          const place = destinationAutocompleteRef.current?.getPlace?.();
          const value = place?.formatted_address || place?.name || destinationInputRef.current?.value || "";
          onDestinationSelectedRef.current(value, place?.geometry?.location ?? null);
        },
      );
    }
  }, [destinationInputRef, originInputRef, status]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!window.google?.maps?.places?.Autocomplete) return;

    for (const listener of waypointAutocompleteListenersRef.current) listener?.remove?.();
    waypointAutocompleteListenersRef.current = [];
    waypointAutocompletesRef.current = [];

    for (let index = 0; index < waypointCount; index += 1) {
      const inputEl = waypointInputRefs.current[index];
      if (!inputEl) continue;
      const ac = new window.google.maps.places.Autocomplete(inputEl, {
        fields: ["formatted_address", "geometry", "name"],
      });
      const listener = ac.addListener("place_changed", () => {
        const place = ac.getPlace?.();
        const value = place?.formatted_address || place?.name || inputEl.value || "";
        onWaypointSelectedRef.current(index, value, place?.geometry?.location ?? null);
      });

      waypointAutocompletesRef.current.push(ac);
      waypointAutocompleteListenersRef.current.push(listener);
    }
  }, [status, waypointCount, waypointInputRefs]);

  useEffect(() => {
    return () => {
      originAutocompleteListenerRef.current?.remove?.();
      destinationAutocompleteListenerRef.current?.remove?.();
      for (const listener of waypointAutocompleteListenersRef.current) listener?.remove?.();
    };
  }, []);
}
