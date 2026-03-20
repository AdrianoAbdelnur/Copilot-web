"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { esText } from "@/lib/i18n/es";
import ThemeToggle from "@/components/ThemeToggle";
import {
  clearClientSession,
  getAuthHeaders,
  getClientMemberships,
  getClientTenantId,
  getClientToken,
  setClientSession,
  setClientTenantId,
  type ClientTenantMembership,
} from "@/lib/clientSession";

type MeUser = {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  memberships?: ClientTenantMembership[];
  defaultCompanyId?: string | null;
};

type MeTenant = {
  resolved?: boolean;
  tenantId?: string;
  tenantRole?: string;
  source?: string;
  reason?: string;
};

type TenantBranding = {
  companyId: string;
  companyName?: string;
  logoUrl: string;
  faviconUrl: string;
  appName: string;
  welcomeMessage: string;
  themeMode: "light" | "dark" | "auto";
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
};

const normalizeMemberships = (input: unknown): ClientTenantMembership[] => {
  if (!Array.isArray(input)) return [];
  const map = new Map<string, ClientTenantMembership>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const companyId = String(row.companyId || "").trim();
    if (!companyId) continue;
    map.set(companyId, {
      companyId,
      tenantRole: String(row.tenantRole || "member"),
      status: String(row.status || "active"),
      companyName: typeof row.companyName === "string" ? row.companyName : undefined,
    });
  }
  return [...map.values()];
};

