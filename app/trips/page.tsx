"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type UserItem = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
};

type RouteItem = {
  _id: string;
  title?: string;
};

type TripPlanItem = {
  _id: string;
  driverUserId: string;
  routeId: string;
  plannedStartAt: string;
  status: "planned" | "assigned" | "in_progress" | "completed" | "cancelled";
  title?: string;
  notes?: string;
  tripId?: string | null;
};

type TripItem = {
  _id: string;
  userId: string;
  routeId: string;
  status: "active" | "paused" | "finished" | "aborted";
  startedAt: string;
  endedAt?: string | null;
  totals?: Record<string, number>;
};

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("token") || "";
  return token ? { Authorization: token } : {};
}

function displayName(u: UserItem) {
  const full = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  return full || u.email || u._id;
}

export default function TripsPage() {
  const [drivers, setDrivers] = useState<UserItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [plans, setPlans] = useState<TripPlanItem[]>([]);
  const [liveTrips, setLiveTrips] = useState<TripItem[]>([]);

  const [selectedTripId, setSelectedTripId] = useState("");
  const [tripDetail, setTripDetail] = useState<any>(null);
  const [tripEvents, setTripEvents] = useState<any[]>([]);
  const [tripSamples, setTripSamples] = useState<any[]>([]);

  const [driverFilter, setDriverFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [formDriverIds, setFormDriverIds] = useState<string[]>([]);
  const [formRouteId, setFormRouteId] = useState("");
  const [formStartAt, setFormStartAt] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const userById = useMemo(() => {
    const map = new Map<string, UserItem>();
    for (const d of drivers) map.set(d._id, d);
    return map;
  }, [drivers]);

  const routeById = useMemo(() => {
    const map = new Map<string, RouteItem>();
    for (const r of routes) map.set(r._id, r);
    return map;
  }, [routes]);

  const loadAll = async () => {
    setLoading(true);
    setMsg("");
    try {
      const [usersRes, routesRes, plansRes, liveRes] = await Promise.all([
        fetch("/api/users?paginated=false"),
        fetch("/api/routes"),
        fetch("/api/trip-plans?limit=200", { headers: authHeaders() }),
        fetch("/api/trips/live?limit=200", { headers: authHeaders() }),
      ]);

      const usersJson = await usersRes.json().catch(() => ({}));
      const routesJson = await routesRes.json().catch(() => ({}));
      const plansJson = await plansRes.json().catch(() => ({}));
      const liveJson = await liveRes.json().catch(() => ({}));

      const users = (usersJson?.users || []) as UserItem[];
      const driverCandidates = users.filter((u) => {
        const role = String(u.role || "").toLowerCase();
        return role === "driver";
      });

      setDrivers(driverCandidates);
      setRoutes((routesJson?.items || []) as RouteItem[]);
      setPlans((plansJson?.items || []) as TripPlanItem[]);
      setLiveTrips((liveJson?.items || []) as TripItem[]);

      if (formDriverIds.length === 0 && driverCandidates[0]?._id) setFormDriverIds([driverCandidates[0]._id]);
      if (!formRouteId && routesJson?.items?.[0]?._id) setFormRouteId(routesJson.items[0]._id);
      if (!formStartAt) {
        const now = new Date(Date.now() + 15 * 60 * 1000);
        setFormStartAt(now.toISOString().slice(0, 16));
      }
    } catch {
      setMsg("No se pudo cargar la data.");
    } finally {
      setLoading(false);
    }
  };

  const createPlan = async () => {
    setMsg("");
    if (formDriverIds.length === 0 || !formRouteId || !formStartAt) {
      setMsg("Completa drivers, ruta y hora.");
      return;
    }

    const res = await fetch("/api/trip-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        driverUserIds: formDriverIds,
        routeId: formRouteId,
        plannedStartAt: new Date(formStartAt).toISOString(),
        title: formTitle,
        notes: formNotes,
        status: "assigned",
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setMsg(json?.error || "No se pudo crear la asignaciÃ³n.");
      return;
    }

    setFormTitle("");
    setFormNotes("");
    const createdCount = Number(json?.createdCount || 0);
    setMsg(createdCount > 1 ? `Asignaciones creadas: ${createdCount}.` : "Asignacion creada.");
    await loadAll();
  };

  const patchPlanStatus = async (planId: string, status: TripPlanItem["status"]) => {
    const res = await fetch(`/api/trip-plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setMsg(json?.error || "No se pudo actualizar estado de asignaciÃ³n.");
      return;
    }
    await loadAll();
  };

  const loadTripDetail = async (tripId: string) => {
    setSelectedTripId(tripId);
    const [tripRes, eventsRes, samplesRes] = await Promise.all([
      fetch(`/api/trips/${tripId}`, { headers: authHeaders() }),
      fetch(`/api/trips/${tripId}/events?limit=200`, { headers: authHeaders() }),
      fetch(`/api/trips/${tripId}/samples?limit=200`, { headers: authHeaders() }),
    ]);

    const tripJson = await tripRes.json().catch(() => ({}));
    const eventsJson = await eventsRes.json().catch(() => ({}));
    const samplesJson = await samplesRes.json().catch(() => ({}));

    setTripDetail(tripJson?.item ?? null);
    setTripEvents(eventsJson?.items ?? []);
    setTripSamples(samplesJson?.items ?? []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/trips/live?limit=200", { headers: authHeaders() })
        .then((r) => r.json())
        .then((j) => setLiveTrips(j?.items || []))
        .catch(() => null);
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const filteredLiveTrips = useMemo(() => {
    return liveTrips.filter((t) => {
      if (driverFilter && t.userId !== driverFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    });
  }, [liveTrips, driverFilter, statusFilter]);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>Gestion de Viajes</h1>
      <div style={{ marginTop: 8, opacity: 0.8 }}>Asignacion de drivers, monitoreo en curso y detalle de trip.</div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={loadAll} disabled={loading} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
        {msg ? <div style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}>{msg}</div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14, marginTop: 14 }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Asignar Viaje</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={formRouteId} onChange={(e) => setFormRouteId(e.target.value)} style={{ padding: 10, borderRadius: 8 }}>
              <option value="">Ruta</option>
              {routes.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.title || r._id}
                </option>
              ))}
            </select>

            <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, maxHeight: 140, overflow: "auto" }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Drivers</div>
              <div style={{ display: "grid", gap: 6 }}>
                {drivers.map((d) => {
                  const checked = formDriverIds.includes(d._id);
                  return (
                    <label key={d._id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setFormDriverIds((prev) => {
                            if (e.target.checked) return Array.from(new Set([...prev, d._id]));
                            return prev.filter((id) => id !== d._id);
                          });
                        }}
                      />
                      {displayName(d)}
                    </label>
                  );
                })}
              </div>
            </div>

            <input type="datetime-local" value={formStartAt} onChange={(e) => setFormStartAt(e.target.value)} style={{ padding: 10, borderRadius: 8 }} />
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Titulo (opcional)" style={{ padding: 10, borderRadius: 8 }} />
          </div>
          <textarea
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Notas del viaje"
            style={{ width: "100%", marginTop: 8, minHeight: 76, padding: 10, borderRadius: 8 }}
          />
          <button onClick={createPlan} style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}>
            Crear asignacion
          </button>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Viajes en Curso</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              <option value="">Todos los drivers</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {displayName(d)}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              <option value="">active + paused</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="finished">finished</option>
              <option value="aborted">aborted</option>
            </select>
          </div>

          <div style={{ maxHeight: 340, overflow: "auto", display: "grid", gap: 8 }}>
            {filteredLiveTrips.map((t) => (
              <button
                key={t._id}
                onClick={() => loadTripDetail(t._id)}
                style={{
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 8,
                  border: selectedTripId === t._id ? "1px solid #111" : "1px solid #ddd",
                  background: selectedTripId === t._id ? "#f1f5f9" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700 }}>{displayName(userById.get(t.userId) || { _id: t.userId })}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Ruta: {routeById.get(t.routeId)?.title || t.routeId}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Estado: {t.status}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Inicio: {new Date(t.startedAt).toLocaleString()}</div>
                <div style={{ marginTop: 6 }}>
                  <Link
                    href={`/trips/${t._id}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 12, color: "#2563eb", textDecoration: "none" }}
                  >
                    Ver detalle
                  </Link>
                </div>
              </button>
            ))}
            {filteredLiveTrips.length === 0 ? <div style={{ opacity: 0.7 }}>No hay viajes con ese filtro.</div> : null}
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Asignaciones</h2>
          <div style={{ maxHeight: 380, overflow: "auto", display: "grid", gap: 8 }}>
            {plans.map((p) => (
              <div key={p._id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700 }}>{p.title || "Viaje programado"}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{displayName(userById.get(p.driverUserId) || { _id: p.driverUserId })}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Ruta: {routeById.get(p.routeId)?.title || p.routeId}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Inicio planificado: {new Date(p.plannedStartAt).toLocaleString()}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Estado: {p.status}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <button onClick={() => patchPlanStatus(p._id, "assigned")} style={{ padding: "6px 8px", borderRadius: 8 }}>assigned</button>
                  <button onClick={() => patchPlanStatus(p._id, "in_progress")} style={{ padding: "6px 8px", borderRadius: 8 }}>in_progress</button>
                  <button onClick={() => patchPlanStatus(p._id, "completed")} style={{ padding: "6px 8px", borderRadius: 8 }}>completed</button>
                  <button onClick={() => patchPlanStatus(p._id, "cancelled")} style={{ padding: "6px 8px", borderRadius: 8 }}>cancelled</button>
                </div>
              </div>
            ))}
            {plans.length === 0 ? <div style={{ opacity: 0.7 }}>Sin asignaciones todavÃ­a.</div> : null}
          </div>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Detalle de Viaje</h2>
          {!tripDetail ? <div style={{ opacity: 0.7 }}>SeleccionÃ¡ un viaje para ver detalle.</div> : null}
          {tripDetail ? (
            <>
              <div style={{ fontSize: 13 }}>Trip: {tripDetail._id}</div>
              <div style={{ fontSize: 13 }}>Driver: {displayName(userById.get(tripDetail.userId) || { _id: String(tripDetail.userId) })}</div>
              <div style={{ fontSize: 13 }}>Ruta: {routeById.get(tripDetail.routeId)?.title || String(tripDetail.routeId)}</div>
              <div style={{ fontSize: 13 }}>Estado: {tripDetail.status}</div>
              <div style={{ fontSize: 13 }}>Inicio: {new Date(tripDetail.startedAt).toLocaleString()}</div>
              {tripDetail.endedAt ? <div style={{ fontSize: 13 }}>Fin: {new Date(tripDetail.endedAt).toLocaleString()}</div> : null}
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                Samples: {tripDetail?.totals?.samplesCount ?? 0} | Events: {tripDetail?.totals?.eventsCount ?? 0} | Distancia: {tripDetail?.totals?.distanceM ?? 0}m
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>Ultimos events: {tripEvents.length} | Ultimos samples: {tripSamples.length}</div>
              <div style={{ marginTop: 8 }}>
                <Link href={`/trips/${tripDetail._id}`} style={{ color: "#2563eb", textDecoration: "none", fontSize: 13 }}>
                  Ir a detalle completo
                </Link>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}


