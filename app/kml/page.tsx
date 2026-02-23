"use client";

import { useState } from "react";

export default function KmlPage() {
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [size, setSize] = useState(0);
  const [lastResponse, setLastResponse] = useState<any>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSize(file.size);

    const text = await file.text();

    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, kml: text }),
    });

    const json = await res.json();
    console.log("RESPUESTA DEL SERVIDOR:", json);
    setLastResponse(json);
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1 style={{ marginBottom: 12 }}>Cargar KML</h1>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6 }}>Nombre de la ruta</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: ruta 1"
          style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />
      </div>

      <input type="file" accept=".kml,application/vnd.google-earth.kml+xml,text/xml" onChange={onPick} />

      <div style={{ marginTop: 16, opacity: 0.8 }}>
        <div>Archivo: {fileName || "-"}</div>
        <div>Tamaño: {size ? `${size} bytes` : "-"}</div>
      </div>

      <div style={{ marginTop: 16, opacity: 0.8 }}>
        <div>Esto crea una Route en el backend y guarda title + kml + policyPack.</div>
        <div>Abrí consola (F12 ? Consola) para ver la respuesta.</div>
      </div>

      {lastResponse && (
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 6 }}><b>Respuesta del servidor</b></div>
          <pre style={{ padding: 12, background: "#f7f7f7", borderRadius: 8, overflow: "auto", maxHeight: 320, fontSize: 12 }}>
            {JSON.stringify(lastResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

