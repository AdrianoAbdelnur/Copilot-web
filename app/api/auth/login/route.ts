import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const SECRET = process.env.SECRET_WORD;
        if (!SECRET) throw new Error("Missing SECRET_WORD");

        await connectDB();
        const body = await req.json();

        if (!body?.email || !body?.password) {
            return NextResponse.json({ message: "email y password son requeridos" }, { status: 400 });
        }

        const email = String(body.email).toLowerCase().trim();
        const password = String(body.password);

        const user = await User.findOne({ email, isDeleted: false }).select("+password");
        if (!user) return NextResponse.json({ message: "Incorrect user credentials." }, { status: 400 });

        const ok = await bcryptjs.compare(password, user.password);
        if (!ok) return NextResponse.json({ message: "Incorrect user credentials." }, { status: 400 });

        const userId = String(user._id);
        const role = String(user.role || "user");
        const token = jwt.sign({ user: { id: userId, role } }, SECRET, { expiresIn: "7d" });

        const memberships = Array.isArray(user.memberships)
            ? user.memberships
                .map((m: unknown) => {
                    const row = (m && typeof m === "object") ? (m as Record<string, unknown>) : {};
                    return {
                        companyId: String(row.companyId || ""),
                        tenantRole: String(row.tenantRole || "member"),
                        status: String(row.status || "active")
                    };
                })
                .filter((m: { companyId: string }) => m.companyId.length > 0)
            : [];

        return NextResponse.json(
            {
                message: "Logged in.",
                token,
                user: {
                    id: userId,
                    role,
                    defaultCompanyId: user.defaultCompanyId ? String(user.defaultCompanyId) : null,
                    memberships
                }
            },
            { status: 200 }
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ message }, { status: 500 });
    }
}
