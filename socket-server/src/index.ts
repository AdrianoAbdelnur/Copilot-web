import cors from "cors";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";

type InternalChatPayload = {
  id?: string;
  text?: string;
};

function parseAllowedOrigins(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const port = Number(process.env.PORT || 4001);
const internalApiKey = String(process.env.INTERNAL_API_KEY || "").trim();
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  }),
);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

io.on("connection", () => {
  // No-op. Keep socket lifecycle managed by Socket.IO defaults.
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "copilot-web-socket-server" });
});

app.post(
  "/internal/trips/:tripId/chat/messages",
  (req: Request<{ tripId: string }, unknown, InternalChatPayload>, res: Response) => {
    const requestApiKey = String(req.header("x-api-key") || "").trim();
    if (!internalApiKey || requestApiKey !== internalApiKey) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const tripId = String(req.params.tripId || "").trim();
    const messageId = String(req.body?.id || "").trim();
    const text = String(req.body?.text || "").trim();

    if (!tripId || !messageId || !text) {
      res.status(400).json({ error: "tripId, id and text are required" });
      return;
    }

    io.emit("driver_chat_message", {
      id: messageId,
      tripId,
      text,
      createdAt: new Date().toISOString(),
    });

    res.status(202).json({ ok: true });
  },
);

httpServer.listen(port, () => {
  console.log(`[socket-server] listening on port ${port}`);
});