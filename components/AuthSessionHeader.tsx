"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { esText } from "@/lib/i18n/es";
import ThemeToggle from "@/components/ThemeToggle";

type MeUser = {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
};

export default function AuthSessionHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);

  const hidden = useMemo(() => pathname === "/login" || pathname === "/register", [pathname]);

  useEffect(() => {
    if (hidden) return;

    let alive = true;
    setLoading(true);

    fetch("/api/users/me", { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})).then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!alive) return;
        if (!ok) {
          setUser(null);
          return;
        }
        setUser(json?.user ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [hidden]);

  if (hidden) return null;

  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const label = fullName || user?.email || esText.authHeader.unauthenticated;
  const role = user?.role || "-";

  const onLogout = () => {
    try {
      localStorage.removeItem("token");
    } catch {
      // Ignore storage errors.
    }
    document.cookie = "token=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/login");
  };

  const onGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--surface)",
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
        <div style={{ fontSize: 13, color: "var(--foreground)" }}>
          {loading
            ? esText.authHeader.loading
            : `${esText.authHeader.user}: ${label} | ${esText.authHeader.role}: ${role}`}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {pathname !== "/" ? (
            <button
              type="button"
              onClick={onGoBack}
              aria-label="Volver"
              title="Volver"
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
              <span style={{ fontSize: 13, fontWeight: 600 }}>Volver</span>
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
