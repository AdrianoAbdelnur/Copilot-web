import { connectDB } from "@/lib/db";
import TripPlan from "@/models/TripPlan";
import Trip from "@/models/Trip";
import User from "@/models/User";
import TripSample from "@/models/TripSample";
import "@/models/RouteMap";
import {
  getAuthUser,
  isAdminRole,
  isValidObjectId,
  parseLimit,
  unauthorized,
} from "../../_helpers";

export const runtime = "nodejs";

const ONLINE_WITHIN_MS = 90_000;
const STALE_WITHIN_MS = 5 * 60_000;

function liveStateFor(lastSampleAt: Date | null): "online" | "stale" | "offline" {
  if (!lastSampleAt) return "offline";
  const ageMs = Date.now() - lastSampleAt.getTime();
  if (ageMs <= ONLINE_WITHIN_MS) return "online";
  if (ageMs <= STALE_WITHIN_MS) return "stale";
  return "offline";
}

function parseBounds(raw: string | null): null | {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
} {
  if (!raw) return null;
  const parts = raw.split(",").map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLat, minLng, maxLat, maxLng] = parts;
  if (minLat > maxLat || minLng > maxLng) return null;
  return { minLat, minLng, maxLat, maxLng };
}

export async function GET(req: Request) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    await connectDB();

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "active").trim();
    const userId = (url.searchParams.get("userId") || "").trim();
    const routeId = (url.searchParams.get("routeId") || "").trim();
    const bounds = parseBounds(url.searchParams.get("bbox"));
    const onlineState = (url.searchParams.get("onlineState") || "").trim();
    const limit = parseLimit(url.searchParams.get("limit"), 400, 2000);

    const adminMode = isAdminRole(auth.role);
    const tripQuery: Record<string, any> = {};
    const usersQuery: Record<string, any> = {
      isDeleted: false,
      role: "driver",
    };

    if (!adminMode) {
      tripQuery.userId = auth.id;
      usersQuery._id = auth.id;
    } else if (userId) {
      if (!isValidObjectId(userId)) {
        return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
      }
      tripQuery.userId = userId;
      usersQuery._id = userId;
    }

    if (routeId) {
      if (!isValidObjectId(routeId)) {
        return Response.json({ ok: false, error: "invalid_route_id" }, { status: 400 });
      }
      tripQuery.routeId = routeId;
    }

    if (status && status !== "all") tripQuery.status = status;
    if (bounds) {
      tripQuery["live.pos.latitude"] = { $gte: bounds.minLat, $lte: bounds.maxLat };
      tripQuery["live.pos.longitude"] = { $gte: bounds.minLng, $lte: bounds.maxLng };
    }

    const trips = await Trip.find(tripQuery)
      .populate("userId", "firstName lastName email role")
      .populate("routeId", "title")
      .sort({ "live.t": -1, startedAt: -1 })
      .limit(limit)
      .lean();

    const drivers = await User.find(usersQuery)
      .select("firstName lastName email role")
      .sort({ firstName: 1, lastName: 1, email: 1 })
      .lean();

    const tripIds = trips.map((t: any) => t?._id).filter(Boolean);
    const missingLiveTripIds = trips
      .filter((t: any) => !t?.live?.pos)
      .map((t: any) => t?._id)
      .filter(Boolean);

    const lastSampleByTripId = new Map<string, any>();
    if (missingLiveTripIds.length > 0) {
      const latestSamples = await TripSample.aggregate([
        { $match: { tripId: { $in: missingLiveTripIds } } },
        { $sort: { t: -1 } },
        {
          $group: {
            _id: "$tripId",
            pos: { $first: "$pos" },
            t: { $first: "$t" },
            speedKmh: { $first: "$speedKmh" },
            heading: { $first: "$heading" },
            accuracyM: { $first: "$accuracyM" },
          },
        },
      ]);
      for (const sample of latestSamples) {
        const key = String(sample?._id || "");
        if (!key) continue;
        lastSampleByTripId.set(key, sample);
      }
    }

    const plans = tripIds.length
      ? await TripPlan.find({ tripId: { $in: tripIds } })
          .select("tripId vehicle title")
          .sort({ updatedAt: -1 })
          .lean()
      : [];

    const planByTripId = new Map<string, any>();
    for (const plan of plans) {
      const key = String((plan as any)?.tripId || "");
      if (!key || planByTripId.has(key)) continue;
      planByTripId.set(key, plan);
    }

    const latestTripByDriverId = new Map<string, any>();
    for (const trip of trips) {
      const driverId =
        trip?.userId && typeof trip.userId === "object"
          ? String((trip.userId as any)?._id || "")
          : String(trip?.userId || "");
      if (!driverId || latestTripByDriverId.has(driverId)) continue;
      latestTripByDriverId.set(driverId, trip);
    }

    const items = drivers
      .map((driver: any) => {
        const driverId = String(driver?._id || "");
        const trip = latestTripByDriverId.get(driverId) || null;
        const id = trip?._id ? String(trip._id) : `driver:${driverId}`;
        const plan = planByTripId.get(id) || null;
        const user = driver;
        const route = trip?.routeId && typeof trip.routeId === "object" ? trip.routeId : null;
        const live = trip?.live ?? {};
        const fallbackSample = trip?._id ? lastSampleByTripId.get(String(trip._id)) : null;
        const fallbackPos = fallbackSample?.pos
          ? fallbackSample.pos
          : user?.lastKnownLocation?.latitude != null && user?.lastKnownLocation?.longitude != null
            ? {
                latitude: Number(user.lastKnownLocation.latitude),
                longitude: Number(user.lastKnownLocation.longitude),
              }
            : null;
        const fallbackT = fallbackSample?.t ?? user?.lastKnownLocation?.recordedAt ?? null;
        const fallbackSpeed =
          fallbackSample?.speedKmh ??
          (typeof user?.lastKnownLocation?.speedKmh === "number"
            ? user.lastKnownLocation.speedKmh
            : null);
        const fallbackHeading =
          fallbackSample?.heading ??
          (typeof user?.lastKnownLocation?.heading === "number"
            ? user.lastKnownLocation.heading
            : null);
        const fallbackAccuracy =
          fallbackSample?.accuracyM ??
          (typeof user?.lastKnownLocation?.accuracy === "number"
            ? user.lastKnownLocation.accuracy
            : null);
        const effectiveT = live?.t ?? fallbackT;
        const liveDate = effectiveT ? new Date(String(effectiveT)) : null;
        const safeLiveDate = liveDate && !Number.isNaN(liveDate.getTime()) ? liveDate : null;
        const tripStatus = String(trip?.status || "");
        const statusActive = tripStatus === "active";
        const state = statusActive ? liveStateFor(safeLiveDate) : "offline";
        const sessionActive = statusActive && state !== "offline";
        return {
          itemId: id,
          tripId: trip?._id ? String(trip._id) : null,
          status: String(trip?.status || ""),
          startedAt: trip?.startedAt ?? null,
          driver: {
            id: driverId,
            name:
              `${String(user?.firstName || "").trim()} ${String(user?.lastName || "").trim()}`.trim() ||
              String(user?.email || ""),
            email: String(user?.email || ""),
          },
          route: {
            id: route?._id ? String(route._id) : String(trip?.routeId || ""),
            title: String(route?.title || ""),
          },
          vehicle: {
            plate: String(plan?.vehicle?.plate || ""),
            label: String(plan?.vehicle?.label || plan?.title || ""),
          },
          session: {
            active: sessionActive,
          },
          live: {
            t: safeLiveDate ? safeLiveDate.toISOString() : null,
            pos: live?.pos ?? fallbackPos ?? null,
            speedKmh:
              typeof live?.speedKmh === "number" && Number.isFinite(live.speedKmh)
                ? live.speedKmh
                : typeof fallbackSpeed === "number" && Number.isFinite(fallbackSpeed)
                  ? fallbackSpeed
                  : null,
            heading:
              typeof live?.heading === "number" && Number.isFinite(live.heading)
                ? live.heading
                : typeof fallbackHeading === "number" && Number.isFinite(fallbackHeading)
                  ? fallbackHeading
                  : null,
            accuracyM:
              typeof live?.accuracyM === "number" && Number.isFinite(live.accuracyM)
                ? live.accuracyM
                : typeof fallbackAccuracy === "number" && Number.isFinite(fallbackAccuracy)
                  ? fallbackAccuracy
                  : null,
            onlineState: state,
          },
        };
      })
      .filter((item) => (onlineState ? item.live.onlineState === onlineState : true));

    return Response.json({
      ok: true,
      items,
      generatedAt: new Date().toISOString(),
      onlineThresholdSec: ONLINE_WITHIN_MS / 1000,
      staleThresholdSec: STALE_WITHIN_MS / 1000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[trips/live/positions] failed:", err);
    return Response.json({ ok: false, error: "failed_to_list_live_positions", message }, { status: 500 });
  }
}
