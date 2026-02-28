import Route from "@/models/RouteMap";
import {
  decodePolyline,
  computeMatchReport,
  clusterOutPoints,
  haversineM,
} from "@/lib/routeMatch";

export type LatLng = { latitude: number; longitude: number };

export type Step = {
  distance?: any;
  duration?: any;

  start_location: LatLng;
  end_location: LatLng;

  html_instructions?: string;
  maneuver?: string | null;
  polyline?: { points?: string } | string | null;
};

export type ClusterSummary = {
  i: number;
  from: number;
  to: number;
  count: number;
  worstErrorM: number;
  firstPoint: LatLng | null;
  lastPoint: LatLng | null;
};

export type ClusterPlan = {
  clusterIdx: number;
  clusterFirst: LatLng;
  clusterLast: LatLng;
  clusterPoints: LatLng[];
  stepIdxA: number;
  stepIdxB: number;
  stepIdxStart: number;
  stepIdxEnd: number;
  stepOriginRaw: LatLng;
  stepDestinationRaw: LatLng;
  requestOrigin: LatLng;
  requestDestination: LatLng;
  requestOriginIdx: number;
  requestDestinationIdx: number;
  waypoints: LatLng[];
};

export type PatchedSegmentUI = {
  clusterIdx: number;
  decodedPath: LatLng[];
  googleSteps: Step[];
  overviewPolyline: string | null;
  googleStatus: string | null;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatLatLng(p: LatLng) {
  return `${p.latitude},${p.longitude}`;
}

function keyOf(p: LatLng) {
  return `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
}

function stripHtml(s: string) {
  return (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeForkStep(step: Step) {
  const m = (step?.maneuver ?? "").toLowerCase();
  if (m) return true;

  const txt = stripHtml(step?.html_instructions ?? "").toLowerCase();
  const badWords = [
    "keep",
    "fork",
    "exit",
    "merge",
    "ramp",
    "take",
    "slight",
    "turn",
    "roundabout",
    "left",
    "right",
    "u-turn",
    "mantente",
    "mantenerte",
    "bifurcación",
    "salida",
    "incorpórate",
    "incorporate",
    "toma",
    "tome",
    "gira",
    "dobla",
    "rotonda",
    "a la izquierda",
    "a la derecha",
    "retorno",
  ];

  return badWords.some((w) => txt.includes(w));
}

function pointToSegmentDistanceM(p: LatLng, a: LatLng, b: LatLng) {
  const lat0 = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const mPerDegLat = 111132.92;
  const mPerDegLng = 111412.84 * Math.cos(lat0);

  const ax = a.longitude * mPerDegLng;
  const ay = a.latitude * mPerDegLat;
  const bx = b.longitude * mPerDegLng;
  const by = b.latitude * mPerDegLat;

  const px = p.longitude * mPerDegLng;
  const py = p.latitude * mPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;

  const apx = px - ax;
  const apy = py - ay;

  const abLen2 = abx * abx + aby * aby;
  const t =
    abLen2 === 0
      ? 0
      : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));

  const cx = ax + abx * t;
  const cy = ay + aby * t;

  const dx = px - cx;
  const dy = py - cy;

  return Math.sqrt(dx * dx + dy * dy);
}

function nearestStepIndexByPoint(steps: Step[], p: LatLng) {
  let bestIdx = 0;
  let best = Infinity;

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s?.start_location || !s?.end_location) continue;

    const d = pointToSegmentDistanceM(p, s.start_location, s.end_location);
    if (d < best) {
      best = d;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function findNearestPolicyIndexByPoint(policyRoute: LatLng[], p: LatLng) {
  let bestIdx = 0;
  let best = Infinity;

  for (let i = 0; i < policyRoute.length; i++) {
    const d = haversineM(policyRoute[i], p);
    if (d < best) {
      best = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function pickOriginStepIdxSmart(
  steps: Step[],
  sIdxA: number,
  clusterFirst: LatLng,
  minDistFromForkM = 50,
  maxBack = 12
) {
  let i = clamp(sIdxA - 1, 0, steps.length - 1);

  for (let k = 0; k < maxBack && i > 0; k++) {
    const s = steps[i];
    if (!s?.start_location || !s?.end_location) {
      i--;
      continue;
    }

    const dToCluster = pointToSegmentDistanceM(
      clusterFirst,
      s.start_location,
      s.end_location
    );

    if (dToCluster < minDistFromForkM) {
      i--;
      continue;
    }

    if (looksLikeForkStep(s)) {
      i--;
      continue;
    }

    return i;
  }

  return clamp(sIdxA - 2, 0, steps.length - 1);
}

function pickDestStepIdxSimple(steps: Step[], sIdxB: number) {
  return clamp(sIdxB + 1, 0, steps.length - 1);
}

function pickEvenly(start: number, end: number, count: number) {
  if (count <= 0) return [];
  if (start > end) return [];

  const len = end - start + 1;
  if (count >= len) {
    const all: number[] = [];
    for (let i = start; i <= end; i++) all.push(i);
    return all;
  }

  if (count === 1) {
    return [Math.round((start + end) / 2)];
  }

  const out: number[] = [];
  const step = (end - start) / (count - 1);

  for (let k = 0; k < count; k++) {
    out.push(clamp(Math.round(start + k * step), start, end));
  }

  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function pickKmlWaypointsBetween(
  policyRoute: LatLng[],
  originIdx: number,
  destIdx: number,
  clusterPoints: LatLng[],
  maxWaypoints = 23
) {
  const a = clamp(Math.min(originIdx, destIdx), 0, policyRoute.length - 1);
  const b = clamp(Math.max(originIdx, destIdx), 0, policyRoute.length - 1);

  const span = b - a;
  if (span <= 1) return [];

  const want = Math.min(maxWaypoints, span - 1);

  const idxByKey = new Map<string, number>();
  for (let i = 0; i < policyRoute.length; i++) {
    const k = keyOf(policyRoute[i]);
    if (!idxByKey.has(k)) idxByKey.set(k, i);
  }

  const clusterIdxsRaw = clusterPoints
    .map((p) => idxByKey.get(keyOf(p)))
    .filter((x): x is number => typeof x === "number")
    .filter((i) => i >= a && i <= b)
    .sort((x, y) => x - y);

  if (!clusterIdxsRaw.length) {
    const out: LatLng[] = [];
    const step = span / (want + 1);

    let last = a;
    for (let k = 1; k <= want; k++) {
      let idx = clamp(Math.round(a + k * step), a + 1, b - 1);
      if (idx <= last) idx = last + 1;
      if (idx >= b) break;
      out.push(policyRoute[idx]);
      last = idx;
    }

    return out;
  }

  const clusterMin = clusterIdxsRaw[0];
  const clusterMax = clusterIdxsRaw[clusterIdxsRaw.length - 1];

  const innerMin = a + 1;
  const innerMax = b - 1;

  const preStart = innerMin;
  const preEnd = clamp(clusterMin - 1, innerMin, innerMax);

  const clStart = clamp(clusterMin, innerMin, innerMax);
  const clEnd = clamp(clusterMax, innerMin, innerMax);

  const postStart = clamp(clusterMax + 1, innerMin, innerMax);
  const postEnd = innerMax;

  const preLen = preEnd >= preStart ? preEnd - preStart + 1 : 0;
  const clLen = clEnd >= clStart ? clEnd - clStart + 1 : 0;
  const postLen = postEnd >= postStart ? postEnd - postStart + 1 : 0;

  const clusterWeight = 0.7;

  let nCl = clamp(Math.round(want * clusterWeight), 1, want);
  let remain = want - nCl;

  let nPre = Math.floor(remain / 2);
  let nPost = remain - nPre;

  nPre = Math.min(nPre, preLen);
  nPost = Math.min(nPost, postLen);

  let used = nCl + nPre + nPost;

  while (used < want) {
    if (clLen > nCl) {
      nCl++;
      used++;
      continue;
    }
    if (preLen > nPre) {
      nPre++;
      used++;
      continue;
    }
    if (postLen > nPost) {
      nPost++;
      used++;
      continue;
    }
    break;
  }

  const preIdxs = pickEvenly(preStart, preEnd, nPre);

  let clIdxs: number[] = [];
  if (nCl === 1) clIdxs = [Math.round((clStart + clEnd) / 2)];
  else if (nCl === 2) clIdxs = [clStart, clEnd];
  else {
    const mids = pickEvenly(clStart + 1, clEnd - 1, nCl - 2);
    clIdxs = [clStart, ...mids, clEnd];
  }

  const postIdxs = pickEvenly(postStart, postEnd, nPost);

  const allIdxs = Array.from(new Set([...preIdxs, ...clIdxs, ...postIdxs]))
    .filter((i) => i >= innerMin && i <= innerMax)
    .sort((x, y) => x - y)
    .slice(0, want);

  return allIdxs.map((i) => policyRoute[i]);
}

export function getPolicyRouteFromDoc(doc: any): LatLng[] {
  const policyRoute = (doc.policyPack?.route ?? []) as LatLng[];
  if (!Array.isArray(policyRoute) || policyRoute.length < 2) return [];
  return policyRoute;
}

export function getCorridorMFromDoc(doc: any) {
  return doc.meta?.corridorM ?? 25;
}

export function getGoogleDensePathFromDoc(doc: any): LatLng[] | null {
  const googlePoints = doc.google?.densePath ?? null;
  if (Array.isArray(googlePoints) && googlePoints.length >= 2) return googlePoints;

  const encoded = doc.google?.overviewPolyline ?? null;
  if (!encoded) return null;

  const decoded = decodePolyline(encoded) as any;
  if (!Array.isArray(decoded) || decoded.length < 2) return null;
  return decoded as LatLng[];
}

export function getStepsFromDoc(doc: any): Step[] {
  const steps =
    (doc.google?.patched?.active ? doc.google?.patched?.steps : doc.google?.steps) ??
    [];
  if (!Array.isArray(steps) || steps.length < 2) return [];
  return steps as Step[];
}

export function buildMatchReport(doc: any) {
  const policyRoute = getPolicyRouteFromDoc(doc);
  const corridorM = getCorridorMFromDoc(doc);
  const googlePoints = getGoogleDensePathFromDoc(doc);

  if (!policyRoute.length) {
    return { ok: false as const, message: "policyPack.route inválido (min 2 puntos)" };
  }
  if (!googlePoints) {
    return { ok: false as const, message: "No hay google route. Corré /compile." };
  }

  const report = computeMatchReport({
    policyRoute,
    googlePolylinePoints: googlePoints,
    corridorM,
    maxSamples: 8000,
  });

  return { ok: true as const, policyRoute, corridorM, googlePoints, report };
}

export function buildClusters(report: any, gapIdx: number): ClusterSummary[] {
  const clusters = clusterOutPoints(report.outOfCorridorPoints, gapIdx);

  return clusters.map((x: any, i: number) => {
    const worstErrorM = x.points.reduce(
      (acc: number, p: any) => Math.max(acc, p.errorM),
      0
    );
    return {
      i,
      from: x.from,
      to: x.to,
      count: x.points.length,
      worstErrorM,
      firstPoint: x.points[0]?.point ?? null,
      lastPoint: x.points[x.points.length - 1]?.point ?? null,
    };
  });
}

export function buildPlans(args: {
  doc: any;
  report: any;
  gapIdx: number;
  maxWaypoints: number;
}) {
  const policyRoute = getPolicyRouteFromDoc(args.doc);
  const steps = getStepsFromDoc(args.doc);

  if (!policyRoute.length) {
    return { ok: false as const, message: "policyPack.route inválido (min 2 puntos)" };
  }
  if (!steps.length) {
    return { ok: false as const, message: "No hay steps de Google. Corré /compile." };
  }

  const clusters = clusterOutPoints(args.report.outOfCorridorPoints, args.gapIdx);
  const plans: ClusterPlan[] = [];

  for (let clusterIdx = 0; clusterIdx < clusters.length; clusterIdx++) {
    const c = clusters[clusterIdx];
    if (!c?.points?.length) continue;

    const clusterFirst = c.points[0]?.point ?? null;
    const clusterLast = c.points[c.points.length - 1]?.point ?? null;
    if (!clusterFirst || !clusterLast) continue;

    const clusterPoints = c.points.map((p: any) => p.point);

    const sIdxA = nearestStepIndexByPoint(steps, clusterFirst);
    const sIdxB = nearestStepIndexByPoint(steps, clusterLast);

    const originStepIdx = pickOriginStepIdxSmart(steps, sIdxA, clusterFirst, 50, 12);
    const destStepIdx = pickDestStepIdxSimple(steps, sIdxB);

    const stepOriginRaw = steps[originStepIdx]?.start_location ?? null;
    const stepDestinationRaw = steps[destStepIdx]?.end_location ?? null;
    if (!stepOriginRaw || !stepDestinationRaw) continue;

    // Build request anchors from policyRoute (KML = source of truth), not from
    // Google step endpoints, to avoid drifting anchors to "invented" corners.
    const clusterFirstIdx = findNearestPolicyIndexByPoint(policyRoute, clusterFirst);
    const clusterLastIdx = findNearestPolicyIndexByPoint(policyRoute, clusterLast);

    let requestOriginIdx = Math.min(clusterFirstIdx, clusterLastIdx);
    let requestDestinationIdx = Math.max(clusterFirstIdx, clusterLastIdx);

    // Expand a bit around the problematic cluster to provide context.
    const pad = 2;
    requestOriginIdx = clamp(requestOriginIdx - pad, 0, policyRoute.length - 1);
    requestDestinationIdx = clamp(requestDestinationIdx + pad, 0, policyRoute.length - 1);

    if (requestDestinationIdx <= requestOriginIdx) {
      requestDestinationIdx = clamp(requestOriginIdx + 1, 0, policyRoute.length - 1);
    }

    const requestOrigin = policyRoute[requestOriginIdx];
    const requestDestination = policyRoute[requestDestinationIdx];

    const waypoints = pickKmlWaypointsBetween(
      policyRoute,
      requestOriginIdx,
      requestDestinationIdx,
      clusterPoints,
      args.maxWaypoints
    );

    plans.push({
      clusterIdx,
      clusterFirst,
      clusterLast,
      clusterPoints,
      stepIdxA: sIdxA,
      stepIdxB: sIdxB,
      stepIdxStart: originStepIdx,
      stepIdxEnd: destStepIdx,
      stepOriginRaw,
      stepDestinationRaw,
      requestOrigin,
      requestDestination,
      requestOriginIdx,
      requestDestinationIdx,
      waypoints,
    });
  }

  return { ok: true as const, plans };
}

export function normalizeSteps(legs: any[]) {
  return (legs ?? []).flatMap((leg: any) =>
    (leg?.steps ?? []).map((s: any) => ({
      distance: s.distance ?? null,
      duration: s.duration ?? null,
      html_instructions: s.html_instructions ?? "",
      start_location: {
        latitude: s.start_location?.lat,
        longitude: s.start_location?.lng,
      },
      end_location: {
        latitude: s.end_location?.lat,
        longitude: s.end_location?.lng,
      },
      maneuver: s.maneuver ?? null,
      polyline: s.polyline?.points ?? null,
    }))
  );
}

export async function callGoogleDirections(args: {
  origin: LatLng;
  destination: LatLng;
  waypoints: LatLng[];
}) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { ok: false as const, status: "NO_API_KEY", json: null as any };
  }

  const origin = formatLatLng(args.origin);
  const destination = formatLatLng(args.destination);

  const wp =
    args.waypoints?.length
      ? `&waypoints=${encodeURIComponent(
          "via:" + args.waypoints.map(formatLatLng).join("|via:")
        )}`
      : "";

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `${wp}` +
    `&mode=driving` +
    `&language=es` +
    `&alternatives=false` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { method: "GET" });
  const json = await res.json().catch(() => null);

  if (!json || json.status !== "OK" || !json.routes?.[0]) {
    return { ok: false as const, status: json?.status ?? "BAD_RESPONSE", json };
  }

  return { ok: true as const, status: "OK", json };
}

export function toPatchedSegmentsUI(segments: any[]): PatchedSegmentUI[] {
  return (segments ?? []).map((seg: any) => {
    const overviewPolyline = seg?.google?.overviewPolyline ?? null;

    const decodedPath =
      Array.isArray(seg?.google?.densePath) && seg.google.densePath.length >= 2
        ? seg.google.densePath
        : overviewPolyline
        ? (decodePolyline(overviewPolyline) as LatLng[])
        : [];

    return {
      clusterIdx: seg.clusterIdx,
      decodedPath,
      googleSteps: Array.isArray(seg?.google?.steps) ? seg.google.steps : [],
      overviewPolyline,
      googleStatus: seg?.google?.status ?? null,
    };
  });
}

export async function loadRouteDocOrThrow(id: string) {
  const doc = await Route.findById(id);
  if (!doc) return null;
  return doc;
}



export function computeTotalsFromSteps(steps: any[]) {
  const safe = Array.isArray(steps) ? steps : [];

  const distanceM = safe.reduce((acc, s) => acc + (Number(s?.distance?.value) || 0), 0);
  const durationS = safe.reduce((acc, s) => acc + (Number(s?.duration?.value) || 0), 0);

  const distanceKm = distanceM / 1000;
  const durationMin = durationS / 60;

  return {
    distanceM,
    durationS,
    distanceKm,
    durationMin,
  };
}
