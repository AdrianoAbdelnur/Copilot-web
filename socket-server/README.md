# Socket Server (Render)

Servicio Socket.IO aislado para realtime del chat de conductor.

## Endpoints

- `GET /health`
- `POST /internal/trips/:tripId/chat/messages`

## Seguridad

El endpoint interno requiere header `x-api-key` y valida contra `INTERNAL_API_KEY`.

## Evento emitido

- `driver_chat_message`

Payload:

```json
{
  "id": "msg_123",
  "tripId": "trip_456",
  "text": "Mensaje del despacho",
  "senderUserId": "user_789",
  "senderType": "dispatcher",
  "createdAt": "2026-03-18T12:00:00.000Z"
}
```

## Variables de entorno

- `PORT` (Render la define)
- `ALLOWED_ORIGINS` (separadas por coma)
- `INTERNAL_API_KEY` (obligatoria)

## Deploy en Render

- Root Directory: `socket-server`
- Build Command: `npm install && npm run build`
- Start Command: `npm run start`

## Prueba rapida

```bash
curl -X POST "https://TU-SOCKET.onrender.com/internal/trips/TRIP_ID/chat/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_INTERNAL_API_KEY" \
  -d '{"id":"msg_1","text":"Hola conductor"}'
```

En la app cliente:

- `EXPO_PUBLIC_SOCKET_URL=https://TU-SOCKET.onrender.com`
