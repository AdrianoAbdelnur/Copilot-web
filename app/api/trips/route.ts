import { connectDB } from "@/lib/db";
import { getTenantContext } from "@/lib/tenant";
import Trip from "@/models/Trip";
import TripSample from "@/models/TripSample";
import "@/models/RouteMap";
import "@/models/User";
import {
  getAuthUser,
  isAdminRole,
  parseDateMaybe,
  parseLimit,
  unauthorized,
} from "./_helpers";

export const runtime = "nodejs";

type LatLng = { latitude: number; longitude: number };
type ProgressSegment = { kind: "real" | "inferred" | "pending"; startPct: number; endPct: number };

type ProgressSummary = {
  realPct: number;
  inferredPct: number;
  pendingPct: number;
  latestPct: number;
  segments: ProgressSegment[];
};

type RouteMeasure = {
  path: LatLng[];
  cumulative: number[];
  totalM: number;
};

const EMPTY_PROGRESS: ProgressSummary = {
  realPct: 0,
  inferredPct: 0,
  pendingPct: 100,
  latestPct: 0,
  segments: [{ kind: "pending", startPct: 0, endPct: 100 }],
};

function parsePage(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

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

function isLatLng(point: unknown): point is LatLng {
  if (!point || typeof point !== "object") return false;
  const p = point as { latitude?: unknown; longitude?: unknown };
  return typeof p.latitude === "number" && Number.isFinite(p.latitude) && typeof p.longitude === "number" && Number.isFinite(p.longitude);
}

function cumulativeDistances(path: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i += 1) {
    out[i] = out[i - 1] + haversineMeters(path[i - 1], path[i]);
  }
  return out;
}

function buildRouteMeasure(routeRef: unknown): RouteMeasure {
  const route = routeRef as { google?: { densePath?: unknown[]; totals?: { distanceM?: unknown } } } | null;
  const path = Array.isArray(route?.google?.densePath) ? route.google.densePath.filter(isLatLng) : [];
  const cumulative = path.length >= 2 ? cumulativeDistances(path) : [0];
  const totalM = cumulative[cumulative.length - 1] || Number(route?.google?.totals?.distanceM ?? 0) || 0;
  return { path, cumulative, totalM };
}

function progressPctFromMatch(mm: unknown, measure: RouteMeasure): number | null {
  if (!mm || typeof mm !== "object") return null;
  const match = mm as { index?: unknown; t?: unknown };
  const index = Number(match.index);
  const t = Number(match.t);
  if (!Number.isFinite(index) || !Number.isFinite(t)) return null;

  if (measure.path.length >= 2 && measure.totalM > 0) {
    const safeIndex = Math.max(0, Math.min(Math.floor(index), measure.path.length - 2));
    const safeT = Math.max(0, Math.min(1, t));
    const segmentM = haversineMeters(measure.path[safeIndex], measure.path[safeIndex + 1]);
    return Math.max(0, Math.min(100, ((measure.cumulative[safeIndex] + segmentM * safeT) / measure.totalM) * 100));
  }

  const denominator = measure.path.length >= 2 ? measure.path.length - 1 : Math.max(Math.floor(index) + 1, 1);
  return Math.max(0, Math.min(100, ((index + Math.max(0, Math.min(1, t))) / denominator) * 100));
}

function mergeSegments(kinds: Array<"real" | "inferred" | "pending">): ProgressSegment[] {
  const segments: ProgressSegment[] = [];
  let start = 0;
  for (let i = 1; i <= kinds.length; i += 1) {
    if (i === kinds.length || kinds[i] !== kinds[start]) {
      segments.push({ kind: kinds[start], startPct: start, endPct: i });
      start = i;
    }
  }
  return segments;
}

function buildProgressSummary(samples: unknown[], routeRef: unknown): ProgressSummary {
  const measure = buildRouteMeasure(routeRef);
  const positions = samples
    .map((sample) => progressPctFromMatch((sample as { mm?: unknown })?.mm, measure))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);

  if (positions.length === 0) return EMPTY_PROGRESS;

  const kinds: Array<"real" | "inferred" | "pending"> = Array.from({ length: 100 }, () => "pending");
  const latestPct = Math.max(...positions);
  const latestBin = Math.max(0, Math.min(99, Math.ceil(latestPct) - 1));
  for (let i = 0; i <= latestBin; i += 1) kinds[i] = "inferred";

  for (let i = 0; i < positions.length; i += 1) {
    const current = positions[i];
    const next = positions[i + 1];
    const from = Math.max(0, Math.min(99, Math.floor(current)));
    const to =
      typeof next === "number" && next - current <= 3
        ? Math.max(from, Math.min(99, Math.ceil(next) - 1))
        : from;
    for (let bin = from; bin <= to; bin += 1) kinds[bin] = "real";
  }

  const realBins = kinds.filter((kind) => kind === "real").length;
  const inferredBins = kinds.filter((kind) => kind === "inferred").length;
  const pendingBins = kinds.filter((kind) => kind === "pending").length;

  return {
    realPct: realBins,
    inferredPct: inferredBins,
    pendingPct: pendingBins,
    latestPct: Math.round(latestPct),
    segments: mergeSegments(kinds),
  };
}

