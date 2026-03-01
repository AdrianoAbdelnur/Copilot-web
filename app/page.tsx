"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type QuickCard = {
  href: string;
  title: string;
  description: string;
  badge: string;
  icon: string;
  tone: "primary" | "indigo" | "orange";
};

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;

    fetch("/api/users/me", { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})))
      .then((json) => {
        if (!alive) return;
        const role = String(json?.user?.role || "").toLowerCase();
        setIsAdmin(role === "admin");
      })
      .catch(() => {
        if (!alive) return;
        setIsAdmin(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const cards = useMemo<QuickCard[]>(() => {
    const base: QuickCard[] = [
      {
        href: "/routes/create",
        title: "Cargar ruta",
        description: "Iniciá una ruta por KML o RouteBuilder y continuá con validación en el editor.",
        badge: "Crear ruta",
        icon: "upload_file",
        tone: "primary",
      },
      {
        href: "/routes",
        title: "Rutas",
        description: "Compilá, validá y editá recorridos con herramientas centradas en mapa.",
        badge: "Editor activo",
        icon: "route",
        tone: "indigo",
      },
      {
        href: "/routes/marks",
        title: "Personalizar rutas",
        description: "Agregá marcadores, POIs y tramos para completar los detalles de la ruta.",
        badge: "Editor de mapa",
        icon: "place",
        tone: "orange",
      },
    ];

    if (isAdmin) {
      base.push({
        href: "/admin",
        title: "Administración",
        description: "Gestioná usuarios, roles y permisos del panel operativo.",
        badge: "Control de acceso",
        icon: "admin_panel_settings",
        tone: "primary",
      });
    }

    return base;
  }, [isAdmin]);

  const toneClasses: Record<QuickCard["tone"], { icon: string; badge: string; button: string }> = {
    primary: {
      icon: "bg-blue-50 text-blue-600",
      badge: "bg-blue-50 text-blue-700",
      button: "bg-[#137fec] text-white hover:bg-[#126fd0]",
    },
    indigo: {
      icon: "bg-indigo-50 text-indigo-600",
      badge: "bg-indigo-50 text-indigo-700",
      button: "bg-slate-900 text-white hover:bg-slate-800",
    },
    orange: {
      icon: "bg-orange-50 text-orange-600",
      badge: "bg-orange-50 text-orange-700",
      button: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50",
    },
  };

  return (
    <div className="min-h-[calc(100vh-57px)] bg-background text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#137fec]" />
                Centro de control
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Resumen operativo</h1>
              <p className="mt-1 text-sm text-slate-500">Acceso rápido a módulos de rutas, viajes y administración.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Módulos" value={cards.length} icon="dashboard" />
              <MetricCard label="Rutas" value="Mapas" icon="route" />
              <MetricCard label="Viajes" value="En vivo" icon="local_shipping" />
              <MetricCard label="Estado" value="OK" icon="check_circle" />
            </div>
          </div>
        </header>

        <section className={`grid gap-6 ${cards.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
          {cards.map((card) => {
            const tone = toneClasses[card.tone];
            return (
              <div key={card.href} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tone.icon}`}>
                    <span className="material-symbols-outlined text-xl">{card.icon}</span>
                  </div>
                  <span className={`max-w-[55%] truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.badge}`}>{card.badge}</span>
                </div>

                <h2 className="truncate text-lg font-bold tracking-tight">{card.title}</h2>
                <p className="mt-1 min-h-12 break-words text-sm leading-relaxed text-slate-500">{card.description}</p>

                <Link
                  href={card.href}
                  className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-center text-sm font-semibold leading-tight transition ${tone.button}`}
                >
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                  Abrir {card.title}
                </Link>
              </div>
            );
          })}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Acciones frecuentes</h3>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Operación</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickAction href="/routes" icon="map" title="Editar rutas" subtitle="Validación y corrección" />
              <QuickAction href="/routes/marks" icon="place" title="POIs y tramos" subtitle="Editor de mapa" />
              <QuickAction href="/trips" icon="alt_route" title="Asignar viajes" subtitle="Despacho y monitoreo" />
              <QuickAction href="/routes/create" icon="upload_file" title="Cargar ruta" subtitle="KML o RouteBuilder" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Estado del sistema</h3>
              <button className="text-sm font-semibold text-[#137fec] hover:underline" type="button">
                Ver más
              </button>
            </div>

            <div className="space-y-4">
              <ActivityItem color="bg-emerald-500" title="API de viajes" subtitle="Operativa" detail="Eventos y samples disponibles" />
              <ActivityItem color="bg-blue-500" title="Rutas" subtitle="Editor habilitado" detail="Compilar / validar / fusionar" />
              <ActivityItem color="bg-amber-500" title="Monitoreo" subtitle="En revisión" detail="Panel de viajes en curso activo" />
              {isAdmin ? <ActivityItem color="bg-violet-500" title="Administración" subtitle="Habilitada" detail="CRUD de usuarios y roles" /> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="material-symbols-outlined text-sm">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function QuickAction({ href, icon, title, subtitle, disabled }: { href: string; icon: string; title: string; subtitle: string; disabled?: boolean }) {
  const content = (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3 transition ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-slate-300 hover:bg-slate-50"}`}>
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
        <div className="truncate text-xs text-slate-500">{subtitle}</div>
      </div>
    </div>
  );

  if (disabled) return content;
  return <Link href={href}>{content}</Link>;
}

function ActivityItem({ color, title, subtitle, detail }: { color: string; title: string; subtitle: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className={`mt-1 h-2.5 w-2.5 rounded-full ${color}`} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
        <div className="truncate text-xs text-slate-500">{subtitle}</div>
        <div className="break-words text-xs text-slate-400 mt-1">{detail}</div>
      </div>
    </div>
  );
}
