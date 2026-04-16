"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/clientSession";

type UserItem = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  memberships?: Array<{
    companyId?: string | { _id?: string };
    status?: string;
  }>;
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

type TripPlanItem = {
  _id: string;
  driverUserId: PopulatedUserRef;
  routeId: PopulatedRouteRef;
  plannedStartAt: string;
  status: "planned" | "assigned" | "in_progress" | "completed" | "cancelled";
  title?: string;
  notes?: string;
  tripId?: string | null;
};

type TripItem = {
  _id: string;
  title?: string;
  notes?: string;
  userId: PopulatedUserRef;
  routeId: PopulatedRouteRef;
  status: "active" | "paused" | "finished" | "aborted";
  startedAt: string;
  endedAt?: string | null;
  live?: {
    pos?: { latitude?: number; longitude?: number } | null;
  } | null;
  totals?: Record<string, number>;
};

type CompanyItem = {
  _id: string;
  name?: string;
};

function asCompanyId(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object") return String((raw as { _id?: unknown })._id || "").trim();
  return "";
}

function userHasActiveMembershipInCompany(user: UserItem, companyId: string): boolean {
  if (!companyId) return false;
  if (!Array.isArray(user.memberships)) return false;
  return user.memberships.some((m) => {
    const memberCompanyId = asCompanyId(m?.companyId);
    const status = String(m?.status || "active").trim().toLowerCase();
    return memberCompanyId === companyId && status !== "inactive";
  });
}

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

function resolveDriverDisplayFromTripDetail(
  tripDetail: any,
  userById: Map<string, UserItem>
): string {
  const ref = tripDetail?.userId;
  if (!ref) return "-";
  if (typeof ref === "object") return displayDriverRef(ref as PopulatedUserRef);
  return displayName(userById.get(String(ref)) || { _id: String(ref) });
}

function resolveRouteDisplayFromTripDetail(
  tripDetail: any,
  routeById: Map<string, RouteItem>
): string {
  const ref = tripDetail?.routeId;
  if (!ref) return "-";
  if (typeof ref === "object") return displayRouteRef(ref as PopulatedRouteRef);
  return routeById.get(String(ref))?.title || String(ref);
}

function tripUserIdValue(trip: TripItem): string {
  return typeof trip.userId === "string" ? trip.userId : String(trip.userId?._id || "");
}

function tripRouteLabelValue(trip: TripItem, routeById: Map<string, RouteItem>): string {
  if (typeof trip.routeId === "object" && trip.routeId) return trip.routeId.title || trip.routeId._id;
  return routeById.get(String(trip.routeId))?.title || String(trip.routeId);
}

function tripDriverDisplayValue(trip: TripItem, userById: Map<string, UserItem>): string {
  if (typeof trip.userId === "object" && trip.userId) return displayName(trip.userId);
  return displayName(userById.get(String(trip.userId)) || { _id: String(trip.userId) });
}

type LatLng = { latitude: number; longitude: number };

