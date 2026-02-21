import { getAuthPayload } from "@/lib/auth";

const ADMIN_ROLES = new Set(["admin", "superadmin", "manager"]);

export function getAdminAuth(req: Request) {
  const payload = getAuthPayload(req);
  const id = payload?.user?.id ? String(payload.user.id) : "";
  const role = payload?.user?.role ? String(payload.user.role).toLowerCase() : "";

  if (!id) {
    return { ok: false as const, response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }

  if (!ADMIN_ROLES.has(role)) {
    return { ok: false as const, response: Response.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, userId: id, role };
}
