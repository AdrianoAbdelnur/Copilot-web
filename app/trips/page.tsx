"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/clientSession";

type UserItem = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type RouteItem = {
  _id: string;
  title?: string;
  google?: {
    totals?: {
      distanceM?: number;
    };
  };
};

type PopulatedUserRef = UserItem | string;
type PopulatedRouteRef = RouteItem | string;

type ProgressSegment = {
  kind: "real" | "inferred" | "pending";
  startPct: number;
  endPct: number;
};

type ProgressSummary = {
  realPct: number;
  inferredPct: number;
  pendingPct: number;
  latestPct: number;
  segments: ProgressSegment[];
};

type TripItem = {
  _id: string;
  title?: string;
  notes?: string;
  userId: PopulatedUserRef;
  routeId: PopulatedRouteRef;
  status: "active" | "paused" | "finished" | "aborted";
  createdAt?: string;
  startedAt: string;
  endedAt?: string | null;
  matchedDistanceM?: number;
  routeActivatedAt?: string | null;
  totals?: Record<string, number>;
  progressSummary?: ProgressSummary;
};

type StatusCounts = Record<TripItem["status"], number>;

type TripsMeta = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  hasMore: boolean;
  statusCounts: StatusCounts;
};

const PAGE_SIZE = 20;
const EMPTY_STATUS_COUNTS: StatusCounts = { active: 0, paused: 0, finished: 0, aborted: 0 };

const EMPTY_PROGRESS: ProgressSummary = {
  realPct: 0,
  inferredPct: 0,
  pendingPct: 100,
  latestPct: 0,
  segments: [{ kind: "pending", startPct: 0, endPct: 100 }],
};

function displayName(user: UserItem) {
  const full = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return full || user.email || user._id;
}

function displayDriverRef(ref: PopulatedUserRef | undefined | null) {
  if (!ref) return "-";
  if (typeof ref === "string") return ref;
  return displayName(ref);
}

function displayRouteRef(ref: PopulatedRouteRef | undefined | null) {
  if (!ref) return "-";
  if (typeof ref === "string") return ref;
  return ref.title || ref._id;
}

function tripStatusLabel(status?: string) {
  if (status === "active") return "iniciado / activo";
  if (status === "paused") return "pausado";
  if (status === "finished") return "finalizado";
  if (status === "aborted") return "abortado";
  return status || "-";
}

function tripStatusTone(status?: string) {
  if (status === "active") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "paused") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "finished") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "aborted") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDateForQuery(value: string, endOfDay = false) {
  if (!value) return "";
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`;
}

function formatMeters(value?: number) {
  const n = Number(value ?? 0) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} km`;
  return `${Math.round(n)} m`;
}

