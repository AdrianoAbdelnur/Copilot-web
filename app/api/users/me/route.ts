import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthPayload } from "@/lib/auth";

const User = require("@/models/User");
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const payload = getAuthPayload(req);
    if (!payload?.user?.id) {
      return NextResponse.json({ message: "No autenticado" }, { status: 401 });
    }

    await connectDB();

    const user = await User.findById(payload.user.id).select("-password");
    if (!user || user.isDeleted) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "User data found successfully", user }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
