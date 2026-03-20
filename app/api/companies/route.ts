import { z } from "zod";
import { connectDB } from "@/lib/db";
import Company from "@/models/Company";
import { getSuperAdminAuth } from "@/app/api/admin/_auth";

export const runtime = "nodejs";

const CreateCompanySchema = z.object({
  name: z.string().min(1).max(120),
});

export async function GET(req: Request) {
  try {
    const auth = await getSuperAdminAuth(req);
    if (!auth.ok) return auth.response;

    await connectDB();
    const items = await Company.find({}).sort({ createdAt: -1 }).lean();
    return Response.json({ ok: true, items });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_companies" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getSuperAdminAuth(req);
    if (!auth.ok) return auth.response;

    await connectDB();
    const body = await req.json();
    const data = CreateCompanySchema.parse(body);

    const created = await Company.create({ name: data.name });
    return Response.json({ ok: true, item: created }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ ok: false, error: "invalid_company_payload" }, { status: 400 });
    }
    return Response.json({ ok: false, error: "failed_to_create_company" }, { status: 500 });
  }
}
