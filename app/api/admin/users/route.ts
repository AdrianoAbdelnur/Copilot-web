import bcryptjs from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { getAdminAuth } from "../_auth";

export const runtime = "nodejs";
const ALLOWED_ROLES = new Set(["user", "driver", "dispatcher", "manager", "admin", "superadmin"]);
const ALLOWED_TENANT_ROLES = new Set(["member", "dispatcher", "manager", "admin"]);

function parseLimit(input: string | null, fallback = 20, max = 200): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function GET(req: Request) {
  try {
    const auth = await getAdminAuth(req);
    if (!auth.ok) return auth.response;

    await connectDB();

    const url = new URL(req.url);
    const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
    const limit = parseLimit(url.searchParams.get("limit"), 20, 200);
    const role = (url.searchParams.get("role") || "").trim();
    const companyId = (url.searchParams.get("companyId") || "").trim();
    const search = (url.searchParams.get("search") || "").trim();
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";

    const query: Record<string, unknown> = {};
    if (!includeDeleted) query.isDeleted = false;
    if (role) query.role = role;
    if (!auth.isSuperAdmin) {
      query.memberships = {
        $elemMatch: {
          companyId: new mongoose.Types.ObjectId(auth.tenantId),
          status: "active",
        },
      };
    } else if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
      query.memberships = {
        $elemMatch: {
          companyId: new mongoose.Types.ObjectId(companyId),
          status: "active",
        },
      };
    }
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const pagesCount = Math.max(Math.ceil(total / limit), 1);
    const skip = (page - 1) * limit;

    const items = await User.find(query)
      .select("-password")
      .populate("memberships.companyId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return Response.json({
      ok: true,
      items,
      total,
      pagesCount,
      page,
      limit,
      viewer: {
        isSuperAdmin: auth.isSuperAdmin,
        tenantId: auth.tenantId || null,
      },
    });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_users" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAdminAuth(req);
    if (!auth.ok) return auth.response;

    await connectDB();

    const body = await req.json();
    const firstName = String(body?.firstName || "").trim();
    const lastName = String(body?.lastName || "").trim();
    const email = String(body?.email || "").toLowerCase().trim();
    const password = String(body?.password || "");
    const role = String(body?.role || "user").trim().toLowerCase();
    const tenantRole = String(body?.tenantRole || "member").trim().toLowerCase();

    if (!firstName || !lastName || !email || !password) {
      return Response.json({ ok: false, error: "missing_required_fields" }, { status: 400 });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return Response.json({ ok: false, error: "invalid_role" }, { status: 400 });
    }
    if (!ALLOWED_TENANT_ROLES.has(tenantRole)) {
      return Response.json({ ok: false, error: "invalid_tenant_role" }, { status: 400 });
    }
    if (!auth.isSuperAdmin && role === "superadmin") {
      return Response.json({ ok: false, error: "forbidden_role_scope" }, { status: 403 });
    }

    let defaultCompanyId: mongoose.Types.ObjectId | null = null;
    let memberships: Array<{
      companyId: mongoose.Types.ObjectId;
      tenantRole: string;
      status: "active" | "inactive";
    }> = [];

    if (auth.isSuperAdmin) {
      const rawMemberships = Array.isArray(body?.memberships) ? body.memberships : [];
      const uniqueMemberships = new Map<
        string,
        { companyId: mongoose.Types.ObjectId; tenantRole: string; status: "active" | "inactive" }
      >();

      for (const item of rawMemberships) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const companyId = String(row.companyId || "").trim();
        if (!mongoose.Types.ObjectId.isValid(companyId)) continue;
        const rowTenantRole = String(row.tenantRole || "member").trim().toLowerCase();
        const rowStatus = String(row.status || "active").trim().toLowerCase() === "inactive" ? "inactive" : "active";
        if (!ALLOWED_TENANT_ROLES.has(rowTenantRole)) continue;

        uniqueMemberships.set(companyId, {
          companyId: new mongoose.Types.ObjectId(companyId),
          tenantRole: rowTenantRole,
          status: rowStatus,
        });
      }

      memberships = [...uniqueMemberships.values()];
      const requestedDefaultCompanyId = String(body?.defaultCompanyId || "").trim();
      if (requestedDefaultCompanyId && mongoose.Types.ObjectId.isValid(requestedDefaultCompanyId)) {
        defaultCompanyId = new mongoose.Types.ObjectId(requestedDefaultCompanyId);
      } else {
        const firstActive = memberships.find((m) => m.status === "active") || memberships[0];
        defaultCompanyId = firstActive?.companyId || null;
      }
    } else {
      defaultCompanyId = new mongoose.Types.ObjectId(auth.tenantId);
      memberships = [
        {
          companyId: new mongoose.Types.ObjectId(auth.tenantId),
          tenantRole,
          status: "active",
        },
      ];
    }

    const salt = await bcryptjs.genSalt(10);
    const hashedPassword = await bcryptjs.hash(password, salt);

    const created = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
      validatedMail: Boolean(body?.validatedMail ?? false),
      isDeleted: Boolean(body?.isDeleted ?? false),
      expoPushToken: body?.expoPushToken ?? null,
      authorizedTransport: Boolean(body?.authorizedTransport ?? false),
      lastKnownLocation: body?.lastKnownLocation ?? undefined,
      memberships,
      defaultCompanyId,
    });

    const user = created.toObject();
    delete (user as { password?: string }).password;

    return Response.json({ ok: true, item: user }, { status: 201 });
  } catch (err: unknown) {
    if (typeof err === "object" && err && "code" in err && (err as { code?: number }).code === 11000) {
      return Response.json({ ok: false, error: "email_already_exists" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "failed_to_create_user" }, { status: 500 });
  }
}
