const DEFAULT_REALTIME_URL = "http://127.0.0.1:4001";

type EmitDriverChatArgs = {
  tripId: string;
  payload: unknown;
};

export async function emitDriverChatMessage({
  tripId,
  payload,
}: EmitDriverChatArgs): Promise<void> {
  const baseUrl = String(
    process.env.SOCKET_SERVER_URL ||
      process.env.REALTIME_SERVER_URL ||
      DEFAULT_REALTIME_URL,
  ).trim();
  const secret = String(
    process.env.INTERNAL_API_KEY || process.env.REALTIME_INTERNAL_SECRET || "",
  ).trim();
  if (!secret) {
    throw new Error("Missing INTERNAL_API_KEY (or REALTIME_INTERNAL_SECRET)");
  }
  const safeTripId = String(tripId || "").trim();
  const data = (payload || {}) as {
    id?: string;
    text?: string;
    senderUserId?: string;
    senderType?: string;
  };
  const messageId = String(data.id || "").trim();
  const text = String(data.text || "").trim();
  const senderUserId = String(data.senderUserId || "").trim();
  const senderType = String(data.senderType || "").trim();
  if (!safeTripId || !messageId || !text) {
    throw new Error("Invalid realtime payload: tripId, id and text are required");
  }

  const res = await fetch(`${baseUrl}/internal/trips/${safeTripId}/chat/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": secret,
    },
    body: JSON.stringify({
      id: messageId,
      text,
      senderUserId: senderUserId || undefined,
      senderType: senderType || undefined,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = String(body?.message || body?.error || `status_${res.status}`);
    throw new Error(`realtime_emit_failed: ${message}`);
  }
}
