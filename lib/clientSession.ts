"use client";

export type ClientTenantMembership = {
  companyId: string;
  tenantRole?: string;
  status?: string;
  companyName?: string;
};

type LoginUserPayload = {
  defaultCompanyId?: string | null;
  memberships?: ClientTenantMembership[];
};

const TOKEN_KEY = "token";
const ACTIVE_TENANT_KEY = "active_tenant_id";
const MEMBERSHIPS_KEY = "tenant_memberships_v1";

const asString = (input: unknown): string => String(input || "").trim();

const normalizeMemberships = (input: unknown): ClientTenantMembership[] => {
  if (!Array.isArray(input)) return [];
  const map = new Map<string, ClientTenantMembership>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const companyId = asString(row.companyId);
    if (!companyId) continue;
    map.set(companyId, {
      companyId,
      tenantRole: asString(row.tenantRole) || "member",
      status: asString(row.status) || "active",
      companyName: asString(row.companyName) || undefined,
    });
  }
  return [...map.values()];
};

const getCookieToken = (): string => {
  if (typeof document === "undefined") return "";
  const raw =
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("token="))
      ?.split("=")[1] || "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export function getClientToken(): string {
  if (typeof window === "undefined") return "";
  const local = window.localStorage.getItem(TOKEN_KEY) || "";
  return local || getCookieToken();
}

export function getClientTenantId(): string {
  if (typeof window === "undefined") return "";
  return asString(window.localStorage.getItem(ACTIVE_TENANT_KEY) || "");
}

export function getClientMemberships(): ClientTenantMembership[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(MEMBERSHIPS_KEY) || "";
  if (!raw) return [];
  try {
    return normalizeMemberships(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function setClientTenantId(tenantId: string | null): void {
  if (typeof window === "undefined") return;
  const safeTenantId = asString(tenantId);
  if (safeTenantId) {
    window.localStorage.setItem(ACTIVE_TENANT_KEY, safeTenantId);
  } else {
    window.localStorage.removeItem(ACTIVE_TENANT_KEY);
  }
}

export function setClientSession(args: {
  token: string;
  user?: LoginUserPayload | null;
}): void {
  if (typeof window === "undefined") return;

  const token = asString(args.token);
  if (!token) return;

  const memberships = normalizeMemberships(args.user?.memberships);
  const defaultCompanyId = asString(args.user?.defaultCompanyId);
  const currentTenantId = getClientTenantId();
  const activeMemberships = memberships.filter(
    (m) => asString(m.status || "active").toLowerCase() !== "inactive",
  );
  const activeIds = new Set(activeMemberships.map((m) => m.companyId));

  const nextTenantId =
    (currentTenantId && activeIds.has(currentTenantId) && currentTenantId) ||
    (defaultCompanyId && activeIds.has(defaultCompanyId) && defaultCompanyId) ||
    activeMemberships[0]?.companyId ||
    "";

  window.localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `token=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  window.localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(memberships));
  setClientTenantId(nextTenantId || null);
}

export function clearClientSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ACTIVE_TENANT_KEY);
  window.localStorage.removeItem(MEMBERSHIPS_KEY);
  document.cookie = "token=; Path=/; Max-Age=0; SameSite=Lax";
}

export function getAuthHeaders(extra?: HeadersInit): HeadersInit {
  const base: Record<string, string> = {};
  const token = getClientToken();
  const tenantId = getClientTenantId();
  if (token) base.Authorization = token;
  if (tenantId) base["X-Tenant-Id"] = tenantId;
  return {
    ...base,
    ...(extra as Record<string, string> | undefined),
  };
}

