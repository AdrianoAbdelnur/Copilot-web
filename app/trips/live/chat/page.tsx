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
    } catch {
      setError("Error de red enviando mensaje.");
    } finally {
      setSending(false);
    }
  }, [selected?.tripId, text]);

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
