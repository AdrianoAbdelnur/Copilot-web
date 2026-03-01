"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps/loader";

type LiveItem = {
  itemId: string;
  tripId: string | null;
  status: string;
  driver: { id: string; name: string; email: string };
  route: { id: string; title: string };
  vehicle: { plate: string; label: string };
  session: { active: boolean };
  live: {
    t: string | null;
    pos: { latitude: number; longitude: number } | null;
    speedKmh: number | null;
    heading: number | null;
    onlineState: "online" | "stale" | "offline";
  };
};

type ChatMessageItem = {
  id: string;
  text: string;
  status: "sent" | "delivered" | "spoken" | "read" | string;
  createdAt: string | null;
  deliveredAt: string | null;
  spokenAt: string | null;
  readAt: string | null;
};

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const local = localStorage.getItem("token") || "";
  const cookieToken =
    document.cookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("token="))
      ?.split("=")[1] || "";
  const token = local || decodeURIComponent(cookieToken);
  return token ? { Authorization: token } : {};
}

function mapStateColor(state: LiveItem["live"]["onlineState"]) {
  if (state === "online") return "#16a34a";
  if (state === "stale") return "#d97706";
  return "#dc2626";
}

function stateLabel(state: LiveItem["live"]["onlineState"]) {
  if (state === "online") return "en vivo";
  if (state === "stale") return "sin refresco";
  return "offline";
}

function vehicleLabel(item: LiveItem) {
  return item.vehicle.plate || item.vehicle.label || item.driver.name || item.itemId.slice(-6);
}

function driverLabel(item: LiveItem) {
  return item.driver.name || item.driver.email || item.driver.id || item.itemId.slice(-6);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "-";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}



function markerIconFor(item: LiveItem) {
  const color = mapStateColor(item.live.onlineState);
  const heading = Number(item.live.heading);
  if (Number.isFinite(heading)) {
    return {
      path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      fillColor: color,
      fillOpacity: 0.95,
      strokeColor: "#ffffff",
      strokeWeight: 1.6,
      scale: 6,
      rotation: heading,
      anchor: new window.google.maps.Point(0, 2),
    };
  }
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 0.95,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 8,
  };
}

