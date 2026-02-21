import bcryptjs from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { getAdminAuth } from "../_auth";

export const runtime = "nodejs";
const ALLOWED_ROLES = new Set(["user", "driver", "dispatcher", "manager", "admin", "superadmin"]);

function parseLimit(input: string | null, fallback = 20, max = 200): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function GET(req: Request) {
  try {
    const auth = getAdminAuth(req);
    if (!auth.ok) return auth.response;

    await connectDB();

    const url = new URL(req.url);
    const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
    const limit = parseLimit(url.searchParams.get("limit"), 20, 200);
    const role = (url.searchParams.get("role") || "").trim();
    const search = (url.searchParams.get("search") || "").trim();
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";

    const query: Record<string, any> = {};
    if (!includeDeleted) query.isDeleted = false;
    if (role) query.role = role;
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
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return Response.json({ ok: true, items, total, pagesCount, page, limit });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_users" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = getAdminAuth(req);
    if (!auth.ok) return auth.response;

    await connectDB();

    const body = await req.json();
    const firstName = String(body?.firstName || "").trim();
    const lastName = String(body?.lastName || "").trim();
    const email = String(body?.email || "").toLowerCase().trim();
    const password = String(body?.password || "");
    const role = String(body?.role || "user").trim().toLowerCase();

    if (!firstName || !lastName || !email || !password) {
      return Response.json({ ok: false, error: "missing_required_fields" }, { status: 400 });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return Response.json({ ok: false, error: "invalid_role" }, { status: 400 });
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
    });

    const user = created.toObject();
    delete (user as any).password;

    return Response.json({ ok: true, item: user }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 11000) {
      return Response.json({ ok: false, error: "email_already_exists" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "failed_to_create_user" }, { status: 500 });
  }
}
