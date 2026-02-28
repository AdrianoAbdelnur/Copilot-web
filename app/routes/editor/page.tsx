"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OperationsShell from "@/components/layout/OperationsShell";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { esText } from "@/lib/i18n/es";
import type { RepairDebug } from "../RouteMapViewer";

type ClusterSummary = {
  i: number;
  from: number;
  to: number;
  count: number;
  worstErrorM: number;
  firstPoint: unknown;
  lastPoint: unknown;
};

const RouteMapViewer = dynamic(
  () => import("../RouteMapViewer").then((m) => m.RouteMapViewer),
  {
    ssr: false,
    loading: () => <div className="h-130 animate-pulse rounded-lg bg-slate-100" />,
  }
);

export default function RoutesPage() {
  const t = esText.routesPage;
  const [items, setItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<any>(null);
  const [loadingSelected, setLoadingSelected] = useState<boolean>(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [compiling, setCompiling] = useState(false);
  const [compileMsg, setCompileMsg] = useState<string>("");

  const [matching, setMatching] = useState(false);
  const [matchMsg, setMatchMsg] = useState<string>("");

  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseMsg, setDiagnoseMsg] = useState<string>("");

  const [repairing, setRepairing] = useState(false);
  const [repairMsg, setRepairMsg] = useState<string>("");

  const [merging, setMerging] = useState(false);
  const [mergeMsg, setMergeMsg] = useState<string>("");
  const [merged, setMerged] = useState<any>(null);

  const [validating, setValidating] = useState(false);
  const [validateMsg, setValidateMsg] = useState("");
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [nextStepModal, setNextStepModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    nextHref?: string;
  }>({ open: false, title: "", message: "" });

  const [matchReport, setMatchReport] = useState<any>(null);

  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [selectedClusterIdx, setSelectedClusterIdx] = useState<number>(0);
  const [gapIdx, setGapIdx] = useState<number>(8);

  const [plans, setPlans] = useState<any[]>([]);
  const [debug, setDebug] = useState<RepairDebug | null>(null);

  const [patchedSegments, setPatchedSegments] = useState<any[]>([]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const routeIdFromQuery = (searchParams.get("routeId") || "").trim();

  const loadList = async () => {
    const res = await fetch("/api/routes");
    const json = await res.json();
    setItems(json?.items ?? []);
  };

  const resetPanels = () => {
    setMatchReport(null);
    setClusters([]);
    setPlans([]);
    setDebug(null);
    setPatchedSegments([]);
    setSelectedClusterIdx(0);
    setMerged(null);

    setCompileMsg("");
    setMatchMsg("");
    setDiagnoseMsg("");
    setRepairMsg("");
    setMergeMsg("");
    setValidateMsg("");
  };

  const openOne = async (id: string) => {
    setLoadingSelected(true);
    setSelectedId(id);
    setSelected(null);
    resetPanels();
    try {
      const res = await fetch(`/api/routes/${id}`);
      const json = await res.json().catch(() => null);
      const next = json?.route ?? null;
      setSelected(next);
      setMatchReport(next?.google?.matchReport ?? null);
    } finally {
      setLoadingSelected(false);
    }
  };

  const compileSelected = async () => {
    if (!selectedId) return;

    setCompiling(true);
    setCompileMsg(t.messages.compiling);

    try {
      const r = await fetch(`/api/routes/${selectedId}/compile`, { method: "POST" });
      const data = await r.json();

      if (!r.ok || !data?.ok) {
        setCompileMsg(data?.message ? `Error: ${data.message}` : t.messages.compileFailed);
      } else {
        setCompileMsg(`OK pasos=${data.summary?.steps ?? "-"}`);
      }

      await openOne(selectedId);
    } catch (e: any) {
      setCompileMsg(e?.message ? `Error: ${e.message}` : t.messages.compileFailed);
    } finally {
      setCompiling(false);
    }
  };

  const matchSelected = async () => {
    if (!selectedId) return;

    setMatching(true);
    setMatchMsg(t.messages.matching);

    try {
      const r = await fetch(`/api/routes/${selectedId}/match`, { method: "POST" });
      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.ok) {
        setMatchReport(null);
        setMatchMsg(data?.message ? `Error: ${data.message}` : t.messages.matchFailed);
        return null;
      }

      const report = data?.report ?? null;
      setMatchReport(report);

      const outCount = report?.outOfCorridorPoints?.length ?? "?";
      const pct = report?.matchPct?.toFixed?.(2) ?? "?";
      setMatchMsg(`OK coincidencia=${pct}% fuera=${outCount}`);

      return report;
    } catch (e: any) {
      setMatchReport(null);
      setMatchMsg(e?.message ? `Error: ${e.message}` : t.messages.matchFailed);
      return null;
    } finally {
      setMatching(false);
    }
  };

  const buildDebugFromPlan = (p: any): RepairDebug | null => {
    if (!p) return null;

    return {
      clusterFirst: p.clusterFirst ?? null,
      clusterLast: p.clusterLast ?? null,
      kmlStart: null,
      kmlEnd: null,
      clusterPoints: p.clusterPoints ?? null,
      stepOriginRaw: p.stepOriginRaw ?? null,
      stepDestinationRaw: p.stepDestinationRaw ?? null,
      requestOrigin: p.requestOrigin ?? null,
      requestDestination: p.requestDestination ?? null,
      waypoints: p.waypoints ?? null,
    };
  };

  const diagnoseSelected = async (clusterIdx = 0) => {
    if (!selectedId) return;

    setDiagnosing(true);
    setDiagnoseMsg(t.messages.diagnoseRunning);

    try {
      const r2 = await fetch(`/api/routes/${selectedId}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapIdx, maxWaypoints: 23 }),
      });

      const data2 = await r2.json().catch(() => null);

      if (!r2.ok || !data2?.ok) {
        setDiagnoseMsg(data2?.message ? `Error: ${data2.message}` : t.messages.diagnoseFailed);
        setClusters([]);
        setPlans([]);
        setDebug(null);
        setPatchedSegments([]);
        return;
      }

      setClusters(data2.clusters ?? []);
      setPlans(data2.plans ?? []);
      setPatchedSegments([]);
      setMerged(null);

      const safeIdx = Math.max(0, Math.min(clusterIdx, (data2?.plans?.length ?? 1) - 1));
      setSelectedClusterIdx(safeIdx);

      const plan = data2?.plans?.[safeIdx] ?? null;
      setDebug(buildDebugFromPlan(plan));

      setDiagnoseMsg(`OK clusters=${(data2.clusters ?? []).length} planes=${(data2.plans ?? []).length}`);
    } catch (e: any) {
      setDiagnoseMsg(e?.message ? `Error: ${e.message}` : t.messages.diagnoseFailed);
      setClusters([]);
      setPlans([]);
      setDebug(null);
      setPatchedSegments([]);
      setMerged(null);
    } finally {
      setDiagnosing(false);
    }
  };

  const repairSelected = async () => {
    if (!selectedId) return;

    setRepairing(true);
    setRepairMsg(t.messages.repairing);

    try {
      const plansToUse = Array.isArray(plans) ? plans : [];

      if (plansToUse.length === 0) {
        setRepairMsg(t.messages.noPlansRunDiagnose);
        setPatchedSegments([]);
        setMerged(null);
        return;
      }

      const r = await fetch(`/api/routes/${selectedId}/patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plans: plansToUse }),
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.ok) {
        setRepairMsg(data?.message ? `Error: ${data.message}` : t.messages.repairFailed);
        setPatchedSegments([]);
        setMerged(null);
        return;
      }

      setPatchedSegments(data.patchedSegments ?? []);
      setMerged(null);

      const safeIdx = Math.max(0, Math.min(selectedClusterIdx, (plansToUse.length || 1) - 1));
      setSelectedClusterIdx(safeIdx);

      const plan = plansToUse[safeIdx] ?? null;
      setDebug(buildDebugFromPlan(plan));

      setRepairMsg(data?.message ? data.message : `OK parchados=${(data.patchedSegments ?? []).length}`);
    } catch (e: any) {
      setRepairMsg(e?.message ? `Error: ${e.message}` : t.messages.repairFailed);
      setPatchedSegments([]);
      setMerged(null);
    } finally {
      setRepairing(false);
    }
  };

  const mergeSelected = async () => {
    if (!selectedId) return;

    setMerging(true);
    setMergeMsg(t.messages.merging);

    try {
      const originalDensePath = selected?.google?.densePath ?? [];
      const originalSteps = selected?.google?.steps ?? [];

      if (!Array.isArray(originalDensePath) || originalDensePath.length < 2) {
        setMergeMsg(t.messages.noOriginalDense);
        setMerged(null);
        return;
      }

      if (!Array.isArray(originalSteps) || originalSteps.length < 2) {
        setMergeMsg(t.messages.noOriginalSteps);
        setMerged(null);
        return;
      }

      if (!Array.isArray(plans) || plans.length === 0) {
        setMergeMsg(t.messages.noPlans);
        setMerged(null);
        return;
      }

      if (!Array.isArray(patchedSegments) || patchedSegments.length === 0) {
        setMergeMsg(t.messages.noPatchedSegments);
        setMerged(null);
        return;
      }

      const patches = plans
        .map((p: any) => {
          const seg = patchedSegments.find((s: any) => s.clusterIdx === p.clusterIdx);
          if (!seg) return null;

          const patchedPath = seg.decodedPath ?? [];
          const patchedSteps = seg.googleSteps ?? [];

          if (!Array.isArray(patchedPath) || patchedPath.length < 2) return null;

          return {
            clusterIdx: p.clusterIdx,
            stepIdxStart: p.stepIdxStart,
            stepIdxEnd: p.stepIdxEnd,
            patchedPath,
            patchedSteps,
          };
        })
        .filter(Boolean);

      if (patches.length === 0) {
        setMergeMsg(t.messages.noPatchesToMerge);
        setMerged(null);
        return;
      }

      const payload = { originalDensePath, originalSteps, patches };

      const r = await fetch(`/api/routes/${selectedId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.ok) {
        setMerged(null);
        setMergeMsg(data?.message ? `Error: ${data.message}` : t.messages.mergeFailed);
        return;
      }

      setMerged(data?.merged ?? null);
      setMergeMsg(data?.message ? data.message : t.messages.mergedReady);
    } catch (e: any) {
      setMerged(null);
      setMergeMsg(e?.message ? `Error: ${e.message}` : t.messages.mergeFailed);
    } finally {
      setMerging(false);
    }
  };

  const validateSelected = async () => {
    if (!selectedId) return;

    setValidating(true);
    setValidateMsg(t.messages.validatingCandidate);

    try {
      const r = await fetch(`/api/routes/${selectedId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.ok) {
        setValidateMsg(data?.message ? `Error: ${data.message}` : t.messages.validateFailed);
        return;
      }

      const pass = Boolean(data?.validated?.pass);

      if (pass) {
        setItems((prev) =>
          prev.map((route) =>
            route._id === selectedId
              ? { ...route, nav: { ...(route.nav ?? {}), validate: { ...(route.nav?.validate ?? {}), pass: true } } }
              : route
          )
        );

        setValidateMsg(t.messages.validatedPromoted);
        setSelected((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            nav: {
              ...(prev.nav ?? {}),
              validate: {
                ...(prev.nav?.validate ?? {}),
                ...(data?.validated ?? {}),
                pass: true,
              },
            },
          };
        });
        setNextStepModal({
          open: true,
          title: "Ruta validada",
          message: "Se valido con exito. ¿Deseas agregar detalles de la ruta validada ahora?",
          nextHref: `/routes/marks?routeId=${selectedId}`,
        });
        return;
      }

      const pct = data?.validated?.matchPct?.toFixed?.(2) ?? "?";
      const out = data?.validated?.outCount ?? "?";
      const ver = data?.newRevision?.version ?? "?";

      setValidateMsg(`${t.messages.notPromoted}. match=${pct}% out=${out}, nueva versión v${ver}`);

      setMatchReport(data?.report ?? null);
      setClusters([]);
      setPlans([]);
      setDebug(null);
      setPatchedSegments([]);
      setMerged(null);
      setSelectedClusterIdx(0);
    } catch (e: any) {
      setValidateMsg(e?.message ? `Error: ${e.message}` : t.messages.validateFailed);
    } finally {
      setValidating(false);
    }
  };

  const runFullProcess = async () => {
    if (!selectedId || runningPipeline) return;

    resetPanels();
    setRunningPipeline(true);

    try {
      setCompileMsg("Compilando...");
      const compileRes = await fetch(`/api/routes/${selectedId}/compile`, { method: "POST" });
      const compileJson = await compileRes.json().catch(() => null);
      if (!compileRes.ok || !compileJson?.ok) {
        setCompileMsg(compileJson?.message ? `Error: ${compileJson.message}` : t.messages.compileFailed);
        return;
      }
      setCompileMsg(`OK pasos=${compileJson.summary?.steps ?? "-"}`);

      const routeRes = await fetch(`/api/routes/${selectedId}`);
      const routeJson = await routeRes.json().catch(() => null);
      const currentRoute = routeJson?.route ?? selected;
      setSelected(currentRoute);

      setMatchMsg("Comparando...");
      const matchRes = await fetch(`/api/routes/${selectedId}/match`, { method: "POST" });
      const matchJson = await matchRes.json().catch(() => null);
      if (!matchRes.ok || !matchJson?.ok) {
        setMatchReport(null);
        setMatchMsg(matchJson?.message ? `Error: ${matchJson.message}` : t.messages.matchFailed);
        return;
      }
      const report = matchJson?.report ?? null;
      setMatchReport(report);
      setMatchMsg(`OK coincidencia=${report?.matchPct?.toFixed?.(2) ?? "?"}% fuera=${report?.outOfCorridorPoints?.length ?? "?"}`);

      setDiagnoseMsg("Diagnosticando...");
      const plansRes = await fetch(`/api/routes/${selectedId}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapIdx, maxWaypoints: 23 }),
      });
      const plansJson = await plansRes.json().catch(() => null);
      if (!plansRes.ok || !plansJson?.ok) {
        setDiagnoseMsg(plansJson?.message ? `Error: ${plansJson.message}` : t.messages.diagnoseFailed);
        setClusters([]);
        setPlans([]);
        setDebug(null);
        setPatchedSegments([]);
        return;
      }

      const nextClusters = Array.isArray(plansJson?.clusters) ? plansJson.clusters : [];
      const nextPlans = Array.isArray(plansJson?.plans) ? plansJson.plans : [];
      setClusters(nextClusters);
      setPlans(nextPlans);
      setPatchedSegments([]);
      setMerged(null);
      setSelectedClusterIdx(0);
      setDebug(buildDebugFromPlan(nextPlans[0] ?? null));
      setDiagnoseMsg(`OK clusters=${nextClusters.length} planes=${nextPlans.length}`);

      if (nextPlans.length === 0) {
        setRepairMsg("No hay planes de reparacion. Se intentara validar la ruta directamente...");
        await validateSelected();
        return;
      }

      setRepairMsg("Reparando...");
      const patchRes = await fetch(`/api/routes/${selectedId}/patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plans: nextPlans }),
      });
      const patchJson = await patchRes.json().catch(() => null);
      if (!patchRes.ok || !patchJson?.ok) {
        setRepairMsg(patchJson?.message ? `Error: ${patchJson.message}` : t.messages.repairFailed);
        setPatchedSegments([]);
        return;
      }

      const nextPatched = Array.isArray(patchJson?.patchedSegments) ? patchJson.patchedSegments : [];
      setPatchedSegments(nextPatched);
      setRepairMsg(patchJson?.message ? patchJson.message : `OK parchados=${nextPatched.length}`);

      const originalDensePath = currentRoute?.google?.densePath ?? [];
      const originalSteps = currentRoute?.google?.steps ?? [];
      if (!Array.isArray(originalDensePath) || originalDensePath.length < 2) {
        setMergeMsg(t.messages.noOriginalDense);
        return;
      }
      if (!Array.isArray(originalSteps) || originalSteps.length < 2) {
        setMergeMsg(t.messages.noOriginalSteps);
        return;
      }

      const patches = nextPlans
        .map((p: any) => {
          const seg = nextPatched.find((s: any) => s.clusterIdx === p.clusterIdx);
          if (!seg) return null;
          const patchedPath = seg.decodedPath ?? [];
          const patchedSteps = seg.googleSteps ?? [];
          if (!Array.isArray(patchedPath) || patchedPath.length < 2) return null;
          return {
            clusterIdx: p.clusterIdx,
            stepIdxStart: p.stepIdxStart,
            stepIdxEnd: p.stepIdxEnd,
            patchedPath,
            patchedSteps,
          };
        })
        .filter(Boolean);

      if (patches.length === 0) {
        setMergeMsg("No hay parches para fusionar. Se intentara validar la ruta directamente...");
        await validateSelected();
        return;
      }

      setMergeMsg("Fusionando...");
      const mergeRes = await fetch(`/api/routes/${selectedId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalDensePath, originalSteps, patches }),
      });
      const mergeJson = await mergeRes.json().catch(() => null);
      if (!mergeRes.ok || !mergeJson?.ok) {
        setMerged(null);
        setMergeMsg(mergeJson?.message ? `Error: ${mergeJson.message}` : t.messages.mergeFailed);
        return;
      }
      setMerged(mergeJson?.merged ?? null);
      setMergeMsg(mergeJson?.message ? mergeJson.message : t.messages.mergedReady);

      setValidateMsg("Validando...");
      const validateRes = await fetch(`/api/routes/${selectedId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const validateJson = await validateRes.json().catch(() => null);
      if (!validateRes.ok || !validateJson?.ok) {
        setValidateMsg(validateJson?.message ? `Error: ${validateJson.message}` : t.messages.validateFailed);
        return;
      }

      const pass = Boolean(validateJson?.validated?.pass);
      if (pass) {
        setItems((prev) =>
          prev.map((route) =>
            route._id === selectedId
              ? { ...route, nav: { ...(route.nav ?? {}), validate: { ...(route.nav?.validate ?? {}), pass: true } } }
              : route
          )
        );
        setValidateMsg(t.messages.validatedPromoted);
        setSelected((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            nav: {
              ...(prev.nav ?? {}),
              validate: {
                ...(prev.nav?.validate ?? {}),
                ...(validateJson?.validated ?? {}),
                pass: true,
              },
            },
          };
        });
        setNextStepModal({
          open: true,
          title: "Ruta validada",
          message: "Se valido con exito. ¿Deseas agregar detalles de la ruta validada ahora?",
          nextHref: `/routes/marks?routeId=${selectedId}`,
        });
        return;
      }

      const pct = validateJson?.validated?.matchPct?.toFixed?.(2) ?? "?";
      const out = validateJson?.validated?.outCount ?? "?";
      const ver = validateJson?.newRevision?.version ?? "?";
      setValidateMsg(`${t.messages.notPromoted}. match=${pct}% out=${out}, nueva version v${ver}`);
      setMatchReport(validateJson?.report ?? null);
    } catch (e: any) {
      setValidateMsg(e?.message ? `Error: ${e.message}` : "Error en proceso completo");
    } finally {
      setRunningPipeline(false);
    }
  };

  const duplicateSelected = async () => {
    if (!selected) return;

    const nextTitle = `${String(selected?.title ?? "Ruta")} (copia)`;
    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle, kml: selected?.kml ?? "" }),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setValidateMsg(json?.message ? `${t.messages.duplicateError}: ${json.message}` : t.messages.duplicateFailed);
      return;
    }

    await loadList();
    if (json?.id) {
      await openOne(String(json.id));
    }
  };

  const exportSelected = async () => {
    if (!selected) return;
    const name = `${String(selected?.title ?? "route").replace(/[^a-zA-Z0-9-_]/g, "_") || "route"}.json`;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onPickCluster = (idx: number) => {
    setSelectedClusterIdx(idx);
    const plan = plans?.[idx] ?? null;
    setDebug(buildDebugFromPlan(plan));
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (!routeIdFromQuery) return;
    if (selectedId === routeIdFromQuery) return;
    setLoadingSelected(true);
    void openOne(routeIdFromQuery);
  }, [routeIdFromQuery, selectedId]);

  const selectedPlanInfo = useMemo(() => {
    const p = plans?.[selectedClusterIdx] ?? null;
    if (!p) return null;

    return {
      clusterIdx: p.clusterIdx,
      wp: Array.isArray(p.waypoints) ? p.waypoints.length : 0,
      originIdx: p.requestOriginIdx,
      destIdx: p.requestDestinationIdx,
      stepStart: p.stepIdxStart,
      stepEnd: p.stepIdxEnd,
    };
  }, [plans, selectedClusterIdx]);

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

  const stateTone = (item: any): "success" | "warning" =>
    item?.nav?.validate?.pass ? "success" : "warning";

  const displayedMatchPct = useMemo(() => {
    const validatedPct = selected?.nav?.validate?.matchPct;
    const validatedPass = Boolean(selected?.nav?.validate?.pass);
    const raw = validatedPass
      ? (typeof validatedPct === "number" ? validatedPct : 100)
      : (matchReport?.matchPct ??
          selected?.google?.matchReport?.matchPct ??
          validatedPct ??
          null);
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }, [matchReport, selected]);

  const isFullyValidated = useMemo(() => Boolean(selected?.nav?.validate?.pass), [selected]);

  return (
    <OperationsShell
      title={t.title}
      subtitle={t.subtitle}
      showNav={false}
      nav={[
        { href: "/", label: esText.nav.home },
        { href: "/routes", label: esText.nav.routes, current: true },
        { href: "/trips", label: esText.nav.trips },
        { href: "/admin", label: esText.nav.admin },
      ]}
      actions={<Button onClick={loadList}>{t.refresh}</Button>}
    >
      <div className="grid gap-4">
        <Card className="hidden">
            <CardHeader>
            <CardTitle>{t.listTitle}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
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
              <div className="max-h-[66vh] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{t.tableRoute}</th>
                      <th className="px-3 py-2">{t.tableStatus}</th>
                      <th className="px-3 py-2">{t.tableLastEdit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRoutes.map((route) => (
                      <tr
                        key={route._id}
                        onClick={() => openOne(route._id)}
                        className={`cursor-pointer border-t border-slate-100 ${
                          route._id === selectedId ? "bg-slate-100" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">{route.title || t.routeUntitled}</div>
                          <div className="text-xs text-slate-500">{route._id}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Badge tone={stateTone(route)}>
                            {route?.nav?.validate?.pass ? t.statusValidated : t.statusNeedsReview}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-slate-500">
                          {route.updatedAt ? new Date(route.updatedAt).toLocaleString() : "-"}
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
            {filteredRoutes.length > visibleRoutes.length ? (
              <div className="text-xs text-slate-500">
                {t.showingFirst} {visibleRoutes.length} rutas {t.of} {filteredRoutes.length}.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {loadingSelected ? (
            <Card>
              <CardContent className="grid gap-3">
                <div className="h-9 w-72 animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/60" />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="h-16 animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/60" />
                  <div className="h-16 animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/60" />
                  <div className="h-16 animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/60" />
                  <div className="h-16 animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/60" />
                </div>
                <div className="h-[64vh] animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-700/60" />
              </CardContent>
            </Card>
          ) : !selected ? (
            <Card>
              <CardContent>
                <EmptyState title={t.selectRoute} description={t.selectRouteDescription} />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>{selected?.title || t.selectRoute}</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      {/* <Button onClick={duplicateSelected}>{t.duplicate}</Button> */}
                      {/* <Button onClick={exportSelected}>{t.export}</Button> */}
                      <Button variant="primary" onClick={runFullProcess} disabled={runningPipeline || !selectedId}>
                        {runningPipeline ? "Procesando ruta..." : "Procesar ruta"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="grid gap-4">
                  <>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.statClusters}</div>
                        <div className="mt-0.5 text-lg font-bold text-slate-900">{clusters.length}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.statPlans}</div>
                        <div className="mt-0.5 text-lg font-bold text-slate-900">{plans.length}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.statPatchedSegments}</div>
                        <div className="mt-0.5 text-lg font-bold text-slate-900">{patchedSegments.length}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.statMatch}</div>
                        <div className="mt-0.5 text-lg font-bold text-slate-900">{`${displayedMatchPct?.toFixed?.(1) ?? "-"}%`}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                        <span className="text-xs text-slate-500">{t.gapIdx}</span>
                        <Input
                          className="h-8 w-16"
                          value={gapIdx}
                          onChange={(e) => setGapIdx(Math.max(1, Number(e.target.value) || 1))}
                        />
                      </div>
                      {isFullyValidated ? (
                        <Button
                          variant="secondary"
                          onClick={() => router.push(`/routes/marks?routeId=${selectedId}`)}
                        >
                          {t.actions.openMapEditor}
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-1 text-xs text-slate-600">
                      {compileMsg ? <div>{compileMsg}</div> : null}
                      {matchMsg ? <div>{matchMsg}</div> : null}
                      {diagnoseMsg ? <div>{diagnoseMsg}</div> : null}
                      {repairMsg ? <div>{repairMsg}</div> : null}
                      {mergeMsg ? <div>{mergeMsg}</div> : null}
                      {validateMsg ? <div>{validateMsg}</div> : null}
                    </div>

                    {clusters.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {clusters.slice(0, 30).map((c) => (
                          <Button
                            key={c.i}
                            size="sm"
                            variant={c.i === selectedClusterIdx ? "primary" : "secondary"}
                            onClick={() => onPickCluster(c.i)}
                            title={`worst=${Math.round(c.worstErrorM)}m count=${c.count}`}
                          >
                            #{c.i} ({c.count})
                          </Button>
                        ))}
                      </div>
                    ) : null}

                    {selectedPlanInfo ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {t.selectedPlan} #{selectedPlanInfo.clusterIdx} | {t.waypoints}={selectedPlanInfo.wp} | {t.stepsFromTo} {selectedPlanInfo.stepStart} a {selectedPlanInfo.stepEnd}
                      </div>
                    ) : null}

                    <RouteMapViewer
                      policyRoute={selected?.policyPack?.route ?? []}
                      googleOriginal={
                        selected?.google
                          ? {
                              overviewPolyline: selected.google.overviewPolyline,
                              densePath: selected.google.densePath,
                              matchReport: matchReport ?? selected.google.matchReport,
                              steps: selected.google.steps,
                            }
                          : null
                      }
                      debug={debug}
                      patchedSegments={patchedSegments}
                      mergedGoogle={merged}
                    />
                  </>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {nextStepModal.open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/55 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-2 text-base font-bold text-emerald-700">{nextStepModal.title}</div>
            <p className="text-sm text-slate-700">{nextStepModal.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNextStepModal((prev) => ({ ...prev, open: false }))}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                No por ahora
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = nextStepModal.nextHref;
                  setNextStepModal((prev) => ({ ...prev, open: false }));
                  if (href) router.push(href);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Si, ir a detalles
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </OperationsShell>
  );
}



