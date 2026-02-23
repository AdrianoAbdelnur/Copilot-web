import bcryptjs from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { getAdminAuth } from "../../_auth";

export const runtime = "nodejs";
const ALLOWED_ROLES = new Set(["user", "driver", "dispatcher", "manager", "admin", "superadmin"]);

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED_PATCH_KEYS = new Set([
  "firstName",
  "lastName",
  "email",
  "password",
  "role",
  "validatedMail",
  "isDeleted",
  "expoPushToken",
  "authorizedTransport",
  "lastKnownLocation",
]);

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = getAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    await connectDB();

    const item = await User.findById(id).select("-password").lean();
    if (!item) return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });

    return Response.json({ ok: true, item });
  } catch {
    return Response.json({ ok: false, error: "failed_to_get_user" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = getAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    await connectDB();

    const body = await req.json();
    const patch: Record<string, any> = {};

    for (const [key, value] of Object.entries(body || {})) {
      if (!ALLOWED_PATCH_KEYS.has(key)) continue;
      patch[key] = value;
    }

    if (typeof patch.email === "string") {
      patch.email = patch.email.toLowerCase().trim();
    }
    if (typeof patch.role === "string") {
      patch.role = patch.role.toLowerCase().trim();
      if (!ALLOWED_ROLES.has(patch.role)) {
        return Response.json({ ok: false, error: "invalid_role" }, { status: 400 });
      }
    }

    if (typeof patch.password === "string" && patch.password.trim()) {
      const salt = await bcryptjs.genSalt(10);
      patch.password = await bcryptjs.hash(String(patch.password), salt);
    } else {
      delete patch.password;
    }

    const item = await User.findByIdAndUpdate(id, { $set: patch }, { new: true })
      .select("-password")
      .lean();

    if (!item) return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });

    return Response.json({ ok: true, item });
  } catch (err: any) {
    if (err?.code === 11000) {
      return Response.json({ ok: false, error: "email_already_exists" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "failed_to_update_user" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const auth = getAdminAuth(req);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    await connectDB();

    const item = await User.findByIdAndUpdate(id, { $set: { isDeleted: true } }, { new: true })
      .select("-password")
      .lean();

    if (!item) return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });

    return Response.json({ ok: true, item });
  } catch {
    return Response.json({ ok: false, error: "failed_to_delete_user" }, { status: 500 });
  }
}
