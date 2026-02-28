export type LatLng = { latitude: number; longitude: number };

export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded) return [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const out: LatLng[] = [];

  while (index < len) {
    let b = 0;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    out.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return out;
}

export function haversineM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);

  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function densifyPolyline(poly: LatLng[], stepM: number) {
  if (poly.length < 2) return poly;

  const out: LatLng[] = [poly[0]];

  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const dist = haversineM(a, b);

    if (!Number.isFinite(dist) || dist <= 0) continue;

    const n = Math.floor(dist / stepM);

    for (let k = 1; k <= n; k++) {
      const t = (k * stepM) / dist;
      if (t >= 1) break;

      out.push({
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
      });
    }

    out.push(b);
  }

  return out;
}

function toXYMeters(p: LatLng, refLatRad: number) {
  const R = 6371000;
  const latRad = (p.latitude * Math.PI) / 180;
  const lngRad = (p.longitude * Math.PI) / 180;
  const x = R * lngRad * Math.cos(refLatRad);
  const y = R * latRad;
  return { x, y };
}

function pointToSegmentDistM(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let t = (apx * abx + apy * aby) / ab2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  const cx = a.x + t * abx;
  const cy = a.y + t * aby;

  const dx = p.x - cx;
  const dy = p.y - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeMatchReport(args: {
  policyRoute: LatLng[];
  googlePolylinePoints: LatLng[];
  corridorM: number;
  maxSamples?: number;
}) {
  const { policyRoute, googlePolylinePoints, corridorM } = args;
  const maxSamples = args.maxSamples ?? 1500;

  if (policyRoute.length < 2) throw new Error("policyRoute inválida");
  if (googlePolylinePoints.length < 2) throw new Error("googlePolylinePoints inválida");

  const refLat = (policyRoute[0].latitude * Math.PI) / 180;
  const sampleStepM = 10;

  const samplePolyline = (poly: LatLng[]) => {
    const dense = densifyPolyline(poly, sampleStepM);
    if (dense.length <= maxSamples) return dense;
    const stride = Math.max(1, Math.floor(dense.length / maxSamples));
    const out: LatLng[] = [];
    for (let i = 0; i < dense.length; i += stride) out.push(dense[i]);
    if (out[out.length - 1] !== dense[dense.length - 1]) out.push(dense[dense.length - 1]);
    return out;
  };

  const polylineLengthM = (poly: LatLng[]) => {
    let total = 0;
    for (let i = 1; i < poly.length; i++) total += haversineM(poly[i - 1], poly[i]);
    return total;
  };

  const computeDirectional = (samples: LatLng[], otherDense: LatLng[]) => {
    const otherXY = otherDense.map((p) => toXYMeters(p, refLat));
    let inCorridor = 0;
    let maxErrorM = 0;
    let sumErrorM = 0;
    const worst: { idx: number; errorM: number; point: LatLng }[] = [];
    const outOfCorridorPoints: { idx: number; errorM: number; point: LatLng }[] = [];

    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const pXY = toXYMeters(p, refLat);
      let best = Infinity;

      for (let s = 0; s < otherXY.length - 1; s++) {
        const d = pointToSegmentDistM(pXY, otherXY[s], otherXY[s + 1]);
        if (d < best) best = d;
      }

      sumErrorM += best;
      if (best > maxErrorM) maxErrorM = best;
      if (best <= corridorM) inCorridor++;

      const row = { idx: i, errorM: best, point: p };
      worst.push(row);
      if (best > corridorM) outOfCorridorPoints.push(row);
    }

    worst.sort((a, b) => b.errorM - a.errorM);
    const matchPct = samples.length ? (inCorridor / samples.length) * 100 : 0;
    const avgErrorM = samples.length ? sumErrorM / samples.length : 0;

    return {
      samples: samples.length,
      inCorridor,
      matchPct,
      maxErrorM,
      avgErrorM,
      worstTop: worst.slice(0, 10),
      outOfCorridorPoints,
    };
  };

  const policySamples = samplePolyline(policyRoute);
  const googleSamples = samplePolyline(googlePolylinePoints);
  const policyDenseForSegs = densifyPolyline(policyRoute, sampleStepM);
  const googleDenseForSegs = densifyPolyline(googlePolylinePoints, sampleStepM);

  const policyToGoogle = computeDirectional(policySamples, googleDenseForSegs);
  const googleToPolicy = computeDirectional(googleSamples, policyDenseForSegs);

  const lengthPolicyM = polylineLengthM(policySamples);
  const lengthGoogleM = polylineLengthM(googleSamples);
  const lengthRatio =
    lengthPolicyM > 0 && lengthGoogleM > 0
      ? Math.min(lengthPolicyM, lengthGoogleM) / Math.max(lengthPolicyM, lengthGoogleM)
      : 0;

  // Keep legacy keys for compatibility, but now strict/bidirectional.
  const strictMatchPct = Math.min(policyToGoogle.matchPct, googleToPolicy.matchPct);

  return {
    samples: policyToGoogle.samples,
    inCorridor: policyToGoogle.inCorridor,
    matchPct: strictMatchPct,
    corridorM,
    maxErrorM: Math.max(policyToGoogle.maxErrorM, googleToPolicy.maxErrorM),
    avgErrorM: (policyToGoogle.avgErrorM + googleToPolicy.avgErrorM) / 2,
    worstTop: policyToGoogle.worstTop,
    outOfCorridorPoints: policyToGoogle.outOfCorridorPoints,
    reverseOutOfCorridorPoints: googleToPolicy.outOfCorridorPoints,
    policyToGoogle,
    googleToPolicy,
    lengthPolicyM,
    lengthGoogleM,
    lengthRatio,
  };
}


