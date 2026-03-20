import { connectDB } from "@/lib/db";
import { emitDriverChatMessage } from "@/lib/realtime/socketDispatch";
import { getTenantContext } from "@/lib/tenant";
import Trip from "@/models/Trip";
import TripChatMessage from "@/models/TripChatMessage";
import {
  getAuthUser,
  isValidObjectId,
  unauthorized,
} from "@/app/api/trips/_helpers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ tripId: string }> };

function toItem(doc: any) {
  const driverUserId = String(doc?.driverUserId || "");
  const senderUserId = String(doc?.senderUserId || "");
  return {
    id: String(doc?._id || ""),
    tripId: String(doc?.tripId || ""),
    driverUserId,
    senderUserId,
    senderType: senderUserId && driverUserId && senderUserId === driverUserId ? "driver" : "dispatcher",
    text: String(doc?.text || ""),
    status: String(doc?.status || "sent"),
    deliveredAt: doc?.deliveredAt ? new Date(doc.deliveredAt).toISOString() : null,
    spokenAt: doc?.spokenAt ? new Date(doc.spokenAt).toISOString() : null,
    readAt: doc?.readAt ? new Date(doc.readAt).toISOString() : null,
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    const { tripId } = await ctx.params;
    if (!isValidObjectId(tripId)) {
      return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").trim();
    if (!text) {
      return Response.json({ ok: false, error: "missing_text" }, { status: 400 });
    }
    if (text.length > 140) {
      return Response.json({ ok: false, error: "text_too_long" }, { status: 400 });
    }

    await connectDB();
    const tenantContext = await getTenantContext(req);
    if (!tenantContext.ok) {
      return Response.json({ ok: false, error: tenantContext.error, message: tenantContext.message }, { status: tenantContext.status });
    }
    const tenantId = tenantContext.tenantId;

    const trip = tenantId
      ? await Trip.findOne({ _id: tripId, companyId: tenantId }).select("userId companyId").lean()
      : await Trip.findById(tripId).select("userId companyId").lean();
    if (!trip) {
      return Response.json({ ok: false, error: "trip_not_found" }, { status: 404 });
    }

    const driverUserId = String((trip as any).userId || "");
    if (!isValidObjectId(driverUserId)) {
      return Response.json({ ok: false, error: "invalid_driver" }, { status: 400 });
    }
    if (auth.id !== driverUserId) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const created = await TripChatMessage.create({
      companyId: (trip as { companyId?: unknown }).companyId ?? tenantId ?? null,
      tripId,
      driverUserId,
      senderUserId: auth.id,
      text,
      status: "sent",
    });

    const payload = toItem(created);
    await emitDriverChatMessage({ tripId, payload });

    return Response.json({ ok: true, item: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[trips/chat/reply] failed:", err);
    return Response.json(
      { ok: false, error: "failed_to_create_trip_chat_reply", message },
      { status: 500 },
    );
  }
}


