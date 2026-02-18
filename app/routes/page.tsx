"use client";

import { useEffect, useMemo, useState } from "react";
import { RouteMapViewer, RepairDebug } from "./RouteMapViewer";
import { useRouter } from "next/navigation";

type ClusterSummary = {
  i: number;
  from: number;
  to: number;
  count: number;
  worstErrorM: number;
  firstPoint: any;
  lastPoint: any;
};

export default function RoutesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<any>(null);

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

  const [matchReport, setMatchReport] = useState<any>(null);

  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [selectedClusterIdx, setSelectedClusterIdx] = useState<number>(0);
  const [gapIdx, setGapIdx] = useState<number>(8);

  const [plans, setPlans] = useState<any[]>([]);
  const [debug, setDebug] = useState<RepairDebug | null>(null);

  const [patchedSegments, setPatchedSegments] = useState<any[]>([]);

  const [validatedOkIds, setValidatedOkIds] = useState<Set<string>>(() => new Set());

  const router = useRouter();
  
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
    setSelectedId(id);
    setSelected(null);
    resetPanels();

    const res = await fetch(`/api/routes/${id}`);
    const json = await res.json();
    setSelected(json?.route ?? null);
  };

  const compileSelected = async () => {
    if (!selectedId) return;

    setCompiling(true);
    setCompileMsg("Compilando...");

    try {
      const r = await fetch(`/api/routes/${selectedId}/compile`, { method: "POST" });
      const data = await r.json();
      console.log("COMPILE", data);

      if (!r.ok || !data?.ok) {
        setCompileMsg(data?.message ? `Error: ${data.message}` : "Error compilando");
      } else {
        setCompileMsg(`OK ✅ steps=${data.summary?.steps ?? "-"}`);
      }

      await openOne(selectedId);
    } catch (e: any) {
      setCompileMsg(e?.message ? `Error: ${e.message}` : "Error compilando");
    } finally {
      setCompiling(false);
    }
  };

  const matchSelected = async () => {
    if (!selectedId) return;

    setMatching(true);
    setMatchMsg("Matcheando...");

    try {
      const r = await fetch(`/api/routes/${selectedId}/match`, { method: "POST" });
      const data = await r.json().catch(() => null);
      console.log("MATCH", data);

      if (!r.ok || !data?.ok) {
        setMatchReport(null);
        setMatchMsg(data?.message ? `Error: ${data.message}` : "Error matcheando");
        return null;
      }

      const report = data?.report ?? null;
      setMatchReport(report);

      const outCount = report?.outOfCorridorPoints?.length ?? "?";
      const pct = report?.matchPct?.toFixed?.(2) ?? "?";
      setMatchMsg(`OK ✅ match=${pct}% out=${outCount}`);

      return report;
    } catch (e: any) {
      setMatchReport(null);
      setMatchMsg(e?.message ? `Error: ${e.message}` : "Error matcheando");
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
    setDiagnoseMsg("Diagnose...");

    try {
      const r2 = await fetch(`/api/routes/${selectedId}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapIdx, maxWaypoints: 23 }),
      });

      const data2 = await r2.json().catch(() => null);
      console.log("PLANS", data2);

      if (!r2.ok || !data2?.ok) {
        setDiagnoseMsg(data2?.message ? `Error: ${data2.message}` : "Error generando planes");
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

      setDiagnoseMsg(`OK ✅ clusters=${(data2.clusters ?? []).length} plans=${(data2.plans ?? []).length}`);
    } catch (e: any) {
      setDiagnoseMsg(e?.message ? `Error: ${e.message}` : "Error diagnose");
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
  setRepairMsg("Reparando...");

  try {
    const plansToUse = Array.isArray(plans) ? plans : [];

    // ✅ si no hay plans, no es error: no hay nada para reparar
    if (plansToUse.length === 0) {
      setRepairMsg("OK ✅ no hay plans (no hay clusters para reparar). Ejecutá Diagnose si querés generar planes.");
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
    console.log("PATCH RESPONSE", data);

    if (!r.ok || !data?.ok) {
      setRepairMsg(data?.message ? `Error: ${data.message}` : "Error patch");
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

    setRepairMsg(
      data?.message
        ? data.message
        : `OK ✅ patched=${(data.patchedSegments ?? []).length}`
    );
  } catch (e: any) {
    setRepairMsg(e?.message ? `Error: ${e.message}` : "Error patch");
    setPatchedSegments([]);
    setMerged(null);
  } finally {
    setRepairing(false);
  }
};


 const mergeSelected = async () => {
  if (!selectedId) return;

  setMerging(true);
  setMergeMsg("Mergeando...");

  try {
    const originalDensePath = selected?.google?.densePath ?? [];
    const originalSteps = selected?.google?.steps ?? [];

    if (!Array.isArray(originalDensePath) || originalDensePath.length < 2) {
      setMergeMsg("OK ✅ no hay google.densePath original (nada para mergear)");
      setMerged(null);
      return;
    }

    if (!Array.isArray(originalSteps) || originalSteps.length < 2) {
      setMergeMsg("OK ✅ no hay google.steps original (nada para mergear)");
      setMerged(null);
      return;
    }

    if (!Array.isArray(plans) || plans.length === 0) {
      setMergeMsg("OK ✅ no hay plans (no hay clusters para mergear)");
      setMerged(null);
      return;
    }

    if (!Array.isArray(patchedSegments) || patchedSegments.length === 0) {
      setMergeMsg("OK ✅ no hay patchedSegments (ejecutá Reparar si hay clusters)");
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
      setMergeMsg("OK ✅ no hay patches para mergear");
      setMerged(null);
      return;
    }

    const payload = { originalDensePath, originalSteps, patches };

    console.log("MERGE PAYLOAD", payload);

    const r = await fetch(`/api/routes/${selectedId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => null);
    console.log("MERGE RESPONSE", data);

    if (!r.ok || !data?.ok) {
      setMerged(null);
      setMergeMsg(data?.message ? `Error: ${data.message}` : "Error merge");
      return;
    }

    setMerged(data?.merged ?? null);
    setMergeMsg(data?.message ? data.message : "OK ✅ merged listo para ver en el mapa");
  } catch (e: any) {
    setMerged(null);
    setMergeMsg(e?.message ? `Error: ${e.message}` : "Error merge");
  } finally {
    setMerging(false);
  }
};


  const validateSelected = async () => {
    if (!selectedId) return;

    setValidating(true);
    setValidateMsg("Validando candidato...");

    try {
      const r = await fetch(`/api/routes/${selectedId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await r.json().catch(() => null);
      console.log("VALIDATE RESPONSE", data);

      if (!r.ok || !data?.ok) {
        setValidateMsg(data?.message ? `Error: ${data.message}` : "Error validate");
        return;
      }

      const pass = Boolean(data?.validated?.pass);

      if (pass) {
        setItems((prev) =>
          prev.map((r) =>
            r._id === selectedId
              ? { ...r, nav: { ...(r.nav ?? {}), validate: { ...(r.nav?.validate ?? {}), pass: true } } }
              : r
          )
        );

        setValidateMsg("OK ✅ 100% → PROMOTED a Route.google");
        await openOne(selectedId); 
        return;
      }
      const pct = data?.validated?.matchPct?.toFixed?.(2) ?? "?";
      const out = data?.validated?.outCount ?? "?";
      const ver = data?.newRevision?.version ?? "?";

      setValidateMsg(`NO ✅ match=${pct}% out=${out} → nueva version v${ver}`);

      setMatchReport(data?.report ?? null);
      setClusters([]);
      setPlans([]);
      setDebug(null);
      setPatchedSegments([]);
      setMerged(null);
      setSelectedClusterIdx(0);
    } catch (e: any) {
      setValidateMsg(e?.message ? `Error: ${e.message}` : "Error validate");
    } finally {
      setValidating(false);
    }
  };

  const onPickCluster = (idx: number) => {
    setSelectedClusterIdx(idx);
    const plan = plans?.[idx] ?? null;
    setDebug(buildDebugFromPlan(plan));
  };

  useEffect(() => {
    loadList();
  }, []);

  const btn = (color: string, disabled = false) => ({
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${color}`,
    background: disabled ? "#999" : color,
    color: "#fff",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  });

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

  return (
    <div style={{ flex: 1, padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 12 }}>Rutas</h1>

      <button
        onClick={loadList}
        style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}
      >
        Refrescar lista
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <div style={{ marginBottom: 10, fontWeight: 700 }}>Lista</div>

          {items.length === 0 && <div style={{ opacity: 0.7 }}>No hay rutas todavía.</div>}

          {items.map((r) => {
            const isSelected = r._id === selectedId;
            const isValidated = Boolean(r?.nav?.validate?.pass);

            // ✅ verde si validó 100%
            const bg = isValidated ? (isSelected ? "#bbf7d0" : "#dcfce7") : isSelected ? "#f3f3f3" : "white";
            const border = isValidated ? "#22c55e" : "#ddd";

            return (
              <button
                key={r._id}
                onClick={() => openOne(r._id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: 10,
                  marginBottom: 8,
                  borderRadius: 8,
                  border: `1px solid ${border}`,
                  background: bg,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{r._id}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, maxWidth: "65vw" }}>
          <div style={{ marginBottom: 10, fontWeight: 700 }}>Detalle</div>

          {!selected && <div style={{ opacity: 0.7 }}>Seleccioná una ruta.</div>}

          {selected && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                <button
                  onClick={compileSelected}
                  disabled={compiling || !selectedId}
                  style={btn("#222", compiling || !selectedId)}
                >
                  {compiling ? "Compilando..." : "Compilar"}
                </button>

                <button
                  onClick={matchSelected}
                  disabled={matching || !selectedId}
                  style={btn("#222", matching || !selectedId)}
                >
                  {matching ? "Matcheando..." : "Matchear"}
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>gapIdx</span>
                  <input
                    value={gapIdx}
                    onChange={(e) => setGapIdx(Math.max(1, Number(e.target.value) || 1))}
                    style={{ width: 70, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 }}
                  />
                </div>

                <button
                  onClick={() => diagnoseSelected(0)}
                  disabled={diagnosing || !selectedId}
                  style={btn("#7c3aed", diagnosing || !selectedId)}
                >
                  {diagnosing ? "Diagnose..." : "Diagnose (clusters+plans)"}
                </button>

                <button
                  onClick={repairSelected}
                  disabled={repairing || !selectedId}
                  style={btn("#0f766e", repairing || !selectedId)}
                >
                  {repairing ? "Reparando..." : "Reparar (patch Google)"}
                </button>

                <button
                  onClick={mergeSelected}
                  disabled={merging || !selectedId}
                  style={btn("#2563eb", merging || !selectedId)}
                >
                  {merging ? "Mergeando..." : "Merge"}
                </button>

                <button
                  onClick={validateSelected}
                  disabled={validating || !selectedId}
                  style={btn("#dc2626", validating || !selectedId)}
                >
                  {validating ? "Validando..." : "Validado (100%→Promote / else→New version)"}
                </button>
                {true && (
  <button
  onClick={() => router.push(`/routes/marks?routeId=${selectedId}`)}
  style={btn("black")}
>
  Crear markers
</button>
)}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, display: "grid", gap: 4 }}>
                {compileMsg ? <div>{compileMsg}</div> : null}
                {matchMsg ? <div>{matchMsg}</div> : null}
                {diagnoseMsg ? <div>{diagnoseMsg}</div> : null}
                {repairMsg ? <div>{repairMsg}</div> : null}
                {mergeMsg ? <div>{mergeMsg}</div> : null}
                {validateMsg ? <div>{validateMsg}</div> : null}
              </div>

              {clusters.length > 0 ? (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {clusters.slice(0, 30).map((c) => (
                    <button
                      key={c.i}
                      onClick={() => onPickCluster(c.i)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: c.i === selectedClusterIdx ? "#ede9fe" : "white",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      title={`worst=${Math.round(c.worstErrorM)}m count=${c.count}`}
                    >
                      #{c.i} ({c.count})
                    </button>
                  ))}
                </div>
              ) : null}

              {selectedPlanInfo ? (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                  <b>Plan cluster #{selectedPlanInfo.clusterIdx}</b> — waypoints={selectedPlanInfo.wp} — steps{" "}
                  {selectedPlanInfo.stepStart} → {selectedPlanInfo.stepEnd} — policyIdx {selectedPlanInfo.originIdx} →{" "}
                  {selectedPlanInfo.destIdx}
                </div>
              ) : null}

              <div style={{ marginTop: 12 }}>
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
