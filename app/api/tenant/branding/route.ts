import { connectDB } from "@/lib/db";
import { getTenantContext } from "@/lib/tenant";
import { buildTenantBranding } from "@/lib/tenantBranding";
import Company from "@/models/Company";
import CompanyBranding from "@/models/CompanyBranding";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const tenant = await getTenantContext(req);
  if (!tenant.ok) {
    return Response.json(
      { ok: false, error: tenant.error, message: tenant.message },
      { status: tenant.status },
    );
  }

  try {
    await connectDB();
    const [company, branding] = await Promise.all([
      Company.findById(tenant.tenantId).select("name").lean(),
      CompanyBranding.findOne({ companyId: tenant.tenantId }).lean(),
    ]);

    const item = buildTenantBranding({
      companyId: tenant.tenantId,
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
      { ok: false, error: "failed_to_load_tenant_branding" },
      { status: 500 },
    );
  }
}
