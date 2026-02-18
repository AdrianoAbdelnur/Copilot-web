"use client";

import { useEffect, useRef, useState } from "react";


type LatLng = { latitude: number; longitude: number };

declare global {
  interface Window {
    google?: any;
  }
}

const loadGooglePlaces = (apiKey: string) => {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.maps?.places) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps="1"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google script error")));
      return;
    }

    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.dataset.googleMaps = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google script error"));
    document.head.appendChild(s);
  });
};

export default function Page() {
  const originInputRef = useRef<HTMLInputElement | null>(null);
  const destInputRef = useRef<HTMLInputElement | null>(null);

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);

  const [originLabel, setOriginLabel] = useState("");
  const [destLabel, setDestLabel] = useState("");

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) {
      console.error("Falta NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY");
      return;
    }

    loadGooglePlaces(key)
      .then(() => {
        if (!originInputRef.current || !destInputRef.current) return;

        const o = new window.google.maps.places.Autocomplete(originInputRef.current, {
          fields: ["formatted_address", "geometry"],
          types: ["geocode"],
        });

        const d = new window.google.maps.places.Autocomplete(destInputRef.current, {
          fields: ["formatted_address", "geometry"],
          types: ["geocode"],
        });

        o.addListener("place_changed", () => {
          const p = o.getPlace();
          const loc = p?.geometry?.location;
          if (!loc) return;
          setOrigin({ latitude: loc.lat(), longitude: loc.lng() });
          setOriginLabel(p.formatted_address || "");
        });

        d.addListener("place_changed", () => {
          const p = d.getPlace();
          const loc = p?.geometry?.location;
          if (!loc) return;
          setDestination({ latitude: loc.lat(), longitude: loc.lng() });
          setDestLabel(p.formatted_address || "");
        });
      })
      .catch((e) => console.error(e));
  }, []);

  const calcular = async () => {
    if (!origin || !destination) {
      console.log("Seleccioná origen y destino desde el dropdown");
      return;
    }

    const r = await fetch("/api/google/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination, waypoints: [], debug: true }),
    });

    const data = await r.json();
    console.log("DIRECTIONS RESPONSE:", data);
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>
        Test Google Autocomplete + Directions
      </h2>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Origen</div>
          <input
            ref={originInputRef}
            placeholder="Escribí una dirección..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          />
          {originLabel ? (
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
              Seleccionado: {originLabel}
            </div>
          ) : null}
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Destino</div>
          <input
            ref={destInputRef}
            placeholder="Escribí una dirección..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          />
          {destLabel ? (
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
              Seleccionado: {destLabel}
            </div>
          ) : null}
        </div>

        <button
          onClick={calcular}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #222",
            background: "#222",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Calcular ruta (pegar al endpoint)
        </button>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Abrí la consola para ver el objeto.
        </div>
      </div>
    </div>
  );
}