function sanitizeTripForList(item: any, progressSummary?: ProgressSummary) {
  const route = item?.routeId && typeof item.routeId === "object" ? item.routeId : null;
  return {
    ...item,
    routeId: route
      ? {
          _id: String(route._id || ""),
          title: route.title || "",
          google: { totals: route.google?.totals ?? {} },
        }
      : item.routeId,
    progressSummary: progressSummary ?? EMPTY_PROGRESS,
  };
}

export async function GET(req: Request) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    await connectDB();
    const tenantContext = await getTenantContext(req);
    if (!tenantContext.ok) {
      return Response.json({ ok: false, error: tenantContext.error, message: tenantContext.message }, { status: tenantContext.status });
    }
    const tenantId = tenantContext.tenantId;

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").trim();
    const userId = (url.searchParams.get("userId") || "").trim();
    const routeId = (url.searchParams.get("routeId") || "").trim();
    const scope = (url.searchParams.get("scope") || "").trim();
    const dateField = url.searchParams.get("dateField") === "createdAt" ? "createdAt" : "startedAt";
    const sortBy = url.searchParams.get("sortBy") === "createdAt" ? "createdAt" : "startedAt";
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const from = parseDateMaybe(fromRaw);
    const to = parseDateMaybe(toRaw);
    if ((fromRaw && !from) || (toRaw && !to)) {
      return Response.json({ ok: false, error: "invalid_date" }, { status: 400 });
    }

    const legacyLimit = url.searchParams.get("limit");
    const page = parsePage(url.searchParams.get("page"));
    const pageSize = parseLimit(url.searchParams.get("pageSize") || legacyLimit, 20, 100);
    const includeProgress = url.searchParams.get("includeProgress") === "1";

    const adminMode = isAdminRole(auth.role) && scope === "all";
    const baseQuery: Record<string, any> = adminMode ? {} : { userId: auth.id };
    if (tenantId) baseQuery.companyId = tenantId;

    if (adminMode && userId) baseQuery.userId = userId;
    if (routeId) baseQuery.routeId = routeId;
    if (from || to) {
      baseQuery[dateField] = {};
      if (from) baseQuery[dateField].$gte = from;
      if (to) baseQuery[dateField].$lte = to;
    }

    const query: Record<string, any> = { ...baseQuery };
    if (status) query.status = status;

    const skip = (page - 1) * pageSize;
    const [items, total, activeCount, pausedCount, finishedCount, abortedCount] = await Promise.all([
      Trip.find(query)
        .sort({ [sortBy]: -1, _id: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate("userId", "firstName lastName email role")
        .populate("routeId", "title google.totals.distanceM google.densePath")
        .lean(),
      Trip.countDocuments(query),
      Trip.countDocuments({ ...baseQuery, status: "active" }),
      Trip.countDocuments({ ...baseQuery, status: "paused" }),
      Trip.countDocuments({ ...baseQuery, status: "finished" }),
      Trip.countDocuments({ ...baseQuery, status: "aborted" }),
    ]);

    let progressByTripId = new Map<string, ProgressSummary>();
    if (includeProgress && items.length > 0) {
      const tripIds = items.map((item: any) => item._id);
      const sampleQuery: Record<string, any> = { tripId: { $in: tripIds } };
      if (tenantId) sampleQuery.companyId = tenantId;
      const samples = await TripSample.find(sampleQuery).select("tripId mm t").sort({ t: 1 }).lean();
      const samplesByTripId = new Map<string, unknown[]>();
      for (const sample of samples as any[]) {
        const key = String(sample.tripId || "");
        const bucket = samplesByTripId.get(key) ?? [];
        bucket.push(sample);
        samplesByTripId.set(key, bucket);
      }
      progressByTripId = new Map(
        items.map((item: any) => [
          String(item._id),
          buildProgressSummary(samplesByTripId.get(String(item._id)) ?? [], item.routeId),
        ]),
      );
    }

    return Response.json({
      ok: true,
      items: items.map((item: any) => sanitizeTripForList(item, progressByTripId.get(String(item._id)))),
      adminMode,
      meta: {
        page,
        pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: skip + items.length < total,
        statusCounts: {
          active: activeCount,
          paused: pausedCount,
          finished: finishedCount,
          aborted: abortedCount,
        },
        sortBy,
        dateField,
      },
    });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_trips" }, { status: 500 });
  }
}
