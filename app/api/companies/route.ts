import { z } from "zod";
import { connectDB } from "@/lib/db";
import Company from "@/models/Company";

export const runtime = "nodejs";

const CreateCompanySchema = z.object({
  name: z.string().min(1).max(120),
});

export async function GET() {
  await connectDB();
  const items = await Company.find({}).sort({ createdAt: -1 }).lean();
  return Response.json({ items });
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  const data = CreateCompanySchema.parse(body);

  const created = await Company.create({ name: data.name });
  return Response.json({ item: created }, { status: 201 });
}