export function clusterOutPoints(
  points: { idx: number; errorM: number; point: LatLng }[],
  maxGapIdx = 40
) {
  if (!points?.length) return [];

  const sorted = [...points].sort((a, b) => a.idx - b.idx);

  const clusters: {
    from: number;
    to: number;
    points: { idx: number; errorM: number; point: LatLng }[];
  }[] = [];

  let cur = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const now = sorted[i];
    const gap = now.idx - prev.idx;

    if (gap <= maxGapIdx) {
      cur.push(now);
    } else {
      clusters.push({
        from: cur[0].idx,
        to: cur[cur.length - 1].idx,
        points: cur,
      });
      cur = [now];
    }
  }

  clusters.push({
    from: cur[0].idx,
    to: cur[cur.length - 1].idx,
    points: cur,
  });

  return clusters;
}

export function findNearestPolicyIndexByPoint(policyRoute: LatLng[], p: LatLng) {
  let bestIdx = 0;
  let best = Infinity;

  for (let i = 0; i < policyRoute.length; i++) {
    const d = haversineM(policyRoute[i], p);
    if (d < best) {
      best = d;
      bestIdx = i;
    }
  }

  return { idx: bestIdx, distM: best };
}

function pushIfFar(arr: LatLng[], p: LatLng, minSepM: number) {
  const last = arr[arr.length - 1];
  if (!last) {
    arr.push(p);
    return;
  }
  if (haversineM(last, p) >= minSepM) arr.push(p);
}

export function buildWaypointsFromKmlSegment(args: {
  policyRoute: LatLng[];
  kmlStartIdx: number;
  kmlEndIdx: number;
  clusterPoints?: { idx: number; errorM: number; point: LatLng }[];
  spacingM?: number;
  minSeparationM?: number;
  maxWaypoints?: number;
}) {
  const {
    policyRoute,
    kmlStartIdx,
    kmlEndIdx,
    clusterPoints = [],
    spacingM = 5000,
    minSeparationM = 800,
    maxWaypoints = 15,
  } = args;

  let a = Math.max(0, Math.min(policyRoute.length - 1, kmlStartIdx));
  let b = Math.max(0, Math.min(policyRoute.length - 1, kmlEndIdx));
  if (a > b) [a, b] = [b, a];

  const seg = policyRoute.slice(a, b + 1);
  if (seg.length < 2) {
    return {
      kmlStart: policyRoute[a] ?? null,
      kmlEnd: policyRoute[b] ?? null,
      waypoints: [] as LatLng[],
      meta: { a, b, segLenM: 0, picked: 0 },
    };
  }

  let segLenM = 0;
  const cum: number[] = [0];
  for (let i = 1; i < seg.length; i++) {
    segLenM += haversineM(seg[i - 1], seg[i]);
    cum.push(segLenM);
  }

  const picked: LatLng[] = [];
  pushIfFar(picked, seg[0], 0);

  if (clusterPoints.length) {
    let worst = clusterPoints[0];
    for (const p of clusterPoints) if (p.errorM > worst.errorM) worst = p;

    const nearest = findNearestPolicyIndexByPoint(policyRoute, worst.point);
    const worstKml = policyRoute[nearest.idx];
    if (worstKml) pushIfFar(picked, worstKml, minSeparationM);
  }

  if (segLenM > spacingM) {
    for (let target = spacingM; target < segLenM; target += spacingM) {
      let j = 0;
      while (j < cum.length && cum[j] < target) j++;
      const p = seg[Math.min(j, seg.length - 1)];
      if (p) pushIfFar(picked, p, minSeparationM);
      if (picked.length - 2 >= maxWaypoints) break;
    }
  }

  pushIfFar(picked, seg[seg.length - 1], minSeparationM);

  const innerWaypoints = picked.length <= 2 ? [] : picked.slice(1, picked.length - 1);

  return {
    kmlStart: seg[0],
    kmlEnd: seg[seg.length - 1],
    waypoints: innerWaypoints,
    meta: { a, b, segLenM, picked: innerWaypoints.length },
  };
}
