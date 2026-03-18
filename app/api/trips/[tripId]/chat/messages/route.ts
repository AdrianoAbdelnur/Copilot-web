import { connectDB } from "@/lib/db";
import { emitDriverChatMessage } from "@/lib/realtime/socketDispatch";
import Trip from "@/models/Trip";
import TripChatMessage from "@/models/TripChatMessage";
import {
  getAuthUser,
  isAdminRole,
  isValidObjectId,
  unauthorized,
} from "@/app/api/trips/_helpers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ tripId: string }> };

function toItem(doc: any) {
  return {
    id: String(doc?._id || ""),
    tripId: String(doc?.tripId || ""),
    driverUserId: String(doc?.driverUserId || ""),
    senderUserId: String(doc?.senderUserId || ""),
    text: String(doc?.text || ""),
    status: String(doc?.status || "sent"),
    deliveredAt: doc?.deliveredAt ? new Date(doc.deliveredAt).toISOString() : null,
    spokenAt: doc?.spokenAt ? new Date(doc.spokenAt).toISOString() : null,
    readAt: doc?.readAt ? new Date(doc.readAt).toISOString() : null,
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    const { tripId } = await ctx.params;
    if (!isValidObjectId(tripId)) {
      return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    await connectDB();

    const trip = await Trip.findById(tripId).select("userId").lean();
    if (!trip) {
      return Response.json({ ok: false, error: "trip_not_found" }, { status: 404 });
    }

    const driverUserId = String((trip as any).userId || "");
    const adminMode = isAdminRole(auth.role);
    if (!adminMode && auth.id !== driverUserId) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") || 50);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50, 1), 200);

    const rows = await TripChatMessage.find({ tripId }).sort({ createdAt: -1 }).limit(limit).lean();
    return Response.json({ ok: true, items: rows.reverse().map((x) => toItem(x)) });
  } catch {
    return Response.json({ ok: false, error: "failed_to_list_trip_chat_messages" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();
    if (!isAdminRole(auth.role)) {
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

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

    const trip = await Trip.findById(tripId).select("userId").lean();
    if (!trip) {
      return Response.json({ ok: false, error: "trip_not_found" }, { status: 404 });
    }

    const driverUserId = String((trip as any).userId || "");
    if (!isValidObjectId(driverUserId)) {
      return Response.json({ ok: false, error: "invalid_driver" }, { status: 400 });
    }

    const created = await TripChatMessage.create({
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
    console.error("[trips/chat/messages] failed:", err);
    return Response.json(
      { ok: false, error: "failed_to_create_trip_chat_message", message },
      { status: 500 },
    );
  }
}


