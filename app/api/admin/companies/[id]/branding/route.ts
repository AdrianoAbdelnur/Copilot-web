import { z } from "zod";
import { connectDB } from "@/lib/db";
import { getCompanyAdminAuth } from "@/app/api/admin/_auth";
import { buildTenantBranding } from "@/lib/tenantBranding";
import Company from "@/models/Company";
import CompanyBranding from "@/models/CompanyBranding";

export const runtime = "nodejs";

const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

const UpdateBrandingSchema = z.object({
  logoUrl: z.string().trim().max(500).optional(),
  faviconUrl: z.string().trim().max(500).optional(),
  appName: z.string().trim().max(120).optional(),
  welcomeMessage: z.string().trim().max(280).optional(),
  themeMode: z.enum(["light", "dark", "auto"]).optional(),
  colors: z
    .object({
      primary: z.string().regex(HEX_COLOR, "invalid_primary").optional(),
      secondary: z.string().regex(HEX_COLOR, "invalid_secondary").optional(),
      accent: z.string().regex(HEX_COLOR, "invalid_accent").optional(),
      background: z.string().regex(HEX_COLOR, "invalid_background").optional(),
      text: z.string().regex(HEX_COLOR, "invalid_text").optional(),
    })
    .optional(),
});

const toCompanyId = async (rawId: string): Promise<string | null> => {
  const direct = await Company.findById(rawId).select("_id").lean();
  if (direct?._id) return String(direct._id);

  const byName = await Company.findOne({ name: rawId }).select("_id").lean();
  if (byName?._id) return String(byName._id);
  return null;
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const companyId = await toCompanyId(String(id || "").trim());
    if (!companyId) {
      return Response.json({ ok: false, error: "company_not_found" }, { status: 404 });
    }
    const auth = await getCompanyAdminAuth(req, companyId);
    if (!auth.ok) return auth.response;

    const [company, branding] = await Promise.all([
      Company.findById(companyId).select("name").lean(),
      CompanyBranding.findOne({ companyId }).lean(),
    ]);

    const item = buildTenantBranding({
      companyId,
      companyName: company?.name,
      logoUrl: branding?.logoUrl,
      faviconUrl: branding?.faviconUrl,
      appName: branding?.appName,
      welcomeMessage: branding?.welcomeMessage,
      themeMode: branding?.themeMode,
      colors: branding?.colors as Record<string, unknown> | undefined,
    });

    return Response.json({ ok: true, item });
  } catch {
    return Response.json(
      { ok: false, error: "failed_to_load_company_branding" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const companyId = await toCompanyId(String(id || "").trim());
    if (!companyId) {
      return Response.json({ ok: false, error: "company_not_found" }, { status: 404 });
    }
    const auth = await getCompanyAdminAuth(req, companyId);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const data = UpdateBrandingSchema.parse(body);
    const patch: Record<string, unknown> = {};

    if (typeof data.logoUrl === "string") patch.logoUrl = data.logoUrl;
    if (typeof data.faviconUrl === "string") patch.faviconUrl = data.faviconUrl;
    if (typeof data.appName === "string") patch.appName = data.appName;
    if (typeof data.welcomeMessage === "string") patch.welcomeMessage = data.welcomeMessage;
    if (typeof data.themeMode === "string") patch.themeMode = data.themeMode;

    const colorsPatch: Record<string, string> = {};
    if (data.colors) {
      if (data.colors.primary) colorsPatch.primary = data.colors.primary.toUpperCase();
      if (data.colors.secondary) colorsPatch.secondary = data.colors.secondary.toUpperCase();
      if (data.colors.accent) colorsPatch.accent = data.colors.accent.toUpperCase();
      if (data.colors.background) colorsPatch.background = data.colors.background.toUpperCase();
      if (data.colors.text) colorsPatch.text = data.colors.text.toUpperCase();
    }
    if (Object.keys(colorsPatch).length) patch.colors = colorsPatch;

    const updated = await CompanyBranding.findOneAndUpdate(
      { companyId },
      { $set: patch, $setOnInsert: { companyId } },
      { upsert: true, new: true },
    ).lean();

    const company = await Company.findById(companyId).select("name").lean();
    const item = buildTenantBranding({
      companyId,
      companyName: company?.name,
      logoUrl: updated?.logoUrl,
      faviconUrl: updated?.faviconUrl,
      appName: updated?.appName,
      welcomeMessage: updated?.welcomeMessage,
      themeMode: updated?.themeMode,
      colors: updated?.colors as Record<string, unknown> | undefined,
    });

    return Response.json({ ok: true, item });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ ok: false, error: "invalid_branding_payload" }, { status: 400 });
    }
    return Response.json(
      { ok: false, error: "failed_to_update_company_branding" },
      { status: 500 },
    );
  }
}
