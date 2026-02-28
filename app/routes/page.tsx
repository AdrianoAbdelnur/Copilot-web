"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OperationsShell from "@/components/layout/OperationsShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { esText } from "@/lib/i18n/es";

type RouteListItem = {
  _id: string;
  title?: string;
  updatedAt?: string;
  nav?: { validate?: { pass?: boolean } };
};

export default function RoutesPage() {
  const t = esText.routesPage;
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeIdFromQuery = (searchParams.get("routeId") || "").trim();

  const [items, setItems] = useState<RouteListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingRouteId, setOpeningRouteId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/routes", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const list = Array.isArray(json?.items) ? (json.items as RouteListItem[]) : [];
      setItems(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (!routeIdFromQuery) return;
    setOpeningRouteId(routeIdFromQuery);
    router.replace(`/routes/editor?routeId=${routeIdFromQuery}`);
  }, [routeIdFromQuery, router]);

  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const pass = Boolean(item?.nav?.validate?.pass);
      if (statusFilter === "validated" && !pass) return false;
      if (statusFilter === "draft" && pass) return false;
      if (!q) return true;
      const title = String(item?.title ?? "").toLowerCase();
      const id = String(item?._id ?? "").toLowerCase();
      return title.includes(q) || id.includes(q);
    });
  }, [items, search, statusFilter]);

  const visibleRoutes = useMemo(() => filteredRoutes.slice(0, 400), [filteredRoutes]);

  return (
    <OperationsShell
      title={t.title}
      subtitle="Paso 1 de 2: elegi una ruta para abrir el editor"
      showNav={false}
      nav={[
        { href: "/", label: esText.nav.home },
        { href: "/routes", label: esText.nav.routes, current: true },
        { href: "/trips", label: esText.nav.trips },
        { href: "/admin", label: esText.nav.admin },
      ]}
      actions={<Button onClick={loadList}>{loading ? "Actualizando..." : t.refresh}</Button>}
    >
      {openingRouteId ? (
        <Card>
          <CardContent className="grid gap-3">
            <div className="text-sm text-slate-500">Abriendo editor de ruta...</div>
            <div className="h-[68vh] animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/60" />
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>{t.listTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <Input
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">{t.filterAll}</option>
              <option value="validated">{t.filterValidated}</option>
              <option value="draft">{t.filterDraft}</option>
            </Select>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="max-h-[68vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t.tableRoute}</th>
                    <th className="px-3 py-2">{t.tableStatus}</th>
                    <th className="px-3 py-2">{t.tableLastEdit}</th>
                    <th className="px-3 py-2 text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRoutes.map((route) => (
                    <tr key={route._id} className="border-t border-slate-100">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{route.title || t.routeUntitled}</div>
                        <div className="text-xs text-slate-500">{route._id}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge tone={route?.nav?.validate?.pass ? "success" : "warning"}>
                          {route?.nav?.validate?.pass ? t.statusValidated : t.statusNeedsReview}
                        </Badge>
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
                            router.push(`/routes/editor?routeId=${route._id}`);
                          }}
                        >
                          {openingRouteId === route._id ? "Abriendo..." : "Abrir editor"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filteredRoutes.length === 0 ? (
            <EmptyState title={t.noRoutes} description={t.noRoutesDescription} />
          ) : null}
        </CardContent>
      </Card>
      )}
    </OperationsShell>
  );
}
