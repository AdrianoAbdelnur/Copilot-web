import { connectDB } from "@/lib/db";
import Trip from "@/models/Trip";
import TripChatMessage from "@/models/TripChatMessage";
import {
  getAuthUser,
  isAdminRole,
  isValidObjectId,
  unauthorized,
} from "@/app/api/trips/_helpers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ tripId: string; messageId: string }> };

type ChatStatus = "delivered" | "spoken" | "read";
const STATUS_RANK: Record<string, number> = {
  sent: 0,
  delivered: 1,
  spoken: 2,
  read: 3,
};

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return unauthorized();

    const { tripId, messageId } = await ctx.params;
    if (!isValidObjectId(tripId) || !isValidObjectId(messageId)) {
      return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const nextStatus = String(body?.status || "") as ChatStatus;
    if (!["delivered", "spoken", "read"].includes(nextStatus)) {
      return Response.json({ ok: false, error: "invalid_status" }, { status: 400 });
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

    const doc = await TripChatMessage.findOne({ _id: messageId, tripId });
    if (!doc) {
      return Response.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }

    const currRank = STATUS_RANK[String(doc.status || "sent")] ?? 0;
    const nextRank = STATUS_RANK[nextStatus];
    if (nextRank < currRank) {
      return Response.json({ ok: true, status: String(doc.status || "sent") });
    }

    doc.status = nextStatus;
    const now = new Date();
    if (!doc.deliveredAt && nextRank >= STATUS_RANK.delivered) {
      doc.deliveredAt = now;
    }
    if (!doc.spokenAt && nextRank >= STATUS_RANK.spoken) {
      doc.spokenAt = now;
    }
    if (!doc.readAt && nextRank >= STATUS_RANK.read) {
      doc.readAt = now;
    }

    await doc.save();
    return Response.json({ ok: true, status: String(doc.status) });
  } catch {
    return Response.json({ ok: false, error: "failed_to_update_chat_message_status" }, { status: 500 });
  }
}