function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function realDistanceFromSamples(samples: any[]): number {
  let total = 0;
  let prev: LatLng | null = null;
  for (const sample of samples || []) {
    const p = sample?.pos;
    const lat = Number(p?.latitude);
    const lng = Number(p?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const curr = { latitude: lat, longitude: lng };
    if (prev) total += haversineMeters(prev, curr);
    prev = curr;
  }
  return Math.round(total);
}

function routePlannedDistanceM(ref: PopulatedRouteRef | undefined | null): number {
  if (!ref || typeof ref === "string") return 0;
  return Number(ref?.google?.totals?.distanceM ?? 0) || 0;
}

function tripStatusLabel(status?: string) {
  if (status === "active") return "activo";
  if (status === "paused") return "pausado";
  if (status === "finished") return "finalizado";
  if (status === "aborted") return "abortado";
  return status || "-";
}

function planStatusLabel(status?: string) {
  if (status === "planned") return "planificado";
  if (status === "assigned") return "asignado";
  if (status === "in_progress") return "en curso";
  if (status === "completed") return "completado";
  if (status === "cancelled") return "cancelado";
  return status || "-";
}

function tripStatusTone(status?: string) {
  if (status === "active") return "bg-blue-50 text-blue-700";
  if (status === "paused") return "bg-amber-50 text-amber-700";
  if (status === "finished") return "bg-emerald-50 text-emerald-700";
  if (status === "aborted") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

export default function TripsPage() {
  const [drivers, setDrivers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [plans, setPlans] = useState<TripPlanItem[]>([]);
  const [liveTrips, setLiveTrips] = useState<TripItem[]>([]);

  const [selectedTripId, setSelectedTripId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [tripDetail, setTripDetail] = useState<any>(null);
  const [tripEvents, setTripEvents] = useState<any[]>([]);
  const [tripSamples, setTripSamples] = useState<any[]>([]);
  const [tripDetailLoading, setTripDetailLoading] = useState(false);
  const [tripDetailError, setTripDetailError] = useState("");
  const [realDistanceByTripId, setRealDistanceByTripId] = useState<Record<string, number>>({});
  const tripDetailReqSeqRef = useRef(0);

  const [driverFilter, setDriverFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditTripModalOpen, setIsEditTripModalOpen] = useState(false);
  const [canManageTrips, setCanManageTrips] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tripActionLoading, setTripActionLoading] = useState(false);

  const [formCompanyIds, setFormCompanyIds] = useState<string[]>([]);
  const [formDriverIds, setFormDriverIds] = useState<string[]>([]);
  const [formRouteId, setFormRouteId] = useState("");
  const [formStartAt, setFormStartAt] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const [editTripId, setEditTripId] = useState("");
  const [editTripTitle, setEditTripTitle] = useState("");
  const [editTripNotes, setEditTripNotes] = useState("");
  const [editTripStatus, setEditTripStatus] = useState<TripItem["status"]>("active");
  const [editTripStartedAt, setEditTripStartedAt] = useState("");
  const [editTripEndedAt, setEditTripEndedAt] = useState("");

  const userById = useMemo(() => {
    const map = new Map<string, UserItem>();
    for (const driver of drivers) map.set(driver._id, driver);
    return map;
  }, [drivers]);

  const routeById = useMemo(() => {
    const map = new Map<string, RouteItem>();
    for (const route of routes) map.set(route._id, route);
    return map;
  }, [routes]);

  const availableDrivers = useMemo(() => {
    if (!isSuperAdmin) return drivers;
    if (formCompanyIds.length === 0) return [];
    return drivers.filter((driver) =>
      formCompanyIds.some((companyId) => userHasActiveMembershipInCompany(driver, companyId)),
    );
  }, [drivers, formCompanyIds, isSuperAdmin]);

  const loadAll = async () => {
    setLoading(true);
    setMsg("");
    try {
      const [usersRes, routesRes, plansRes, liveRes, meRes] = await Promise.all([
        fetch("/api/users?paginated=false"),
        fetch("/api/routes"),
        fetch("/api/trip-plans?limit=200", { headers: getAuthHeaders() }),
        fetch("/api/trips/live?limit=200", { headers: getAuthHeaders() }),
        fetch("/api/users/me", { headers: getAuthHeaders() }),
      ]);

      const usersJson = await usersRes.json().catch(() => ({}));
      const routesJson = await routesRes.json().catch(() => ({}));
      const plansJson = await plansRes.json().catch(() => ({}));
      const liveJson = await liveRes.json().catch(() => ({}));
      const meJson = await meRes.json().catch(() => ({}));

      const users = (usersJson?.users || []) as UserItem[];
      const driverCandidates = users.filter((u) => String(u.role || "").toLowerCase() === "driver");
      const role = String(meJson?.user?.role || "").toLowerCase();
      const canManage = role === "dispatcher" || role === "manager" || role === "admin" || role === "superadmin";
      const viewerIsSuperAdmin = role === "superadmin";

      setDrivers(driverCandidates);
      setRoutes((routesJson?.items || []) as RouteItem[]);
      setPlans((plansJson?.items || []) as TripPlanItem[]);
      setLiveTrips((liveJson?.items || []) as TripItem[]);
      setCanManageTrips(canManage);
      setIsSuperAdmin(viewerIsSuperAdmin);

      if (viewerIsSuperAdmin) {
        const companiesRes = await fetch("/api/companies", { headers: getAuthHeaders() });
        const companiesJson = await companiesRes.json().catch(() => ({}));
        const nextCompanies = Array.isArray(companiesJson?.items) ? (companiesJson.items as CompanyItem[]) : [];
        setCompanies(nextCompanies);

        const activeTenantId = String(meJson?.tenant?.tenantId || "").trim();
        if (formCompanyIds.length === 0) {
          if (activeTenantId) setFormCompanyIds([activeTenantId]);
          else if (nextCompanies[0]?._id) setFormCompanyIds([nextCompanies[0]._id]);
        }
      } else {
        setCompanies([]);
      }

      if (formDriverIds.length === 0 && driverCandidates[0]?._id) setFormDriverIds([driverCandidates[0]._id]);
      if (!formRouteId && routesJson?.items?.[0]?._id) setFormRouteId(routesJson.items[0]._id);
      if (!formStartAt) {
        const now = new Date(Date.now() + 15 * 60 * 1000);
        setFormStartAt(now.toISOString().slice(0, 16));
      }
    } catch {
      setMsg("No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  };

  const createPlan = async () => {
    setMsg("");
    if (isSuperAdmin && formCompanyIds.length === 0) {
      setMsg("Seleccioná al menos un tenant.");
      return;
    }
    if (formDriverIds.length === 0 || !formRouteId || !formStartAt) {
      setMsg("Completá choferes, ruta y hora.");
      return;
    }

    const res = await fetch("/api/trip-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        driverUserIds: formDriverIds,
        routeId: formRouteId,
        plannedStartAt: new Date(formStartAt).toISOString(),
        title: formTitle,
        notes: formNotes,
        status: "assigned",
        companyIds: isSuperAdmin ? formCompanyIds : undefined,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setMsg(json?.error || "No se pudo crear la asignación.");
      return;
    }

    setFormTitle("");
    setFormNotes("");
    setIsCreateModalOpen(false);
    const createdCount = Number(json?.createdCount || 0);
    setMsg(createdCount > 1 ? `Asignaciones creadas: ${createdCount}.` : "Asignación creada.");
    await loadAll();
  };

  const patchPlanStatus = async (planId: string, status: TripPlanItem["status"]) => {
    const res = await fetch(`/api/trip-plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setMsg(json?.error || "No se pudo actualizar el estado de la asignación.");
      return;
    }
    await loadAll();
  };

  const openEditTripModal = (trip: TripItem) => {
    setEditTripId(trip._id);
    setEditTripTitle(String(trip?.title || ""));
    setEditTripNotes(String(trip?.notes || ""));
    setEditTripStatus(trip.status);
    setEditTripStartedAt(trip?.startedAt ? new Date(trip.startedAt).toISOString().slice(0, 16) : "");
    setEditTripEndedAt(trip?.endedAt ? new Date(trip.endedAt).toISOString().slice(0, 16) : "");
    setIsEditTripModalOpen(true);
  };

  const saveTripEdits = async () => {
    if (!editTripId) return;
    setTripActionLoading(true);
    try {
      const res = await fetch(`/api/trips/${editTripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          title: editTripTitle,
          notes: editTripNotes,
          status: editTripStatus,
          startedAt: editTripStartedAt ? new Date(editTripStartedAt).toISOString() : undefined,
          endedAt: editTripEndedAt ? new Date(editTripEndedAt).toISOString() : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || "No se pudo editar el viaje.");
        return;
      }
      setIsEditTripModalOpen(false);
      setMsg("Viaje actualizado.");
      await loadAll();
      if (selectedTripId === editTripId) await loadTripDetail(editTripId);
    } finally {
      setTripActionLoading(false);
    }
  };

  const finalizeTrip = async (trip: TripItem) => {
    if (!canManageTrips) return;
    if (trip.status === "finished" || trip.status === "aborted") {
      setMsg("El viaje ya está cerrado.");
      return;
    }
    setTripActionLoading(true);
    try {
      const fallbackLat = Number(trip?.live?.pos?.latitude);
      const fallbackLng = Number(trip?.live?.pos?.longitude);
      const patch: Record<string, any> = {
        status: "finished",
        endedAt: new Date().toISOString(),
      };
      if (Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)) {
        patch.endPos = { latitude: fallbackLat, longitude: fallbackLng };
      }

      const res = await fetch(`/api/trips/${trip._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || "No se pudo finalizar el viaje.");
        return;
      }
      setMsg("Viaje finalizado.");
      await loadAll();
      if (selectedTripId === trip._id) await loadTripDetail(trip._id);
    } finally {
      setTripActionLoading(false);
    }
  };

  const deleteTrip = async (trip: TripItem) => {
    if (!canManageTrips) return;
    const confirmed = window.confirm(`¿Eliminar el viaje #${trip._id.slice(-6)}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    setTripActionLoading(true);
    try {
      const res = await fetch(`/api/trips/${trip._id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || "No se pudo eliminar el viaje.");
        return;
      }
      if (selectedTripId === trip._id) {
        setSelectedTripId("");
        setTripDetail(null);
        setTripEvents([]);
        setTripSamples([]);
        setTripDetailError("");
      }
      setMsg("Viaje eliminado.");
      await loadAll();
    } finally {
      setTripActionLoading(false);
    }
  };

  const loadTripDetail = async (
    tripId: string,
    options?: { preserveSelection?: boolean; silent?: boolean }
  ) => {
    const preserveSelection = !!options?.preserveSelection;
    const silent = !!options?.silent;
    const reqSeq = ++tripDetailReqSeqRef.current;

    if (!preserveSelection) {
      setSelectedPlanId("");
      setSelectedTripId(tripId);
      setTripDetailError("");
    }

    if (!silent) setTripDetailLoading(true);

    try {
      const [tripRes, eventsRes, samplesRes] = await Promise.all([
        fetch(`/api/trips/${tripId}`, { headers: getAuthHeaders() }),
        fetch(`/api/trips/${tripId}/events?limit=200`, { headers: getAuthHeaders() }),
        fetch(`/api/trips/${tripId}/samples?limit=200`, { headers: getAuthHeaders() }),
      ]);

      const tripJson = await tripRes.json().catch(() => ({}));
      const eventsJson = await eventsRes.json().catch(() => ({}));
      const samplesJson = await samplesRes.json().catch(() => ({}));

      if (reqSeq !== tripDetailReqSeqRef.current) return;

      const hasTrip = tripRes.ok && tripJson?.ok && tripJson?.item;
      if (!hasTrip) {
        setTripDetailError(tripJson?.error || "No se pudo cargar el detalle del viaje.");
        if (!tripDetail || String(tripDetail?._id || "") !== String(tripId)) {
          setTripDetail(null);
          setTripEvents([]);
          setTripSamples([]);
        }
        return;
      }

      setTripDetailError("");
      setTripDetail(tripJson.item);
      setTripEvents(Array.isArray(eventsJson?.items) ? eventsJson.items : []);
      setTripSamples(Array.isArray(samplesJson?.items) ? samplesJson.items : []);
    } catch {
      if (reqSeq !== tripDetailReqSeqRef.current) return;
      setTripDetailError("No se pudo actualizar el detalle del viaje.");
      if (!tripDetail || String(tripDetail?._id || "") !== String(tripId)) {
        setTripDetail(null);
        setTripEvents([]);
        setTripSamples([]);
      }
    } finally {
      if (reqSeq === tripDetailReqSeqRef.current && !silent) setTripDetailLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    setFormDriverIds((prev) => prev.filter((id) => availableDrivers.some((driver) => driver._id === id)));
  }, [availableDrivers, isSuperAdmin]);

  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/trips/live?limit=200", { headers: getAuthHeaders() })
        .then((r) => r.json())
        .then((j) => setLiveTrips(j?.items || []))
        .catch(() => null);
    }, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedTripId) return;
    const id = setInterval(() => {
      void loadTripDetail(selectedTripId, { preserveSelection: true, silent: true });
    }, 5000);
    return () => clearInterval(id);
  }, [selectedTripId]);

  const filteredLiveTrips = useMemo(() => {
    return liveTrips.filter((trip) => {
      if (driverFilter && tripUserIdValue(trip) !== driverFilter) return false;
      if (statusFilter && trip.status !== statusFilter) return false;
      return true;
    });
  }, [liveTrips, driverFilter, statusFilter]);

  const filteredPendingPlans = useMemo(() => {
    return plans.filter((plan) => {
      if (plan.tripId) return false;
      if (!(plan.status === "planned" || plan.status === "assigned" || plan.status === "in_progress")) return false;
      if (statusFilter) return false;
      if (!driverFilter) return true;
      const id = typeof plan.driverUserId === "string" ? plan.driverUserId : String(plan.driverUserId?._id || "");
      return id === driverFilter;
    });
  }, [plans, statusFilter, driverFilter]);

  useEffect(() => {
    let cancelled = false;

    const candidates = filteredLiveTrips
      .filter((trip) => (Number(trip?.totals?.distanceM ?? 0) || 0) <= 0)
      .filter((trip) => !realDistanceByTripId[trip._id])
      .slice(0, 8);

    if (candidates.length === 0) return;

    (async () => {
      for (const trip of candidates) {
        try {
          const res = await fetch(`/api/trips/${trip._id}/samples?limit=5000`, { headers: getAuthHeaders() });
          const json = await res.json().catch(() => ({}));
          const items = Array.isArray(json?.items) ? json.items : [];
          const distanceM = realDistanceFromSamples(items);
          if (cancelled || distanceM <= 0) continue;

          setRealDistanceByTripId((prev) => (prev[trip._id] ? prev : { ...prev, [trip._id]: distanceM }));
          setLiveTrips((prev) =>
            prev.map((t) =>
              t._id === trip._id
                ? { ...t, totals: { ...(t.totals ?? {}), distanceM } }
                : t
            )
          );
        } catch {
          // Ignore individual card distance failures.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filteredLiveTrips, realDistanceByTripId]);

  const activeCount = liveTrips.filter((trip) => trip.status === "active").length;
  const pausedCount = liveTrips.filter((trip) => trip.status === "paused").length;
  const finishedCount = liveTrips.filter((trip) => trip.status === "finished").length;
  const tripDetailRealDistanceM = useMemo(() => realDistanceFromSamples(tripSamples), [tripSamples]);

  useEffect(() => {
    if (!selectedTripId || tripDetailRealDistanceM <= 0) return;

    setTripDetail((prev: any) =>
      prev && prev._id === selectedTripId
        ? { ...prev, totals: { ...(prev.totals ?? {}), distanceM: tripDetailRealDistanceM } }
        : prev
    );

    setLiveTrips((prev) =>
      prev.map((trip) =>
        trip._id === selectedTripId
          ? {
              ...trip,
              totals: { ...(trip.totals ?? {}), distanceM: tripDetailRealDistanceM },
            }
          : trip
      )
    );
  }, [selectedTripId, tripDetailRealDistanceM]);

  return (
    <div className="min-h-[calc(100vh-57px)] bg-background text-slate-900">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              <span>Operaciones</span>
              <span className="material-symbols-outlined text-base">chevron_right</span>
              <span className="text-[#137fec]">Viajes</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">Gestión de viajes</h1>
            <p className="mt-1 text-sm text-slate-500">Asignación de choferes, monitoreo en curso y detalle del viaje.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#137fec]/10 px-3 py-1.5 text-sm font-semibold text-[#137fec]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#137fec]" />
              Sistema conectado
            </div>
            <Link
              href="/trips/live"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-base">map</span>
              Monitoreo en vivo
            </Link>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-base">add_circle</span>
              Crear viaje
            </button>
            <button
              onClick={loadAll}
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

        <div className="mb-4 grid gap-4 md:grid-cols-3">
          <StatPill icon="local_shipping" label="Activos" value={activeCount} tone="blue" />
          <StatPill icon="pause_circle" label="Pausados" value={pausedCount} tone="amber" />
          <StatPill icon="task_alt" label="Finalizados" value={finishedCount} tone="emerald" />
        </div>

        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
                  <button type="button" className="rounded-md bg-white px-4 py-2 font-bold text-[#137fec] shadow-sm">Activos ({activeCount})</button>
                  <button type="button" className="rounded-md px-4 py-2 font-medium text-slate-500">Pausados ({pausedCount})</button>
                  <button type="button" className="rounded-md px-4 py-2 font-medium text-slate-500">Finalizados ({finishedCount})</button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={driverFilter}
                    onChange={(e) => setDriverFilter(e.target.value)}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#137fec]"
                  >
                    <option value="">Todos los choferes</option>
                    {drivers.map((driver) => (
                      <option key={driver._id} value={driver._id}>{displayName(driver)}</option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#137fec]"
                  >
                    <option value="">Estado</option>
                    <option value="active">activo</option>
                    <option value="paused">pausado</option>
                    <option value="finished">finalizado</option>
                    <option value="aborted">abortado</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="max-h-[680px] space-y-3 overflow-auto p-4">
              {filteredPendingPlans.map((plan) => {
                const planId = String(plan._id || "");
                const selected = selectedPlanId === planId;
                const routeLabel =
                  typeof plan.routeId === "string" ? (routeById.get(plan.routeId)?.title || plan.routeId) : displayRouteRef(plan.routeId);
                const driverLabel =
                  typeof plan.driverUserId === "string"
                    ? displayName(userById.get(plan.driverUserId) || { _id: plan.driverUserId })
                    : displayDriverRef(plan.driverUserId);
                const plannedDate = plan.plannedStartAt ? new Date(plan.plannedStartAt).toLocaleString() : "-";
                return (
                  <button
                    key={`plan-${planId}`}
                    onClick={() => {
                      setSelectedPlanId(planId);
                      setSelectedTripId("");
                      setTripDetail(null);
                      setTripEvents([]);
                      setTripSamples([]);
                      setTripDetailError("");
                    }}
                    className={`w-full rounded-xl border-l-4 bg-white p-4 text-left shadow-sm transition hover:shadow-md ${
                      selected ? "border-l-amber-500 ring-2 ring-amber-300/30" : "border-l-amber-400"
                    } border border-slate-200`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">plan #{planId.slice(-6)}</span>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{planStatusLabel(plan.status)}</span>
                        </div>
                        <div className="truncate text-sm font-bold text-slate-900">{plan.title?.trim() || routeLabel}</div>
                        <div className="mt-0.5 text-xs text-slate-500">Chofer: {driverLabel}</div>
                        <div className="mt-0.5 text-xs text-slate-500">Inicio programado: {plannedDate}</div>
                      </div>
                      <span className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                        Pendiente
                      </span>
                    </div>
                  </button>
                );
              })}

              {filteredLiveTrips.map((trip) => {
                const selected = selectedTripId === trip._id;
                const samplesCount = Number(trip?.totals?.samplesCount ?? 0);
                const eventsCount = Number(trip?.totals?.eventsCount ?? 0);
                const persistedDistanceM = Number(trip?.totals?.distanceM ?? 0) || 0;
                const realDistanceM =
                  trip._id === selectedTripId && tripDetailRealDistanceM > 0
                    ? tripDetailRealDistanceM
                    : realDistanceByTripId[trip._id] || persistedDistanceM;
                const plannedDistanceM = routePlannedDistanceM(trip.routeId);
                const progressHint =
                  trip.status === "finished"
                    ? 100
                    : plannedDistanceM > 0
                      ? Math.max(0, Math.min(100, Math.round((realDistanceM / plannedDistanceM) * 100)))
                      : 0;

                return (
                  <button
                    key={trip._id}
                    onClick={() => {
                      void loadTripDetail(trip._id);
                    }}
                    className={`w-full rounded-xl border-l-4 bg-white p-4 text-left shadow-sm transition hover:shadow-md ${
                      selected ? "border-l-[#137fec] ring-2 ring-[#137fec]/20" : trip.status === "paused" ? "border-l-amber-400" : "border-l-[#137fec]"
                    } border border-slate-200`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">#{trip._id.slice(-6)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tripStatusTone(trip.status)}`}>
                            {tripStatusLabel(trip.status)}
                          </span>
                        </div>
                        <div className="truncate text-sm font-bold text-slate-900">
                          {trip.title?.trim() || tripRouteLabelValue(trip, routeById)}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">Chofer: {tripDriverDisplayValue(trip, userById)}</div>
                        {trip.title?.trim() ? (
                          <div className="mt-0.5 truncate text-[11px] text-slate-500">Ruta: {tripRouteLabelValue(trip, routeById)}</div>
                        ) : null}
                      </div>
                      <Link
                        href={`/trips/${trip._id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-[#137fec] hover:bg-blue-50"
                      >
                        Ver detalle
                      </Link>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-500">Inicio: {new Date(trip.startedAt).toLocaleString()}</span>
                        <span className="text-slate-700">{progressHint}% recorrido</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#137fec]" style={{ width: `${progressHint}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>Muestras: {trip?.totals?.samplesCount ?? 0}</span>
                        <span>Eventos: {trip?.totals?.eventsCount ?? 0}</span>
                        <span>Distancia: {realDistanceM}m</span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredLiveTrips.length === 0 && filteredPendingPlans.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No hay viajes con ese filtro.
                </div>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-900 px-5 py-4 text-white">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Seguimiento</span>
                <span className="inline-flex items-center gap-2 text-xs font-bold">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#137fec]" />
                  {tripDetail
                    ? tripStatusLabel(tripDetail.status).toUpperCase()
                    : selectedTripId
                      ? "SELECCIONADO"
                      : "SIN SELECCIÓN"}
                </span>
              </div>
              <h3 className="truncate text-lg font-bold">
                {tripDetail
                  ? `#${tripDetail._id.slice(-8)}`
                  : selectedTripId
                    ? `#${selectedTripId.slice(-8)}`
                    : "Detalle de viaje"}
              </h3>
              <p className="mt-1 break-words text-xs text-slate-300">
                {tripDetail
                  ? resolveRouteDisplayFromTripDetail(tripDetail, routeById)
                  : selectedTripId
                    ? "Cargando información del viaje seleccionado"
                    : "Seleccioná un viaje para ver información detallada"}
              </p>
            </div>

            <div className="max-h-[680px] overflow-auto p-5">
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

              {!tripDetail ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Seleccioná un viaje para ver detalle.
                </div>
              ) : (
                <div className="space-y-5">
                  {canManageTrips ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => finalizeTrip(tripDetail as TripItem)}
                        disabled={tripActionLoading || tripDetail.status === "finished" || tripDetail.status === "aborted"}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#137fec] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#126fd0] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="material-symbols-outlined text-sm">flag</span>
                        Finalizar viaje
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditTripModal(tripDetail as TripItem)}
                        disabled={tripActionLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTrip(tripDetail as TripItem)}
                        disabled={tripActionLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-700 bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-rose-900/25 transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:border-slate-500 disabled:bg-slate-600 disabled:text-slate-300 disabled:opacity-100"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                        Eliminar
                      </button>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailStat label="Chofer" value={resolveDriverDisplayFromTripDetail(tripDetail, userById)} />
                    <DetailStat label="Estado" value={tripStatusLabel(tripDetail.status)} />
                    <DetailStat label="Inicio" value={new Date(tripDetail.startedAt).toLocaleString()} />
                    <DetailStat label="Fin" value={tripDetail.endedAt ? new Date(tripDetail.endedAt).toLocaleString() : "-"} />
                    <DetailStat label="Título" value={String(tripDetail?.title || "-")} />
                    <DetailStat label="Notas" value={String(tripDetail?.notes || "-")} />
                    <DetailStat
                      label="Distancia"
                      value={`${tripDetailRealDistanceM || Number(tripDetail?.totals?.distanceM ?? 0) || 0}m`}
                    />
                    <DetailStat label="Vel. máxima" value={`${tripDetail?.totals?.maxSpeedKmh ?? 0} km/h`} />
                    <DetailStat label="Muestras" value={String(tripDetail?.totals?.samplesCount ?? 0)} />
                    <DetailStat label="Eventos" value={String(tripDetail?.totals?.eventsCount ?? 0)} />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900">Resumen en memoria</h4>
                      <Link href={`/trips/${tripDetail._id}`} className="text-xs font-semibold text-[#137fec] hover:underline">
                        Ir a detalle completo
                      </Link>
                    </div>
                    <div className="grid gap-1 text-xs text-slate-600">
                      <div className="break-words">Ruta: {resolveRouteDisplayFromTripDetail(tripDetail, routeById)}</div>
                      <div>Últimos eventos cargados: {tripEvents.length}</div>
                      <div>Últimas muestras cargadas: {tripSamples.length}</div>
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
                              <div className="mt-0.5 text-xs text-slate-500">{event?.t ? new Date(event.t).toLocaleString() : "-"}</div>
                            </div>
                            <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">{index + 1}</span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            {event?.pos?.latitude ?? "-"}, {event?.pos?.longitude ?? "-"}
                          </div>
                        </div>
                      ))}
                      {tripEvents.length === 0 ? <div className="text-sm text-slate-500">Sin eventos recientes.</div> : null}
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Asignaciones recientes</h4>
                    <div className="space-y-2">
                      {plans.slice(0, 8).map((plan) => (
                        <div key={plan._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="break-words text-sm font-semibold text-slate-900">{plan.title || "Viaje programado"}</div>
                              <div className="text-xs text-slate-500">
                                {displayDriverRef(
                                  typeof plan.driverUserId === "string"
                                    ? (userById.get(plan.driverUserId) || plan.driverUserId)
                                    : plan.driverUserId
                                )}
                              </div>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tripStatusTone(plan.status === "in_progress" ? "active" : plan.status === "cancelled" ? "aborted" : plan.status === "completed" ? "finished" : plan.status === "assigned" ? "paused" : undefined)}`}>
                              {planStatusLabel(plan.status)}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{new Date(plan.plannedStartAt).toLocaleString()}</div>
                          <div className="mt-1 text-xs text-slate-500 break-words">
                            Ruta: {typeof plan.routeId === "string" ? (routeById.get(plan.routeId)?.title || plan.routeId) : displayRouteRef(plan.routeId)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <MiniAction onClick={() => patchPlanStatus(plan._id, "assigned")}>Asignado</MiniAction>
                            <MiniAction onClick={() => patchPlanStatus(plan._id, "in_progress")}>En curso</MiniAction>
                            <MiniAction onClick={() => patchPlanStatus(plan._id, "completed")}>Completado</MiniAction>
                            <MiniAction onClick={() => patchPlanStatus(plan._id, "cancelled")}>Cancelar</MiniAction>
                          </div>
                        </div>
                      ))}
                      {plans.length === 0 ? <div className="text-sm text-slate-500">Sin asignaciones todavía.</div> : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {isEditTripModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Editar viaje</h2>
                <p className="mt-1 text-xs text-slate-500">Actualiza estado, fechas y detalles operativos</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditTripModalOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Estado</label>
                <select
                  value={editTripStatus}
                  onChange={(e) => setEditTripStatus(e.target.value as TripItem["status"])}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#137fec]"
                >
                  <option value="active">activo</option>
                  <option value="paused">pausado</option>
                  <option value="finished">finalizado</option>
                  <option value="aborted">abortado</option>
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Inicio</label>
                  <input
                    type="datetime-local"
                    value={editTripStartedAt}
                    onChange={(e) => setEditTripStartedAt(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#137fec]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Fin</label>
                  <input
                    type="datetime-local"
                    value={editTripEndedAt}
                    onChange={(e) => setEditTripEndedAt(e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#137fec]"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Título</label>
                <input
                  value={editTripTitle}
                  onChange={(e) => setEditTripTitle(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#137fec]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Notas</label>
                <textarea
                  value={editTripNotes}
                  onChange={(e) => setEditTripNotes(e.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#137fec]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 p-5">
              <button
                type="button"
                onClick={() => setIsEditTripModalOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveTripEdits}
                disabled={tripActionLoading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white shadow-sm shadow-[#137fec]/20 transition hover:bg-[#126fd0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Crear / asignar viaje</h2>
                <p className="mt-1 text-xs text-slate-500">Seleccioná una ruta y asignala a uno o varios choferes</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-auto p-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Ruta</label>
                <select
                  value={formRouteId}
                  onChange={(e) => setFormRouteId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
                >
                  <option value="">Seleccionar ruta</option>
                  {routes.map((route) => (
                    <option key={route._id} value={route._id}>{route.title || route._id}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Fecha y hora de inicio</label>
                <input
                  type="datetime-local"
                  value={formStartAt}
                  onChange={(e) => setFormStartAt(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
                />
              </div>

              {isSuperAdmin ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">Tenants destino</label>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {formCompanyIds.length} seleccionados
                    </span>
                  </div>
                  <div className="max-h-40 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {companies.map((company) => {
                      const checked = formCompanyIds.includes(company._id);
                      return (
                        <label key={company._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setFormCompanyIds((prev) => {
                                if (e.target.checked) return Array.from(new Set([...prev, company._id]));
                                return prev.filter((id) => id !== company._id);
                              });
                            }}
                          />
                          <span className="text-sm text-slate-800">{company.name || company._id}</span>
                        </label>
                      );
                    })}
                    {companies.length === 0 ? (
                      <div className="text-xs text-slate-500">No hay tenants disponibles para seleccionar.</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Choferes</label>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{formDriverIds.length} seleccionados</span>
                </div>
                <div className="max-h-52 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {availableDrivers.map((driver) => {
                    const checked = formDriverIds.includes(driver._id);
                    return (
                      <label key={driver._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setFormDriverIds((prev) => {
                              if (e.target.checked) return Array.from(new Set([...prev, driver._id]));
                              return prev.filter((id) => id !== driver._id);
                            });
                          }}
                        />
                        <span className="text-sm text-slate-800">{displayName(driver)}</span>
                      </label>
                    );
                  })}
                  {availableDrivers.length === 0 ? (
                    <div className="text-xs text-slate-500">
                      {isSuperAdmin ? "Seleccioná tenant para habilitar choferes." : "No hay choferes disponibles."}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Título (opcional)</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ej: Turno mañana - ruta norte"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Notas</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Instrucciones para el chofer"
                  className="min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 p-5">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={createPlan}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white shadow-sm shadow-[#137fec]/20 transition hover:bg-[#126fd0]"
              >
                <span className="material-symbols-outlined text-base">send</span>
                Crear viaje
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatPill({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: "blue" | "amber" | "emerald" }) {
  const toneMap = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
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

function MiniAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