export default function AuthSessionHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  const [tenant, setTenant] = useState<MeTenant | null>(null);
  const [memberships, setMemberships] = useState<ClientTenantMembership[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState("");
  const [branding, setBranding] = useState<TenantBranding | null>(null);

  const hidden = useMemo(() => pathname === "/login" || pathname === "/register", [pathname]);

  const refreshSession = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/users/me", {
        cache: "no-store",
        headers: getAuthHeaders(),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        setUser(null);
        setTenant(null);
        setMemberships(getClientMemberships());
        setActiveTenantIdState(getClientTenantId());
        return;
      }

      const nextUser = (json?.user ?? null) as MeUser | null;
      const nextTenant = (json?.tenant ?? null) as MeTenant | null;
      const nextMemberships = normalizeMemberships(nextUser?.memberships);

      setUser(nextUser);
      setTenant(nextTenant);
      setMemberships(nextMemberships.length ? nextMemberships : getClientMemberships());
      setActiveTenantIdState(String(nextTenant?.tenantId || getClientTenantId()));

      const token = getClientToken();
      if (token) {
        setClientSession({ token, user: nextUser });
      }
    } catch {
      setUser(null);
      setTenant(null);
      setMemberships(getClientMemberships());
      setActiveTenantIdState(getClientTenantId());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hidden) return;
    void refreshSession();
  }, [hidden, refreshSession]);

  useEffect(() => {
    if (hidden) return;
    const applyBranding = (item: TenantBranding | null) => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      const defaults = {
        primary: "#0369A1",
        secondary: "#0F172A",
        accent: "#14B8A6",
        background: "#F1F5F9",
        text: "#0F172A",
      };
      root.style.setProperty("--tenant-primary", item?.colors?.primary || defaults.primary);
      root.style.setProperty("--tenant-secondary", item?.colors?.secondary || defaults.secondary);
      root.style.setProperty("--tenant-accent", item?.colors?.accent || defaults.accent);
      root.style.setProperty("--tenant-bg", item?.colors?.background || defaults.background);
      root.style.setProperty("--tenant-text", item?.colors?.text || defaults.text);
      root.style.setProperty("--info", item?.colors?.primary || defaults.primary);
    };

    const syncBranding = async () => {
      try {
        const res = await fetch("/api/tenant/branding", {
          cache: "no-store",
          headers: getAuthHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok || !json?.item) {
          setBranding(null);
          applyBranding(null);
          return;
        }
        const nextBranding = json.item as TenantBranding;
        setBranding(nextBranding);
        applyBranding(nextBranding);

        if (typeof document !== "undefined" && nextBranding.faviconUrl) {
          const existing = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
          if (existing) {
            existing.href = nextBranding.faviconUrl;
          } else {
            const link = document.createElement("link");
            link.rel = "icon";
            link.href = nextBranding.faviconUrl;
            document.head.appendChild(link);
          }
        }
      } catch {
        setBranding(null);
        applyBranding(null);
      }
    };

    void syncBranding();
  }, [hidden, activeTenantId]);

  if (hidden) return null;

  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const label = fullName || user?.email || esText.authHeader.unauthenticated;
  const role = user?.role || "-";

  const activeMemberships = memberships.filter(
    (m) => String(m.status || "active").toLowerCase() !== "inactive",
  );
  const selectedTenant = activeMemberships.find((m) => m.companyId === activeTenantId) || null;
  const tenantName = branding?.appName || branding?.companyName || selectedTenant?.companyName || "";

  const onLogout = () => {
    clearClientSession();
    router.replace("/login");
  };

  const onSelectTenant = (tenantId: string) => {
    setClientTenantId(tenantId);
    setActiveTenantIdState(tenantId);
    router.refresh();
    void refreshSession();
  };

  const getTreeParent = (path: string) => {
    if (!path || path === "/") return null;

    if (path === "/routes") return "/";
    if (path.startsWith("/routes/editor")) return "/routes";
    if (path.startsWith("/routes/marks")) return "/routes";
    if (path.startsWith("/routes/create")) return "/routes";

    if (path.startsWith("/kml")) return "/routes/create";
    if (path.startsWith("/routeBuilder")) return "/routes/create";

    if (path === "/trips") return "/";
    if (path.startsWith("/trips/")) return "/trips";

    if (path === "/admin") return "/";
    if (path.startsWith("/admin/")) return "/admin";

    const parts = path.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return `/${parts.slice(0, -1).join("/")}`;
  };

  const parentHref = getTreeParent(pathname || "/");

  const onGoBack = () => {
    if (!parentHref) return;
    router.push(parentHref);
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--surface)",
        borderTop: "3px solid var(--tenant-primary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontFamily: "system-ui",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          {tenantName ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {branding?.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={tenantName}
                  style={{ height: 24, width: "auto", maxWidth: 140, objectFit: "contain" }}
                />
              ) : null}
              <div style={{ fontSize: 12, color: "var(--tenant-primary)", fontWeight: 700 }}>
                {tenantName}
              </div>
            </div>
          ) : null}
          <div style={{ fontSize: 13, color: "var(--foreground)" }}>
            {loading
              ? esText.authHeader.loading
              : `${esText.authHeader.user}: ${label} | ${esText.authHeader.role}: ${role}`}
          </div>
          {activeMemberships.length > 1 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Tenant:</span>
              <select
                value={activeTenantId}
                onChange={(e) => onSelectTenant(e.target.value)}
                style={{
                  height: 30,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--surface)",
                  color: "var(--foreground)",
                  padding: "0 8px",
                  fontSize: 12,
                }}
              >
                {activeMemberships.map((m) => (
                  <option key={m.companyId} value={m.companyId}>
                    {m.companyName || m.companyId}
                  </option>
                ))}
              </select>
              {tenant?.resolved === false ? (
                <span style={{ fontSize: 11, color: "#b45309" }}>
                  modo legado: {tenant.reason || "tenant no resuelto"}
                </span>
              ) : null}
              {selectedTenant ? (
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {selectedTenant.tenantRole || "member"}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {parentHref ? (
            <button
              type="button"
              onClick={onGoBack}
              aria-label="Atras"
              title="Atras"
              style={{
                height: 38,
                padding: "0 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>
                arrow_back
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Atras</span>
            </button>
          ) : null}
          <ThemeToggle />
          <button
            onClick={onLogout}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            {esText.authHeader.logout}
          </button>
        </div>
      </div>
    </header>
  );
}

