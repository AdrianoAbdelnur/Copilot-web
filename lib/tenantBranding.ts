export type TenantBrandingColors = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
};

export type TenantBrandingView = {
  companyId: string;
  companyName?: string;
  logoUrl: string;
  faviconUrl: string;
  appName: string;
  welcomeMessage: string;
  themeMode: "light" | "dark" | "auto";
  colors: TenantBrandingColors;
};

export const DEFAULT_TENANT_BRANDING: Omit<TenantBrandingView, "companyId" | "companyName"> = {
  logoUrl: "",
  faviconUrl: "",
  appName: "",
  welcomeMessage: "",
  themeMode: "auto",
  colors: {
    primary: "#0369A1",
    secondary: "#0F172A",
    accent: "#14B8A6",
    background: "#F1F5F9",
    text: "#0F172A",
  },
};

const asString = (v: unknown): string => String(v || "").trim();

const safeHex = (v: unknown, fallback: string): string => {
  const raw = asString(v).toUpperCase();
  return /^#([0-9A-F]{6})$/.test(raw) ? raw : fallback;
};

export function buildTenantBranding(input: {
  companyId: string;
  companyName?: string;
  logoUrl?: unknown;
  faviconUrl?: unknown;
  appName?: unknown;
  welcomeMessage?: unknown;
  themeMode?: unknown;
  colors?: Record<string, unknown> | null;
}): TenantBrandingView {
  const modeRaw = asString(input.themeMode).toLowerCase();
  const themeMode: "light" | "dark" | "auto" =
    modeRaw === "light" || modeRaw === "dark" ? modeRaw : "auto";
  const colors = input.colors || {};

  return {
    companyId: asString(input.companyId),
    companyName: asString(input.companyName) || undefined,
    logoUrl: asString(input.logoUrl),
    faviconUrl: asString(input.faviconUrl),
    appName: asString(input.appName),
    welcomeMessage: asString(input.welcomeMessage),
    themeMode,
    colors: {
      primary: safeHex(colors.primary, DEFAULT_TENANT_BRANDING.colors.primary),
      secondary: safeHex(colors.secondary, DEFAULT_TENANT_BRANDING.colors.secondary),
      accent: safeHex(colors.accent, DEFAULT_TENANT_BRANDING.colors.accent),
      background: safeHex(colors.background, DEFAULT_TENANT_BRANDING.colors.background),
      text: safeHex(colors.text, DEFAULT_TENANT_BRANDING.colors.text),
    },
  };
}
