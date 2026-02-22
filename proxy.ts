import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type JwtPayload = {
  user?: {
    id?: string;
    role?: string;
  };
};

const PUBLIC_ROUTES = new Set(["/login", "/register", "/forbidden"]);
const ADMIN_ROLES = new Set(["admin", "superadmin", "manager"]);
const TRIPS_ROLES = new Set(["admin", "superadmin", "manager", "dispatcher"]);

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function getToken(req: NextRequest): string {
  const cookieToken = req.cookies.get("token")?.value?.trim() || "";
  if (cookieToken) return cookieToken;

  const authHeader = (req.headers.get("authorization") || "").trim();
  if (!authHeader) return "";
  if (authHeader.toLowerCase().startsWith("bearer ")) return authHeader.slice(7).trim();
  return authHeader;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const token = getToken(req);
  const payload = token ? decodeJwtPayload(token) : null;
  const userId = payload?.user?.id ? String(payload.user.id) : "";
  const role = payload?.user?.role ? String(payload.user.role).toLowerCase() : "";
  const isAuthed = Boolean(userId);

  if (!isAuthed && !PUBLIC_ROUTES.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isAuthed && (pathname === "/login" || pathname === "/register")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!ADMIN_ROLES.has(role)) {
      const url = req.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/trips" || pathname.startsWith("/trips/")) {
    if (!TRIPS_ROLES.has(role)) {
      const url = req.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

