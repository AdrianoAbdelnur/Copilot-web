import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { getAuthPayload } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
    try {
        await connectDB();

        const url = new URL(req.url);
        const page = Number(url.searchParams.get("page") || 1);
        const limit = Number(url.searchParams.get("limit") || 20);
        const paginated = url.searchParams.get("paginated");
        const usePagination = paginated === null ? true : paginated !== "false";

        const filter = { isDeleted: false };

        if (!usePagination) {
            const usersFound = await User.find(filter).select("-password");
            if (usersFound.length === 0) {
                return NextResponse.json({ message: "lista de usuarios vacia" }, { status: 400 });
            }
            return NextResponse.json(
                { message: "usuarios extraidos de forma exitosa", users: usersFound },
                { status: 200 }
            );
        }

        const usersCount = await User.countDocuments(filter);
        const pagesCount = Math.ceil(usersCount / limit);
        const skip = (page - 1) * limit;

        if (pagesCount > 0 && page > pagesCount) {
            return NextResponse.json({ message: "pagina no encontrada" }, { status: 400 });
        }

        const usersFound = await User.find(filter).skip(skip).limit(limit).select("-password");

        if (usersFound.length === 0) {
            return NextResponse.json({ message: "lista de usuarios vacia" }, { status: 400 });
        }

        return NextResponse.json(
            {
                message: "usuarios extraidos de forma exitosa",
                usersCount,
                pagesCount,
                currentPage: page,
                users: usersFound
            },
            { status: 200 }
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const payload = getAuthPayload(req);
        if (!payload) return NextResponse.json({ message: "No autenticado" }, { status: 401 });

        await connectDB();

        const body = await req.json();

        if (!body?.email || !body?.password) {
            return NextResponse.json({ message: "email y password son requeridos" }, { status: 400 });
        }

        const salt = await bcryptjs.genSalt(10);
        const encryptedPassword = await bcryptjs.hash(String(body.password), salt);

        const userToCreate = {
            email: String(body.email).toLowerCase().trim(),
            password: encryptedPassword,
            role: body.role || "user",
            validatedMail: Boolean(body.validatedMail || false),
            expoPushToken: body.expoPushToken ?? null,
            authorizedTransport: Boolean(body.authorizedTransport || false),
            lastKnownLocation: body.lastKnownLocation ?? undefined
        };

        const newUser = await User.create(userToCreate);

        const userObj = newUser.toObject();
        delete userObj.password;

        return NextResponse.json(
            { message: "User successfully created.", user: userObj },
            { status: 201 }
        );
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
