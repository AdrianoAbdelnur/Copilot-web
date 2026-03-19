"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LiveItem = {
  itemId: string;
  tripId: string | null;
  driver: { id: string; name: string; email: string };
  route: { title: string };
  vehicle: { plate: string; label: string };
  session: { active: boolean };
};

type ChatMessageItem = {
  id: string;
  text: string;
  status: "sent" | "delivered" | "spoken" | "read" | string;
  senderType?: "driver" | "dispatcher" | string;
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

export default function LiveTripChatPage() {
  const [items, setItems] = useState<LiveItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [chatHistoryError, setChatHistoryError] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessageItem[]>([]);

  const activeItems = useMemo(
    () => items.filter((x) => x.session.active && x.tripId),
    [items],
  );

  const refresh = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const res = await fetch("/api/trips/live/positions?status=active&limit=1000", {
        headers: authHeaders(),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.message || json?.error || "No se pudieron cargar viajes activos.");
        return;
      }
      const next = Array.isArray(json?.items) ? (json.items as LiveItem[]) : [];
      setItems(next);
      setSelectedItemId((prev) => {
        if (prev && next.some((x) => x.itemId === prev)) return prev;
        return next[0]?.itemId || "";
      });
    } catch {
      setError("Error de red cargando viajes activos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => activeItems.find((x) => x.itemId === selectedItemId) || null,
    [activeItems, selectedItemId],
  );

  const loadChatHistory = useCallback(async () => {
    const tripId = String(selected?.tripId || "").trim();
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
  }, [selected?.tripId]);

  useEffect(() => {
    if (!chatHistoryOpen) return;
    void loadChatHistory();
  }, [chatHistoryOpen, loadChatHistory, selected?.tripId]);

  useEffect(() => {
    if (!chatHistoryOpen) return;
    const t = setInterval(() => {
      void loadChatHistory();
    }, 4000);
    return () => clearInterval(t);
  }, [chatHistoryOpen, loadChatHistory]);

  const sendMessage = useCallback(async () => {
    const tripId = String(selected?.tripId || "").trim();
    const payload = text.trim();
    if (!tripId) {
      setStatus("Selecciona un chofer con viaje activo.");
      return;
    }
    if (!payload) {
      setStatus("Escribe un mensaje.");
      return;
    }

    try {
      setSending(true);
      setStatus("");
      setError("");
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
        setError(json?.message || json?.error || "No se pudo enviar el mensaje.");
        return;
      }
      setText("");
      setStatus("Mensaje enviado en tiempo real al chofer.");
      if (chatHistoryOpen) {
        await loadChatHistory();
      }
    } catch {
      setError("Error de red enviando mensaje.");
    } finally {
      setSending(false);
    }
  }, [chatHistoryOpen, loadChatHistory, selected?.tripId, text]);

  return (
    <div className="min-h-[calc(100vh-57px)] bg-background">
      <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Chat en vivo con chofer</h1>
            <p className="text-sm text-slate-500">Envia mensajes por WebSocket al chofer seleccionado.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/trips/live" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              Volver a mapa en vivo
            </Link>
            <button onClick={() => void refresh()} className="rounded-lg bg-[#137fec] px-3 py-2 text-sm font-semibold text-white">
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {error ? <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {status ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</div> : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Chofer activo</label>
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="mb-3 h-10 w-full rounded border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-[#137fec]"
          >
            {activeItems.map((item) => {
              const label = item.vehicle.plate || item.vehicle.label || item.driver.name || item.driver.email || item.itemId;
              return (
                <option key={item.itemId} value={item.itemId}>
                  {label} - {item.route.title || "ruta sin titulo"}
                </option>
              );
            })}
          </select>

          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div><span className="font-semibold">Chofer:</span> {selected?.driver.name || selected?.driver.email || "-"}</div>
            <div><span className="font-semibold">Trip:</span> {selected?.tripId || "-"}</div>
            <div><span className="font-semibold">Vehiculo:</span> {selected?.vehicle.plate || selected?.vehicle.label || "-"}</div>
          </div>

          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Historial</div>
              <button
                type="button"
                onClick={() => setChatHistoryOpen((v) => !v)}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              >
                {chatHistoryOpen ? "Ocultar" : "Ver mensajes"}
              </button>
            </div>
            {chatHistoryOpen ? (
              <div className="max-h-56 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
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
                  <div
                    key={msg.id}
                    className={`mb-2 rounded border px-2 py-1 ${
                      msg.senderType === "driver"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {msg.senderType === "driver" ? "Respuesta del chofer" : "Mensaje del despacho"}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          msg.senderType === "driver"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {msg.senderType === "driver" ? "Chofer" : "Despacho"}
                      </span>
                    </div>
                    <div className="text-sm text-slate-800">{msg.text}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Mensaje</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={140}
            placeholder="Ej: Al finalizar el tramo, detenerse en el punto de control norte."
            className="mb-2 w-full rounded border border-slate-200 bg-white p-2 text-sm text-slate-800 outline-none focus:border-[#137fec]"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">{text.trim().length}/140</div>
            <button
              onClick={() => void sendMessage()}
              disabled={sending || !selected?.tripId}
              className="rounded-lg bg-[#137fec] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Enviando..." : "Enviar al chofer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
