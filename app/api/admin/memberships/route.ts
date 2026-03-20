import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { getSuperAdminAuth } from "@/app/api/admin/_auth";

export const runtime = "nodejs";

const ALLOWED_TENANT_ROLES = new Set(["member", "dispatcher", "manager", "admin"]);

const asString = (v: unknown): string => String(v || "").trim();

type TenantMembership = {
  companyId: mongoose.Types.ObjectId;
  tenantRole: string;
  status: "active" | "inactive";
};

function normalizeMemberships(input: unknown): TenantMembership[] {
  if (!Array.isArray(input)) return [];
  const out: TenantMembership[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const companyId = asString(row.companyId);
    if (!mongoose.Types.ObjectId.isValid(companyId)) continue;
    if (seen.has(companyId)) continue;
    seen.add(companyId);

    const tenantRole = asString(row.tenantRole).toLowerCase() || "member";
    if (!ALLOWED_TENANT_ROLES.has(tenantRole)) continue;
    const status = asString(row.status).toLowerCase() === "inactive" ? "inactive" : "active";

    out.push({
      companyId: new mongoose.Types.ObjectId(companyId),
      tenantRole,
      status,
    });
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await getSuperAdminAuth(req);
  if (!auth.ok) return auth.response;

  try {
    await connectDB();
    const url = new URL(req.url);
    const userId = asString(url.searchParams.get("userId"));
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
    }

    const user = await User.findById(userId)
      .select("_id firstName lastName email role memberships defaultCompanyId isDeleted")
      .lean();
    if (!user) return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });

    return Response.json({ ok: true, item: user });
  } catch {
    return Response.json({ ok: false, error: "failed_to_get_memberships" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await getSuperAdminAuth(req);
  if (!auth.ok) return auth.response;

  try {
    await connectDB();
    const body = (await req.json()) as Record<string, unknown>;
    const userId = asString(body.userId);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
    }

    const memberships = normalizeMemberships(body.memberships);
    const requestedDefaultCompanyId = asString(body.defaultCompanyId);
    let defaultCompanyId: mongoose.Types.ObjectId | null = null;
    if (requestedDefaultCompanyId && mongoose.Types.ObjectId.isValid(requestedDefaultCompanyId)) {
      defaultCompanyId = new mongoose.Types.ObjectId(requestedDefaultCompanyId);
    } else {
      const activeMembership = memberships.find((m) => m.status === "active") || memberships[0];
      defaultCompanyId = activeMembership?.companyId || null;
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          memberships,
          defaultCompanyId,
          updatedAt: new Date(),
        },
      },
      { new: true },
    )
      .select("_id firstName lastName email role memberships defaultCompanyId isDeleted")
      .lean();

    if (!updated) return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
    return Response.json({ ok: true, item: updated });
  } catch {
    return Response.json({ ok: false, error: "failed_to_update_memberships" }, { status: 500 });
  }
}
