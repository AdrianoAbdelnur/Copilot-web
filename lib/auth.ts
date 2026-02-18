import * as jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";

const SECRET = process.env.SECRET_WORD;

type AuthPayload = JwtPayload & {
  user?: {
    id?: string;
    role?: string;
  };
};

export function getAuthPayload(req: Request): AuthPayload | null {
  if (!SECRET) throw new Error("Missing SECRET_WORD");

  const authHeader = (req.headers.get("authorization") || "").trim();

  const tokenFromAuth = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.length
      ? authHeader
      : null;

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieToken = cookieHeader
    .split(";")
    .map((part: string) => part.trim())
    .find((part: string) => part.startsWith("token="));

  const tokenFromCookie = cookieToken
    ? decodeURIComponent(cookieToken.split("=")[1])
    : null;

  const token = tokenFromAuth || tokenFromCookie;
  if (!token) return null;

  try {
    return jwt.verify(token, SECRET) as AuthPayload;
  } catch {
    return null;
  }
}
