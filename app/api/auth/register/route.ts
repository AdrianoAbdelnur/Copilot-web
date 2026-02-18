import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/db";

const User = require("@/models/User");

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        await connectDB();
        const body = await req.json();
        console.log(body)

        if (!body?.firstName || !body?.lastName || !body?.email || !body?.password) {
            return NextResponse.json({ message: "firstName, lastName, email y password son requeridos" }, { status: 400 });
        }

        const salt = await bcryptjs.genSalt(10);
        const encryptedPassword = await bcryptjs.hash(String(body.password), salt);

        const newUser = await User.create({
            firstName: String(body.firstName).trim(),
            lastName: String(body.lastName).trim(),
            email: String(body.email).toLowerCase().trim(),
            password: encryptedPassword,
            role: "user",
            validatedMail: false,
            isDeleted: false
        });

        const u = newUser.toObject();
        delete u.password;

        return NextResponse.json({ message: "User created.", user: u }, { status: 201 });
    } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && (err as any).code === 11000) {
            return NextResponse.json({ message: "Email already in use." }, { status: 409 });
        }
        const message = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ message }, { status: 500 });
    }
}
