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
        onOriginSelected(value, place?.geometry?.location ?? null);
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
          onDestinationSelected(value, place?.geometry?.location ?? null);
        },
      );
    }
  }, [destinationInputRef, onDestinationSelected, onOriginSelected, originInputRef, status]);

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
        onWaypointSelected(index, value, place?.geometry?.location ?? null);
      });

      waypointAutocompletesRef.current.push(ac);
      waypointAutocompleteListenersRef.current.push(listener);
    });
  }, [onWaypointSelected, status, waypointCount, waypointInputRefs]);

  useEffect(() => {
    return () => {
      originAutocompleteListenerRef.current?.remove?.();
      destinationAutocompleteListenerRef.current?.remove?.();
      for (const listener of waypointAutocompleteListenersRef.current) listener?.remove?.();
    };
  }, []);
}
