import mongoose from "mongoose";
import { getAuthPayload } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

const SUPERADMIN_ROLE = "superadmin";
const TENANT_ADMIN_ROLES = new Set(["admin"]);

type AdminAuthOk = {
  ok: true;
  userId: string;
  role: string;
  isSuperAdmin: boolean;
  tenantId: string;
  tenantRole: string;
};

type AdminAuthErr = {
  ok: false;
  response: Response;
};

type AdminAuthResult = AdminAuthOk | AdminAuthErr;

const asString = (v: unknown): string => String(v || "").trim();

const getTenantIdFromHeader = (req: Request): string =>
  asString(req.headers.get("x-tenant-id") || req.headers.get("X-Tenant-Id"));

const normalizeMemberships = (raw: unknown): Array<{
  companyId: string;
  tenantRole: string;
  status: string;
}> => {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ companyId: string; tenantRole: string; status: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const companyId = asString(row.companyId);
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) continue;
    out.push({
      companyId,
      tenantRole: asString(row.tenantRole).toLowerCase() || "member",
      status: asString(row.status).toLowerCase() || "active",
    });
  }
  return out;
};

function unauthorized() {
  return { ok: false as const, response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
}

function forbidden(error = "forbidden") {
  return { ok: false as const, response: Response.json({ ok: false, error }, { status: 403 }) };
}

export function isTenantAdminMembership(membership: { tenantRole: string; status: string }): boolean {
  return membership.status === "active" && TENANT_ADMIN_ROLES.has(membership.tenantRole);
}

export async function getAdminAuth(req: Request): Promise<AdminAuthResult> {
  const payload = getAuthPayload(req);
  const userId = asString(payload?.user?.id);
  const tokenRole = asString(payload?.user?.role).toLowerCase();

  if (!userId) return unauthorized();

  await connectDB();
  const user = await User.findById(userId).select("role memberships isDeleted").lean();
  if (!user || user.isDeleted) return unauthorized();
  const role = asString(user.role).toLowerCase() || tokenRole;

  if (role === SUPERADMIN_ROLE) {
    return {
      ok: true,
      userId,
      role,
      isSuperAdmin: true,
      tenantId: "",
      tenantRole: "superadmin",
    };
  }

  const tenantId = getTenantIdFromHeader(req);
  if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
    return forbidden("tenant_required");
  }

  const memberships = normalizeMemberships(user.memberships);
  const membership = memberships.find((m) => m.companyId === tenantId);
  if (!membership || !isTenantAdminMembership(membership)) {
    return forbidden("forbidden_tenant_admin_scope");
  }

  return {
    ok: true,
    userId,
    role,
    isSuperAdmin: false,
    tenantId,
    tenantRole: membership.tenantRole,
  };
}

export async function getSuperAdminAuth(req: Request): Promise<AdminAuthResult> {
  const payload = getAuthPayload(req);
  const userId = asString(payload?.user?.id);
  const tokenRole = asString(payload?.user?.role).toLowerCase();

  if (!userId) return unauthorized();
  await connectDB();
  const user = await User.findById(userId).select("role isDeleted").lean();
  if (!user || user.isDeleted) return unauthorized();
  const role = asString(user.role).toLowerCase() || tokenRole;
  if (role !== SUPERADMIN_ROLE) return forbidden("forbidden_superadmin_only");

  return {
    ok: true,
    userId,
    role,
    isSuperAdmin: true,
    tenantId: "",
    tenantRole: "superadmin",
  };
}

export async function getCompanyAdminAuth(
  req: Request,
  companyId: string,
): Promise<AdminAuthResult> {
  const payload = getAuthPayload(req);
  const userId = asString(payload?.user?.id);
  const tokenRole = asString(payload?.user?.role).toLowerCase();

  if (!userId) return unauthorized();
  if (!mongoose.Types.ObjectId.isValid(companyId)) return forbidden("invalid_company_id");

  await connectDB();
  const user = await User.findById(userId).select("role memberships isDeleted").lean();
  if (!user || user.isDeleted) return unauthorized();
  const role = asString(user.role).toLowerCase() || tokenRole;

  if (role === SUPERADMIN_ROLE) {
    return {
      ok: true,
      userId,
      role,
      isSuperAdmin: true,
      tenantId: companyId,
      tenantRole: "superadmin",
    };
  }

  const memberships = normalizeMemberships(user.memberships);
  const membership = memberships.find((m) => m.companyId === companyId);
  if (!membership || !isTenantAdminMembership(membership)) {
    return forbidden("forbidden_company_admin_scope");
  }

  return {
    ok: true,
    userId,
    role,
    isSuperAdmin: false,
    tenantId: companyId,
    tenantRole: membership.tenantRole,
  };
}
