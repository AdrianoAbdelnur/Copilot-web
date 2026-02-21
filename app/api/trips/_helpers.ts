import mongoose from "mongoose";
import { getAuthPayload } from "@/lib/auth";
import Trip from "@/models/Trip";

export const CLOSED_STATUSES = new Set(["finished", "aborted"]);
export const ALLOWED_STATUS_PATCH = new Set(["active", "paused"]);
export const ALLOWED_TOTALS_PATCH_KEYS = new Set([
  "distanceM",
  "durationS",
  "maxSpeedKmh",
  "speedOverCount",
  "speedOverDurationS",
  "offrouteCount",
  "offrouteDurationS",
  "poiHits",
  "segmentEntries",
  "samplesCount",
  "eventsCount",
]);
export const ADMIN_ROLES = new Set(["admin", "superadmin", "dispatcher", "manager"]);

export function unauthorized() {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export function invalidId() {
  return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
}

export function getUserIdOrNull(req: Request): string | null {
  const payload = getAuthPayload(req);
  return payload?.user?.id ? String(payload.user.id) : null;
}

export function getAuthUser(req: Request): { id: string; role: string } | null {
  const payload = getAuthPayload(req);
  const id = payload?.user?.id ? String(payload.user.id) : "";
  const role = payload?.user?.role ? String(payload.user.role) : "";
  if (!id) return null;
  return { id, role };
}

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

export function isValidObjectId(value: unknown): boolean {
  return typeof value === "string" && mongoose.Types.ObjectId.isValid(value);
}

export function isValidPos(pos: any): boolean {
  return (
    pos &&
    typeof pos.latitude === "number" &&
    Number.isFinite(pos.latitude) &&
    typeof pos.longitude === "number" &&
    Number.isFinite(pos.longitude)
  );
}

export function parseDateMaybe(input: unknown): Date | null {
  if (!input) return null;
  const d = new Date(String(input));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseLimit(input: unknown, fallback = 100, max = 1000): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function findOwnedTrip(tripId: string, userId: string) {
  return Trip.findOne({ _id: tripId, userId });
}

export async function findTripForUserScope(tripId: string, authUserId: string, adminMode = false) {
  if (adminMode) return Trip.findById(tripId);
  return Trip.findOne({ _id: tripId, userId: authUserId });
}
