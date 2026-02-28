"use client";

import dynamic from "next/dynamic";
import { useMemo, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OperationsShell from "@/components/layout/OperationsShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { esText } from "@/lib/i18n/es";

const RouteEditorMap = dynamic(() => import("@/components/map/RouteEditorMap"), {
  ssr: false,
  loading: () => <div className="h-[72vh] animate-pulse rounded-lg bg-slate-100" />,
});

type RouteListItem = {
  _id: string;
  title?: string;
  updatedAt?: string;
  nav?: { validate?: { pass?: boolean } };
};

export default function MarksClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const routeId = sp.get("routeId") ?? "";

  const [loadingList, setLoadingList] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [openingRouteId, setOpeningRouteId] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<RouteListItem[]>([]);

  useEffect(() => {
    if (routeId) {
      setOpeningRouteId("");
    }
  }, [routeId]);

  useEffect(() => {
    if (routeId) return;

    let alive = true;
    setLoadingList(true);
    setLoadError("");

    fetch("/api/routes", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json) => {
        if (!alive) return;

        const list = Array.isArray(json?.items) ? (json.items as RouteListItem[]) : [];
        const validated = list.filter((r) => Boolean(r?.nav?.validate?.pass));

        validated.sort((a, b) => {
          const ta = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        });

        setItems(validated);
      })
      .catch(() => {
        if (!alive) return;
        setLoadError("No se pudo cargar la lista de rutas validadas.");
      })
      .finally(() => {
        if (!alive) return;
        setLoadingList(false);
      });

    return () => {
      alive = false;
    };
  }, [routeId]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const title = String(r?.title ?? "").toLowerCase();
      const id = String(r?._id ?? "").toLowerCase();
      return title.includes(q) || id.includes(q);
    });
  }, [items, query]);

  return (
    <OperationsShell
      title={esText.marksPage.title}
      subtitle={esText.marksPage.subtitle}
      showNav={false}
      nav={[
        { href: "/", label: esText.nav.home },
        { href: "/routes", label: esText.nav.routes, current: true },
        { href: "/trips", label: esText.nav.trips },
        { href: "/admin", label: esText.nav.admin },
      ]}
    >
      <Card>
        <CardContent>
          {!routeId && openingRouteId ? (
            <div className="grid gap-3">
              <div className="text-sm text-slate-500">Abriendo editor de mapa...</div>
              <div className="h-[72vh] animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/60" />
            </div>
          ) : !routeId ? (
            <div className="grid gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Elegi una ruta validada</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Paso 1 de 2: selecciona una ruta validada para abrir el editor de POIs y tramos.
                </p>
              </div>

              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por titulo o id"
              />

              {loadingList ? (
                <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">
                  Cargando rutas validadas...
                </div>
              ) : null}

              {!loadingList && loadError ? (
                <EmptyState title="No se pudo cargar" description={loadError} />
              ) : null}

              {!loadingList && !loadError && items.length === 0 ? (
                <EmptyState
                  title="No hay rutas validadas"
                  description="Primero valida una ruta en la pantalla de Rutas y luego vuelvela a abrir aqui."
                />
              ) : null}

              {!loadingList && !loadError && visibleItems.length > 0 ? (
                <div className="rounded-lg border border-slate-200">
                  <div className="max-h-[58vh] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Ruta</th>
                          <th className="px-3 py-2">Estado</th>
                          <th className="px-3 py-2">Ultima edicion</th>
                          <th className="px-3 py-2 text-right">Accion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleItems.map((route) => (
                          <tr key={route._id} className="border-t border-slate-100">
                            <td className="px-3 py-2 align-top">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {route.title || "Ruta sin titulo"}
                              </div>
                              <div className="text-xs text-slate-500">{route._id}</div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Badge tone="success">validada</Badge>
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-slate-500">
                              {route.updatedAt ? new Date(route.updatedAt).toLocaleString() : "-"}
                            </td>
                            <td className="px-3 py-2 align-top text-right">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={Boolean(openingRouteId)}
                                onClick={() => {
                                  setOpeningRouteId(route._id);
                                  router.push(`/routes/marks?routeId=${route._id}`);
                                }}
                              >
                                {openingRouteId === route._id ? "Abriendo..." : "Editar"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <RouteEditorMap routeId={routeId} />
          )}
        </CardContent>
      </Card>
    </OperationsShell>
  );
}
