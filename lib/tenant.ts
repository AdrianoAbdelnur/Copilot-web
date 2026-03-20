import { connectDB } from "@/lib/db";
import { getAuthPayload } from "@/lib/auth";
import User from "@/models/User";

type TenantMembership = {
  companyId: string;
  tenantRole: string;
  status: "active" | "inactive";
};

type TenantContextOk = {
  ok: true;
  userId: string;
  role: string;
  tenantId: string;
  tenantRole: string;
  memberships: TenantMembership[];
  source: "header";
};

type TenantContextErr = {
  ok: false;
  status: number;
  error:
    | "unauthorized"
    | "user_not_found"
    | "no_tenant_memberships"
    | "tenant_required"
    | "forbidden_tenant_scope";
  message: string;
};

export type TenantContext = TenantContextOk | TenantContextErr;

const HEADER_TENANT_ID = "x-tenant-id";

const toId = (v: unknown): string => {
  if (!v) return "";
  return String(v).trim();
};

const normalizeMemberships = (raw: unknown): TenantMembership[] => {
  if (!Array.isArray(raw)) return [];
  const items: TenantMembership[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const companyId = toId(row.companyId);
    if (!companyId) continue;

    const statusRaw = toId(row.status).toLowerCase();
    const status: "active" | "inactive" =
      statusRaw === "inactive" ? "inactive" : "active";

    const tenantRole = toId(row.tenantRole) || "member";
    items.push({ companyId, tenantRole, status });
  }

  return items;
};

export async function getTenantContext(
  req: Request,
): Promise<TenantContext> {
  const payload = getAuthPayload(req);
  const userId = toId(payload?.user?.id);
  const role = toId(payload?.user?.role);

  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Missing authenticated user",
    };
  }

  await connectDB();

  const user = await User.findById(userId)
    .select("role isDeleted memberships defaultCompanyId")
    .lean();

  if (!user || user.isDeleted) {
    return {
      ok: false,
      status: 401,
      error: "user_not_found",
      message: "Authenticated user not found",
    };
  }

  const memberships = normalizeMemberships(user.memberships).filter(
    (m) => m.status === "active",
  );

  if (!memberships.length) {
    return {
      ok: false,
      status: 403,
      error: "no_tenant_memberships",
      message: "User has no active tenant memberships",
    };
  }

  const requestedTenantId = toId(req.headers.get(HEADER_TENANT_ID));
  if (requestedTenantId) {
    const hit = memberships.find((m) => m.companyId === requestedTenantId);
    if (!hit) {
      return {
        ok: false,
        status: 403,
        error: "forbidden_tenant_scope",
        message: "Tenant is not in user's active memberships",
      };
    }
    return {
      ok: true,
      userId,
      role: role || toId(user.role),
      tenantId: hit.companyId,
      tenantRole: hit.tenantRole,
      memberships,
      source: "header",
    };
  }

  return {
    ok: false,
    status: 400,
    error: "tenant_required",
    message: "Missing X-Tenant-Id for multi-tenant user",
  };
}