export default function TripsPage() {
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [tripDetail, setTripDetail] = useState<TripItem | null>(null);
  const [tripEvents, setTripEvents] = useState<any[]>([]);
  const [tripSamples, setTripSamples] = useState<any[]>([]);
  const [tripDetailLoading, setTripDetailLoading] = useState(false);
  const [tripDetailError, setTripDetailError] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [msg, setMsg] = useState("");
  const [meta, setMeta] = useState<TripsMeta>({
    page: 0,
    pageSize: PAGE_SIZE,
    total: 0,
    pages: 1,
    hasMore: false,
    statusCounts: EMPTY_STATUS_COUNTS,
  });

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip._id === selectedTripId) || null,
    [selectedTripId, trips],
  );

  const loadTrips = async ({ reset = false }: { reset?: boolean } = {}) => {
    const nextPage = reset ? 1 : meta.page + 1;
    if (!reset && !meta.hasMore) return;

    setMsg("");
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const query = new URLSearchParams({
        scope: "all",
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
        dateField: "createdAt",
        sortBy: "createdAt",
        includeProgress: "1",
      });
      if (statusFilter) query.set("status", statusFilter);
      if (fromDate) query.set("from", formatDateForQuery(fromDate));
      if (toDate) query.set("to", formatDateForQuery(toDate, true));

      const response = await fetch(`/api/trips?${query.toString()}`, {
        cache: "no-store",
        headers: getAuthHeaders(),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        setMsg(json?.error || "No se pudieron cargar los viajes.");
        return;
      }

      const nextItems = (json.items || []) as TripItem[];
      setTrips((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setMeta({
        page: Number(json?.meta?.page ?? nextPage),
        pageSize: Number(json?.meta?.pageSize ?? PAGE_SIZE),
        total: Number(json?.meta?.total ?? nextItems.length),
        pages: Number(json?.meta?.pages ?? 1),
        hasMore: Boolean(json?.meta?.hasMore),
        statusCounts: { ...EMPTY_STATUS_COUNTS, ...(json?.meta?.statusCounts ?? {}) },
      });

      if (reset) {
        setSelectedTripId("");
        setTripDetail(null);
        setTripEvents([]);
        setTripSamples([]);
        setTripDetailError("");
      }
    } catch {
      setMsg("No se pudieron cargar los viajes.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadTripDetail = async (tripId: string) => {
    setSelectedTripId(tripId);
    setTripDetailLoading(true);
    setTripDetailError("");
    try {
      const [tripRes, eventsRes, samplesRes] = await Promise.all([
        fetch(`/api/trips/${tripId}`, { headers: getAuthHeaders(), cache: "no-store" }),
        fetch(`/api/trips/${tripId}/events?limit=2000`, { headers: getAuthHeaders(), cache: "no-store" }),
        fetch(`/api/trips/${tripId}/samples?limit=10000`, { headers: getAuthHeaders(), cache: "no-store" }),
      ]);
      const tripJson = await tripRes.json().catch(() => ({}));
      const eventsJson = await eventsRes.json().catch(() => ({}));
      const samplesJson = await samplesRes.json().catch(() => ({}));

      if (!tripRes.ok || !tripJson?.ok) {
        setTripDetailError(tripJson?.error || "No se pudo cargar el detalle del viaje.");
        return;
      }

      setTripDetail(tripJson.item as TripItem);
      setTripEvents(Array.isArray(eventsJson?.items) ? eventsJson.items : []);
      setTripSamples(Array.isArray(samplesJson?.items) ? samplesJson.items : []);
    } catch {
      setTripDetailError("No se pudo cargar el detalle del viaje.");
    } finally {
      setTripDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadTrips({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressSummary = selectedTrip?.progressSummary || EMPTY_PROGRESS;
  const detailTrip = tripDetail || selectedTrip;

  return (
    <div className="min-h-[calc(100vh-57px)] bg-background text-slate-900">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              <span>Operaciones</span>
              <span className="material-symbols-outlined text-base">chevron_right</span>
              <span className="text-[#137fec]">Detalles de viajes</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">Detalles de viajes</h1>
            <p className="mt-1 text-sm text-slate-500">Consulta viajes reales por fecha de generación y revisa avance, estado y datos capturados.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/trips/live"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-base">map</span>
              Monitoreo en vivo
            </Link>
            <button
              onClick={() => loadTrips({ reset: true })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#137fec] px-4 py-2 text-sm font-bold text-white shadow-sm shadow-[#137fec]/20 transition hover:bg-[#126fd0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {msg ? (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 shadow-sm">
            {msg}
          </div>
        ) : null}

        <div className="mb-4 grid gap-4 md:grid-cols-4">
          <StatPill icon="play_circle" label="Iniciados / activos" value={meta.statusCounts.active} tone="blue" />
          <StatPill icon="pause_circle" label="Pausados" value={meta.statusCounts.paused} tone="amber" />
          <StatPill icon="task_alt" label="Finalizados" value={meta.statusCounts.finished} tone="emerald" />
          <StatPill icon="cancel" label="Abortados" value={meta.statusCounts.aborted} tone="rose" />
        </div>

        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="text-sm font-semibold text-slate-700">
              Fecha generación desde
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#137fec]"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Fecha generación hasta
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#137fec]"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Estado
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#137fec]"
              >
                <option value="">Todos</option>
                <option value="active">iniciado / activo</option>
                <option value="paused">pausado</option>
                <option value="finished">finalizado</option>
                <option value="aborted">abortado</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => loadTrips({ reset: true })}
                disabled={loading}
                className="h-10 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#126fd0] disabled:opacity-60"
              >
                Buscar
              </button>
              <button
                type="button"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setStatusFilter("");
                  setTimeout(() => void loadTrips({ reset: true }), 0);
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Limpiar
              </button>
            </div>
          </div>
        </section>

        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black tracking-tight">Viajes generados</h2>
                  <p className="text-sm text-slate-500">Ordenados por fecha de generación. Carga incremental de {PAGE_SIZE} registros.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {trips.length} de {meta.total} cargados
                </span>
              </div>
            </div>

            <div className="max-h-[720px] space-y-3 overflow-auto p-4">
              {loading && trips.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Cargando viajes...
                </div>
              ) : null}

              {trips.map((trip) => {
                const selected = selectedTripId === trip._id;
                const summary = trip.progressSummary || EMPTY_PROGRESS;
                return (
                  <button
                    key={trip._id}
                    onClick={() => void loadTripDetail(trip._id)}
                    className={`w-full rounded-xl border-l-4 bg-white p-4 text-left shadow-sm transition hover:shadow-md ${
                      selected ? "border-l-[#137fec] ring-2 ring-[#137fec]/20" : "border-l-slate-300"
                    } border border-slate-200`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">#{trip._id.slice(-6)}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tripStatusTone(trip.status)}`}>
                            {tripStatusLabel(trip.status)}
                          </span>
                        </div>
                        <div className="truncate text-sm font-bold text-slate-900">
                          {trip.title?.trim() || displayRouteRef(trip.routeId)}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">Chofer: {displayDriverRef(trip.userId)}</div>
                        <div className="mt-0.5 text-xs text-slate-500">Generado: {formatDateTime(trip.createdAt)}</div>
                      </div>
                      <span className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-[#137fec]">
                        Ver detalle
                      </span>
                    </div>

                    <RouteProgressBar summary={summary} compact />

                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>Inicio: {formatDateTime(trip.startedAt)}</span>
                      <span>Avance detectado: {summary.latestPct}%</span>
                      <span>Distancia: {formatMeters(trip?.totals?.distanceM)}</span>
                    </div>
                  </button>
                );
              })}

              {!loading && trips.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No hay viajes para los filtros seleccionados.
                </div>
              ) : null}

              {meta.hasMore ? (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => loadTrips()}
                    disabled={loadingMore}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {loadingMore ? "Cargando..." : `Cargar ${PAGE_SIZE} más`}
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-900 px-5 py-4 text-white">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Detalle operativo</span>
                <span className="inline-flex items-center gap-2 text-xs font-bold">
                  <span className="h-2 w-2 rounded-full bg-[#137fec]" />
                  {detailTrip ? tripStatusLabel(detailTrip.status).toUpperCase() : "SIN SELECCIÓN"}
                </span>
              </div>
              <h3 className="truncate text-lg font-bold">
                {detailTrip ? `#${detailTrip._id.slice(-8)}` : "Detalle de viaje"}
              </h3>
              <p className="mt-1 break-words text-xs text-slate-300">
                {detailTrip ? displayRouteRef(detailTrip.routeId) : "Seleccioná un viaje para revisar sus datos"}
              </p>
            </div>

            <div className="max-h-[720px] overflow-auto p-5">
              {tripDetailLoading ? (
                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Cargando detalle...
                </div>
              ) : null}

              {tripDetailError ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {tripDetailError}
                </div>
              ) : null}

              {!detailTrip ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Seleccioná un viaje para ver detalle.
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-black text-slate-900">Avance de datos</h4>
                      <span className="text-xs font-bold text-slate-500">{progressSummary.latestPct}% detectado</span>
                    </div>
                    <RouteProgressBar summary={progressSummary} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailStat label="Chofer" value={displayDriverRef(detailTrip.userId)} />
                    <DetailStat label="Estado" value={tripStatusLabel(detailTrip.status)} />
                    <DetailStat label="Generado" value={formatDateTime(detailTrip.createdAt)} />
                    <DetailStat label="Inicio" value={formatDateTime(detailTrip.startedAt)} />
                    <DetailStat label="Fin" value={formatDateTime(detailTrip.endedAt)} />
                    <DetailStat label="Ruta" value={displayRouteRef(detailTrip.routeId)} />
                    <DetailStat label="Distancia registrada" value={formatMeters(detailTrip?.totals?.distanceM)} />
                    <DetailStat label="Distancia en ruta" value={formatMeters(detailTrip?.matchedDistanceM)} />
                    <DetailStat label="Muestras" value={String(detailTrip?.totals?.samplesCount ?? tripSamples.length)} />
                    <DetailStat label="Eventos" value={String(detailTrip?.totals?.eventsCount ?? tripEvents.length)} />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900">Resumen</h4>
                      <Link href={`/trips/${detailTrip._id}`} className="text-xs font-semibold text-[#137fec] hover:underline">
                        Ir a detalle completo
                      </Link>
                    </div>
                    <div className="grid gap-1 text-xs text-slate-600">
                      <div>Datos reales: {progressSummary.realPct}%</div>
                      <div>Tramo inferido sin datos: {progressSummary.inferredPct}%</div>
                      <div>Pendiente: {progressSummary.pendingPct}%</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Últimos eventos</h4>
                    <div className="space-y-2">
                      {tripEvents.slice(-10).reverse().map((event, index) => (
                        <div key={event._id || index} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="break-words text-sm font-semibold text-slate-900">{String(event?.type || "evento")}</div>
                              <div className="mt-0.5 text-xs text-slate-500">{formatDateTime(event?.t)}</div>
                            </div>
                            <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">{index + 1}</span>
                          </div>
                        </div>
                      ))}
                      {tripEvents.length === 0 ? <div className="text-sm text-slate-500">Sin eventos recientes.</div> : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function RouteProgressBar({ summary, compact = false }: { summary?: ProgressSummary; compact?: boolean }) {
  const safeSummary = summary || EMPTY_PROGRESS;
  return (
    <div>
      <div className={`flex overflow-hidden rounded-full bg-slate-100 ${compact ? "h-2" : "h-4"}`}>
        {safeSummary.segments.map((segment, index) => {
          const width = Math.max(0, segment.endPct - segment.startPct);
          if (width <= 0) return null;
          return (
            <div
              key={`${segment.kind}-${segment.startPct}-${index}`}
              className={progressColor(segment.kind)}
              style={{ width: `${width}%` }}
              title={progressLabel(segment.kind)}
            />
          );
        })}
      </div>
      {!compact ? (
        <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
          <LegendDot color="bg-emerald-500" label={`Datos reales ${safeSummary.realPct}%`} />
          <LegendDot color="bg-amber-400" label={`Pasó sin datos ${safeSummary.inferredPct}%`} />
          <LegendDot color="bg-slate-300" label={`Pendiente ${safeSummary.pendingPct}%`} />
        </div>
      ) : null}
    </div>
  );
}

function progressColor(kind: ProgressSegment["kind"]) {
  if (kind === "real") return "bg-emerald-500";
  if (kind === "inferred") return "bg-amber-400";
  return "bg-slate-300";
}

function progressLabel(kind: ProgressSegment["kind"]) {
  if (kind === "real") return "Datos reales";
  if (kind === "inferred") return "Pasó sin datos";
  return "Pendiente";
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function StatPill({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: "blue" | "amber" | "emerald" | "rose" }) {
  const toneMap = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  } as const;

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm ${toneMap[tone]}`}>
      <span className="material-symbols-outlined">{icon}</span>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
        <div className="text-xl font-extrabold leading-none">{value}</div>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}
