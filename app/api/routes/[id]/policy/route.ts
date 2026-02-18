import { NextResponse } from "next/server";
import mongoose from "mongoose";
import RouteModel from "@/models/RouteMap";
import { connectDB } from "@/lib/db";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connectDB();

  const { id } = await ctx.params;

  console.log(id)

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
    console.log("body", body);
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const pois = Array.isArray(body?.pois) ? body.pois : null;
  const segments = Array.isArray(body?.segments) ? body.segments : null;

  if (!pois && !segments) {
    return NextResponse.json({ ok: false, error: "Nada para guardar (pois/segments)" }, { status: 400 });
  }

  const doc = await RouteModel.findById(id);
  if (!doc) return NextResponse.json({ ok: false, error: "Ruta no encontrada" }, { status: 404 });

  if (!doc.policyPack || typeof doc.policyPack !== "object") doc.policyPack = {};

  if (pois) doc.policyPack.pois = pois;
  if (segments) doc.policyPack.segments = segments;

  doc.meta = doc.meta || {};
  if (pois) doc.meta.pois = pois.length;
  if (segments) (doc.meta as any).segments = segments.length;

  doc.markModified("policyPack");
  doc.markModified("meta");

  await doc.save();



  return NextResponse.json({
    ok: true,
    policyPack: doc.policyPack,
    meta: doc.meta,
  });
}
