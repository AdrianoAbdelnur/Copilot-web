import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/db";
import { getAuthPayload } from "@/lib/auth";

const User = require("@/models/User");

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const payload = getAuthPayload(req);
        if (!payload) return NextResponse.json({ message: "No autenticado" }, { status: 401 });

        await connectDB();

        const userFound = await User.findById(params.id).select("-password");
        if (!userFound || userFound.isDeleted) return NextResponse.json({ message: "User not found" }, { status: 400 });

        return NextResponse.json({ message: "User data found successfully", userFound }, { status: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const payload = getAuthPayload(req);
        if (!payload) return NextResponse.json({ message: "No autenticado" }, { status: 401 });

        await connectDB();

        const body = await req.json();

        if (body?.password) {
            const salt = await bcryptjs.genSalt(10);
            body.password = await bcryptjs.hash(String(body.password), salt);
        }

        const updatedUser = await User.findByIdAndUpdate(params.id, body, { new: true }).select("-password");
        if (!updatedUser) return NextResponse.json({ message: "usuario no encontrado" }, { status: 400 });

        return NextResponse.json({ message: "User's data successfully edited.", user: updatedUser }, { status: 200 });
    } catch (err: unknown) {
        if (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as { code?: number }).code === 11000
        ) {
            return NextResponse.json({ message: "Email already in use." }, { status: 409 });
        }

        const message = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const payload = getAuthPayload(req);
        if (!payload) return NextResponse.json({ message: "No autenticado" }, { status: 401 });

        await connectDB();

        const userToDelete = await User.findByIdAndUpdate(params.id, { isDeleted: true }, { new: true }).select("-password");
        if (!userToDelete) return NextResponse.json({ message: "usuario no encontrado" }, { status: 400 });

        return NextResponse.json({ message: "User successfully deleted.", userToDelete }, { status: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ message }, { status: 500 });
    }
}