export default function LiveTripsMapPage() {
  const [items, setItems] = useState<LiveItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [chatOpenForItemId, setChatOpenForItemId] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [chatHistoryError, setChatHistoryError] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessageItem[]>([]);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const infoRef = useRef<any>(null);
  const autoSelectedRef = useRef(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyOnline && item.live.onlineState !== "online") return false;
      if (!q) return true;
      const haystack = [
        item.vehicle.plate,
        item.vehicle.label,
        item.driver.name,
        item.driver.email,
        item.route.title,
        item.itemId,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, onlyOnline, query]);
  const selectedItems = useMemo(
    () => filteredItems.filter((item) => selectedSet.has(item.itemId)),
    [filteredItems, selectedSet],
  );
  const chatTarget = useMemo(
    () => items.find((item) => item.itemId === chatOpenForItemId) || null,
    [items, chatOpenForItemId],
  );

  const centerOnDriver = useCallback((item: LiveItem) => {
    if (!mapRef.current || !window.google?.maps) return;
    if (!item.live.pos) return;
    const lat = Number(item.live.pos.latitude);
    const lng = Number(item.live.pos.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapRef.current.panTo({ lat, lng });
    if (typeof mapRef.current.getZoom === "function" && mapRef.current.getZoom() < 16) {
      mapRef.current.setZoom(16);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const res = await fetch("/api/trips/live/positions?status=all&limit=1000", {
        headers: authHeaders(),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "No se pudo cargar posiciones en vivo.");
        return;
      }
      const nextItems = Array.isArray(json?.items) ? (json.items as LiveItem[]) : [];
      setItems(nextItems);
    } catch {
      setError("Error de red consultando posiciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openChatModal = useCallback((item: LiveItem) => {
    if (!item.tripId) return;
    setChatOpenForItemId(item.itemId);
    setChatText("");
    setChatError("");
    setChatStatus("");
    setChatHistoryOpen(false);
    setChatHistoryError("");
    setChatHistory([]);
  }, []);

  const loadChatHistory = useCallback(async () => {
    const tripId = String(chatTarget?.tripId || "").trim();
    if (!tripId) return;

    try {
      setChatHistoryLoading(true);
      setChatHistoryError("");
      const res = await fetch(`/api/trips/${tripId}/chat/messages?limit=80`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setChatHistoryError(json?.message || json?.error || "No se pudo cargar el historial.");
        return;
      }
      const rows = Array.isArray(json?.items) ? (json.items as ChatMessageItem[]) : [];
      setChatHistory(rows);
    } catch {
      setChatHistoryError("Error de red cargando historial.");
    } finally {
      setChatHistoryLoading(false);
    }
  }, [chatTarget?.tripId]);

  const sendChatMessage = useCallback(async () => {
    const tripId = String(chatTarget?.tripId || "").trim();
    const payload = chatText.trim();

    if (!tripId) {
      setChatError("El chofer seleccionado no tiene viaje activo.");
      return;
    }
    if (!payload) {
      setChatError("Escribe un mensaje.");
      return;
    }
    if (payload.length > 140) {
      setChatError("Maximo 140 caracteres.");
      return;
    }

    try {
      setChatSending(true);
      setChatError("");
      setChatStatus("");

      const res = await fetch(`/api/trips/${tripId}/chat/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ text: payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setChatError(json?.message || json?.error || "No se pudo enviar el mensaje.");
        return;
      }

      setChatStatus("Mensaje enviado al chofer.");
      setChatText("");
      if (chatHistoryOpen) {
        await loadChatHistory();
      }
    } catch {
      setChatError("Error de red enviando mensaje.");
    } finally {
      setChatSending(false);
    }
  }, [chatHistoryOpen, chatTarget?.tripId, chatText, loadChatHistory]);

  useEffect(() => {
    if (!chatHistoryOpen) return;
    void loadChatHistory();
  }, [chatHistoryOpen, loadChatHistory]);

  useEffect(() => {
    if (!chatStatus) return;
    const t = setTimeout(() => setChatStatus(""), 3500);
    return () => clearTimeout(t);
  }, [chatStatus]);

  useEffect(() => {
    if (!chatHistoryOpen) return;
    const t = setInterval(() => {
      void loadChatHistory();
    }, 4000);
    return () => clearInterval(t);
  }, [chatHistoryOpen, loadChatHistory]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!active) return;
      const ms = document.hidden ? 30_000 : 15_000;
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, ms);
    };

    void refresh().then(schedule);
    const onVisibility = () => {
      if (timer) clearTimeout(timer);
      void refresh().then(schedule);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) return;
    loadGoogleMaps(key).then(() => setReady(true)).catch(() => setError("No se pudo cargar Google Maps."));
  }, []);

  useEffect(() => {
    if (!ready || !mapDivRef.current || !window.google?.maps) return;
    if (mapRef.current) return;
    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: -24.1858, lng: -65.2995 },
      zoom: 12,
      mapTypeId: "roadmap",
      streetViewControl: false,
      fullscreenControl: false,
    });
    infoRef.current = new window.google.maps.InfoWindow();
  }, [ready]);

  useEffect(() => {
    if (!items.length) return;
    setSelectedIds((prev) => {
      const allowed = new Set(items.map((item) => item.itemId));
      const kept = prev.filter((id) => allowed.has(id));
      if (kept.length > 0) return kept;
      if (autoSelectedRef.current) return kept;
      autoSelectedRef.current = true;
      return items.map((item) => item.itemId);
    });
  }, [items]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;

    const nextById = new Map<string, LiveItem>();
    for (const item of selectedItems) {
      if (!item.live.pos) continue;
      nextById.set(item.itemId, item);
    }

    for (const [tripId, marker] of markersRef.current.entries()) {
      if (!nextById.has(tripId)) {
        marker.setMap(null);
        markersRef.current.delete(tripId);
      }
    }

    for (const item of nextById.values()) {
      const lat = Number(item.live.pos?.latitude);
      const lng = Number(item.live.pos?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const icon = markerIconFor(item);
      const marker = markersRef.current.get(item.itemId);
      const position = { lat, lng };
      if (marker) {
        marker.setPosition(position);
        marker.setIcon(icon);
        marker.setTitle(vehicleLabel(item));
      } else {
        const created = new window.google.maps.Marker({
          map: mapRef.current,
          position,
          icon,
          title: driverLabel(item),
        });
        created.addListener("click", () => {
          const speed = item.live.speedKmh != null ? `${Math.round(item.live.speedKmh)} km/h` : "-";
          const vehicle = item.vehicle.plate || item.vehicle.label || "-";
          const html = `
            <div style="min-width:180px;font-family:system-ui">
              <div style="font-weight:700">${driverLabel(item)}</div>
              <div style="font-size:12px;margin-top:4px">Vehiculo: ${vehicle}</div>
              <div style="font-size:12px;margin-top:2px">Velocidad: ${speed}</div>
              <div style="font-size:12px;margin-top:2px">Estado: ${stateLabel(item.live.onlineState)}</div>
              <div style="font-size:12px;margin-top:2px">Actualizado: ${relativeTime(item.live.t)}</div>
            </div>
          `;
          infoRef.current?.setContent(html);
          infoRef.current?.open({ anchor: created, map: mapRef.current });
        });
        markersRef.current.set(item.itemId, created);
      }
    }
  }, [selectedItems]);

  const fitSelected = useCallback(() => {
    if (!mapRef.current || !window.google?.maps || selectedItems.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const item of selectedItems) {
      if (!item.live.pos) continue;
      bounds.extend({
        lat: Number(item.live.pos.latitude),
        lng: Number(item.live.pos.longitude),
      });
    }
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds);
  }, [selectedItems]);

  return (
    <div className="min-h-[calc(100vh-57px)] bg-background">
      <div className="mx-auto max-w-[1700px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Monitoreo en vivo</h1>
            <p className="text-sm text-slate-500">Selecciona drivers para ver posicion, velocidad y estado en el mapa.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/trips" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              Volver a viajes
            </Link>
            <button onClick={fitSelected} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              Centrar seleccionados
            </button>
            <button onClick={() => void refresh()} className="rounded-lg bg-[#137fec] px-3 py-2 text-sm font-semibold text-white">
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Drivers ({filteredItems.length} de {items.length}) | Seleccionados ({selectedItems.length})
              </div>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds(filteredItems.map((x) => x.itemId))}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  Ninguno
                </button>
              </div>
              <div className="mb-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por driver, chofer, ruta..."
                  className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-[#137fec]"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyOnline}
                  onChange={(e) => setOnlyOnline(e.target.checked)}
                />
                Solo en vivo
              </label>
            </div>
            <div className="max-h-[70vh] overflow-auto p-2">
              {filteredItems.map((item) => {
                const checked = selectedSet.has(item.itemId);
                const speed = item.live.speedKmh != null ? `${Math.round(item.live.speedKmh)} km/h` : "-";
                const badgeColor =
                  item.session.active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600";
                const rowTone =
                  item.session.active
                    ? "border-emerald-300 bg-emerald-50/40"
                    : "border-slate-200";
                return (
                  <div
                    key={item.itemId}
                    onDoubleClick={() => {
                      if (item.session.active) centerOnDriver(item);
                    }}
                    className={`mb-2 flex gap-3 rounded-lg border p-2 hover:bg-slate-50 ${rowTone}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const on = e.target.checked;
                        if (on) {
                          setSelectedIds((prev) =>
                            prev.includes(item.itemId) ? prev : [...prev, item.itemId],
                          );
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => id !== item.itemId));
                        }
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-bold text-slate-900">
                          <span
                            className={`material-symbols-outlined mr-1 align-[-3px] text-base ${item.session.active ? "text-emerald-600" : "text-slate-400"}`}
                          >
                            person
                          </span>
                          {driverLabel(item)}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeColor}`}>
                          {item.session.active ? "sesion iniciada" : "sin sesion"}
                        </span>
                      </div>
                      <div className="truncate text-xs text-slate-500">Driver: {item.driver.name || item.driver.email || "-"}</div>
                      {item.vehicle.plate || item.vehicle.label ? (
                        <div className="truncate text-xs text-slate-500">
                          Vehiculo: {item.vehicle.plate || item.vehicle.label}
                        </div>
                      ) : null}
                      <div className="truncate text-xs text-slate-500">Ruta: {item.route.title || item.route.id || "-"}</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex gap-3 text-xs text-slate-600">
                          <span>Vel: {speed}</span>
                          <span>Act: {relativeTime(item.live.t)}</span>
                        </div>
                        {/*
                          Chat deshabilitado temporalmente para produccion.
                          Rehabilitar cuando realtime quede desplegado en Render.
                        */}
                        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          Chat pronto
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredItems.length === 0 ? <div className="p-4 text-sm text-slate-500">No hay drivers para ese filtro.</div> : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="h-[70vh] w-full" ref={mapDivRef} />
          </section>
        </div>

        {chatOpenForItemId && chatTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-900">Chat con chofer</div>
                  <div className="text-sm text-slate-500">
                    {driverLabel(chatTarget)} {chatTarget.route.title ? `- ${chatTarget.route.title}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpenForItemId(null)}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  Cerrar
                </button>
              </div>

              {chatError ? (
                <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{chatError}</div>
              ) : null}
              {chatStatus ? (
                <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{chatStatus}</div>
              ) : null}

              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setChatHistoryOpen((v) => !v)}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  {chatHistoryOpen ? "Ocultar historial" : "Ver historial"}
                </button>
                {chatHistoryOpen ? (
                  <button
                    type="button"
                    onClick={() => void loadChatHistory()}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    {chatHistoryLoading ? "Cargando..." : "Actualizar"}
                  </button>
                ) : null}
              </div>

              {chatHistoryOpen ? (
                <div className="mb-3 max-h-56 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
                  {chatHistoryError ? (
                    <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{chatHistoryError}</div>
                  ) : null}
                  {chatHistoryLoading ? (
                    <div className="text-xs text-slate-500">Cargando historial...</div>
                  ) : null}
                  {!chatHistoryLoading && chatHistory.length === 0 ? (
                    <div className="text-xs text-slate-500">No hay mensajes para este viaje.</div>
                  ) : null}
                  {chatHistory.map((msg) => (
                    <div key={msg.id} className="mb-2 rounded border border-slate-200 bg-white px-2 py-1">
                      <div className="text-sm text-slate-800">{msg.text}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span>Enviado: {formatDateTime(msg.createdAt)}</span>
                        {msg.deliveredAt || msg.status === "delivered" || msg.status === "spoken" || msg.status === "read" ? (
                          <span>Recibido: {formatDateTime(msg.deliveredAt || msg.createdAt)}</span>
                        ) : (
                          <span>Recibido: pendiente</span>
                        )}
                        {msg.readAt || msg.status === "read" ? (
                          <span>Leido: {formatDateTime(msg.readAt || msg.spokenAt || msg.deliveredAt || msg.createdAt)}</span>
                        ) : (
                          <span>Leido: pendiente</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <textarea
                value={chatText}
                onChange={(e) => setChatText(e.target.value.slice(0, 140))}
                rows={5}
                maxLength={140}
                placeholder="Escribe un mensaje para el chofer..."
                className="mb-2 w-full rounded border border-slate-200 bg-white p-2 text-sm text-slate-800 outline-none focus:border-[#137fec]"
              />

              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500">{chatText.trim().length}/140</div>
                <button
                  type="button"
                  onClick={() => void sendChatMessage()}
                  disabled={chatSending || !chatTarget.tripId}
                  className="rounded-lg bg-[#137fec] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {chatSending ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
