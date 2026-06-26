# ANÁLISIS EXHAUSTIVO DEL SISTEMA COPILOT
## Relevamiento Completo de Arquitectura, Flujos y Features

**Fecha**: 18 de Abril 2026  
**Proyectos**: copilotGM (mobile) + copilot-web (backend)  
**Enfoque**: Descripción funcional detallada de qué hace realmente cada componente y cómo se conectan

---

## 1. VISIÓN GENERAL DEL PRODUCTO

### ¿QUÉ ES COPILOT?

**Copilot es un sistema de tele-operación y logística de transporte en dos capas:**

1. **Capa Móvil (copilotGM - React Native)**: Navegador GPS inteligente para choferes que:
   - Recibe rutas asignadas desde operaciones
   - Guía en tiempo real mediante GPS + turnos-por-turnos
   - Monitorea adherencia a la ruta (desviaciones, giros incorrectos)
   - Registra eventos operativos (velocidad excesiva, puntos de interés, segmentos alertables)
   - Permite respuesta por voz del chofer a operador

2. **Capa Web (copilot-web - Next.js)**: Panel de control para operador que:
   - Asigna rutas a choferes con horarios planificados
   - Recibe en tiempo real: posición GPS, eventos, muestras de viaje
   - Mensajea a choferes durante ruta
   - Analiza ahora o después el cumplimiento de ruta
   - Maneja múltiples empresas (multi-tenant)

### OBJETIVO FUNCIONAL

Garantizar que choferes:
- Sigan exactamente la ruta planificada
- Mantengan límites de velocidad
- Pasen por puntos operativos clave (POIs)
- Registren todo digitalmente para auditoría
- Puedan confirmar instrucciones por voz

Garantizar que operadores:
- Vean dónde están sus choferes EN TIEMPO REAL
- Comuniquen cambios/instrucciones mientras conducen
- Tengan registro completo de cada viaje
- Puedan evaluar cumplimiento y desempeño

---

## 2. APP MÓVIL (COPILOTGM) - ARQUITECTURA Y CAPAS

### CAPAS TÉCNICAS

```
LAYER 5: UI (Expo Router + React Components)
├─ Authentication (login.tsx)
├─ Navigation Selection (select-route, Select-destination)
└─ Main Navigation Screen (EngineNav.tsx)

LAYER 4: Business Logic
├─ Navigation Engine (lib/navEngine)
│  ├─ GPS tracking y map-matching
│  ├─ Route following logic
│  ├─ POI/Segment detection
│  └─ Turn-by-turn guidance
├─ Trip Recording (lib/trips/TripRecorderService)
│  ├─ Local queue management
│  ├─ Sync to backend
│  └─ Offline persistence
└─ Voice & Chat (lib/voice, lib/chat)
   ├─ Text-to-speech orchestration
   ├─ Speech recognition
   └─ Real-time chat with dispatcher

LAYER 3: State Management & Context
├─ AuthContext (JWT, tenant, user profile)
├─ TripRecorderService (trip state)
└─ VoiceOrchestrator (priority queue)

LAYER 2: Native Integration (Expo)
├─ Location (expo-location)
├─ Maps (React Native Maps + Google)
├─ Speech (expo-speech, expo-speech-recognition)
└─ Storage (expo-secure-store, AsyncStorage)

LAYER 1: Persistence
├─ Secure Store (JWT token, tenant ID)
└─ AsyncStorage (trip queue, preferences)
```

### FLUJO DE INICIALIZACIÓN

1. **App Launch** → Expo inicia
2. **Root Layout** (`app/_layout.tsx`) → Carga providers (Auth, Theme)
3. **Auth Restoration** → Lee token de SecureStore, valida con `/api/users/me`
4. **Router Decision** → Si no auth → (auth) → login.tsx, Si auth → (app) con tabs
5. **Bienvenida por Voz** → "Bienvenido, [nombre]" via VoiceOrchestrator

---

## 3. FLUJO PRINCIPAL: NAVEGACIÓN GPS EN TIEMPO REAL

### INICIALIZACIÓN DEL VIAJE

**Usuario elige entre:**

**Opción A: Ruta Asignada**
```
GET /api/trip-plans/my?status=assigned
↓ SELECT de TripPlan
EngineNav { mode="assigned", routeId }
↓ GET /api/routes/:routeId
```

**Opción B: Destino Libre**
```
GooglePlacesAutocomplete → enter address → get lat/lng
EngineNav { mode="destination", destLat, destLng }
↓ Google Directions API (client-side)
```

### LOOP DE PROCESAMIENTO GPS (cada ~1 segundo)

**Función**: `useNavLocationStream()` + EngineNav → perma-running state machine

```
1. RECIBIR GPS TICK
   ├─ Expo Location emit: { latitude, longitude, heading, speed, accuracy }
   └─ Timestamp, validar accuracy

2. MAP-MATCHING (Snap GPS to polyline)
   ├─ Calcular distancia perpendicular a cada segmento
   ├─ Encontrar punto más cercano: matchPoint
   └─ Retorna: { point, index, t (0-1), dist (metros a ruta) }

3. OFF-ROUTE DETECTION
   ├─ Si dist > 30m: offRouteCount++
   ├─ Si offRouteCount > 3 ticks:
   │  ├─ Emitir event "offroute_start"
   │  ├─ Voz: "¡¡Saliste de ruta!!"
   │  └─ Banner rojo
   └─ Si dist vuelve < 20m:
      ├─ Emitir "offroute_end"
      └─ Limpiar

4. WRONG-WAY DETECTION
   ├─ Speed > 8 km/h AND
   ├─ Angle diff (bearing GPS vs bearing ruta) > 110° AND
   ├─ Consistente por 4 ticks
   └─ Emitir "offroute_start" (tratado como desvío)

5. STEP PROCESSING (Turn-by-turn)
   ├─ Determinar step actual por matchPoint.index
   ├─ Calcular distancia al próximo giro: remainingM
   ├─ TRIGGERS:
   │  ├─ remainingM <= 800m: Voz "Gira a derecha en 800m" (far)
   │  ├─ remainingM <= 120m: Voz "Gira a derecha en 120m" (near)
   │  └─ remainingM <= 10m: Emitir "step_change" event
   └─ Actualizar UI card

6. SEGMENT PROCESSING (Policy zones)
   ├─ Para cada segment { fromMeterM, toMeterM, type, alertText }
   ├─ Si ENTER (current_M >= from AND was_outside):
   │  ├─ Emitir "segment_enter"
   │  ├─ Voz: "Zona {name}: {alertText}"
   │  ├─ Banner: color según type (critical=rojo, alert=naranja)
   │  └─ Update speedLimit
   └─ Si EXIT:
      ├─ Emitir "segment_exit"
      └─ Limpiar

7. POI PROCESSING (Points of Interest)
   ├─ Para cada POI { coords, radius, title, alertText }
   ├─ distance_to_poi = haversine(current_pos, poi.coords)
   ├─ STAGES:
   │  ├─ 2km (pre-alert): Voz info "Próximamente {title}"
   │  ├─ 400m (near): Voz "En 400m {title}"
   │  ├─ radius (entry): Emitir "poi_enter", Voz "¡¡{title}!!", banner
   │  └─ exit: Emitir "poi_exit", limpiar
   └─ Throttle: máx 1 alerta POI cada 20s

8. SPEED LIMIT MONITORING
   ├─ Determinar speedLimit en current position (de segments)
   ├─ SI currentSpeedKmh > limit + 5kmh:
   │  ├─ Primera vez: Emitir "speed_over_start", Voz critical "¡¡EXCESO!!"
   │  ├─ Después 1s: Emitir "speed_over_peak"
   │  └─ Cada 10s: Voz reminder "Reduce velocidad"
   ├─ SI speed baja < limit - 10kmh:
   │  └─ Emitir "speed_over_end"
   └─ UI: Mostrar badge con speed, rojo si over

9. TRIP RECORDING HOOK
   ├─ Llamar useTripRecorder().onLocationTick({
   │    mm: matchPoint,
   │    location: Expo Location,
   │    shouldCaptureTrip
   │  })
   └─ [Ver sección 2.4 abajo para detalles]

10. UPDATE UI
    └─ Re-render todos componentes visuales con nuevo state
```

### COMPONENTES UI DE NAVEGACIÓN

```
┌──────────────────────────────────────────────────────┐
│ FULL-SCREEN MAP (MapLayer.tsx)                       │
│ - Polyline azul (ruta)                               │
│ - Current position (círculo pulsante)                │
│ - POI markers con íconos                             │
│ - Segment overlays (coloreados)                      │
│ - Camera heading-up, 60° pitch, zoom 18              │
└──────────────────────────────────────────────────────┘

OVERLAYS:
  [Top] ┌─────────────────────────────────────────┐
        │ STEP CARD (StepInstructionCard)         │
        │ ► Turn Right                             │
        │ 250 m | Avenida Corrientes              │
        │ ► Next: Continue straight                │
        └─────────────────────────────────────────┘

  [Top+] ┌─────────────────────────────────────────┐ (if active)
         │ SEGMENT BANNER (SegmentBanner)         │
         │ 🚨 CRITICAL ZONE                        │
         │ Construcción Activa - 20 km/h          │
         └─────────────────────────────────────────┘

  [Right] ┌────────────────────┐ (landscape)
          │ PRE-ALERT BANNER   │
          │ 📍 2 km: Depósito  │
          └────────────────────┘

  [Top-Right] ┌──────────────┐
              │ SPEED BADGE  │
              │ 65 km/h      │ (rojo si over)
              └──────────────┘

  [Bottom-Right] ┌──────────────────┐
                 │ Recenter FAB      │
                 │ Settings Modal    │
                 │ Rejoin Button     │
                 └──────────────────┘
```

---

## 4. TRIP RECORDING SERVICE (Grabación de Viajes)

### CICLO DE VIDA DEL VIAJE

```
IDLE 
  ↓ Usuario selecciona ruta
INITIATING
  POST /api/trips/start → Backend crea Trip, retorna tripId
  ↓
ACTIVE (grabando)
  - Samples cada 30s
  - Eventos al momento
  - Sync cada 10s
  - [Chofer puede pausar]
  ↓
PAUSED (opcional)
  - Sigue grabando en memory
  - NO envía a backend
  - [Chofer resume o finaliza]
  ↓
FINISHING
  POST /api/trips/:tripId/finish → Backend marca finished
  ↓
IDLE
```

### SAMPLE COLLECTION (GPS Muestreo)

```
Cada 30 segundos:
  ├─ Crear TripSample {
  │    t: ISO timestamp,
  │    pos: {latitude, longitude},
  │    speedKmh: location.coords.speed * 3.6,
  │    heading: location.coords.heading,
  │    accuracyM: location.coords.accuracy,
  │    mm: { index, t, distToPathM }  // map-match data
  │  }
  ├─ DEDUPLICACIÓN: fingerprint JSON, skip si idéntico
  └─ Guardar samplesQueue.push(sample)

Si samplesQueue.length > 2000:
  └─ Truncar samples más viejos (evita OOM)
```

### EVENT RECORDING (Eventos Operativos)

```
Eventos grabados:
  - trip_start, trip_end
  - step_change (cambio de giro)
  - offroute_start, offroute_end
  - wrong_way (dirección incorrect)
  - poi_enter, poi_exit
  - segment_enter, segment_exit
  - speed_over_start, speed_over_peak, speed_over_end
  - custom

Cada evento incluye:
  {
    id: UUID,
    tripId: currentTripId,
    type: TripEventType,
    t: ISO timestamp,
    pos: {lat, lng},
    routePos: { index, t, distToPathM },
    [type-specific data]: poi, segment, step, speed info
  }

guardado en eventsQueue
```

### SYNC LOOP (cada 10 segundos)

```
1. RETRY LOGIC (exponential backoff)
   ├─ Si error anterior: retryAttempts++
   ├─ nextRetryMs = min(2000 * 2^attempts, 60000)
   └─ Si now() < nextRetryMs: postpone

2. BATCH SAMPLES (primeros 50)
   POST /api/trips/:tripId/samples
   { samples: [...] }
   → Si success: remover de queue, reset retries
   → Si error: keep en queue, retry

3. BATCH EVENTS (primeros 20)
   POST /api/trips/:tripId/events
   { events: [...] }
   → Idem

4. PERSISTENCIA
   ├─ AsyncStorage: Guarda queue cada 5 min
   ├─ On app resume: Restaura state
   └─ Si crash: Recupera y continúa desde queue
```

---

## 5. VOZ Y CHAT

### VOICE ORCHESTRATOR (Priority Queue)

```
Priority levels (highest to lowest):
  0. CRITICAL      - Emergency alerts
  1. NAV_INSTRUCTION - Turn-by-turn
  2. ALERT         - Speed warnings, segments
  3. INFO          - POI notices
  4. DISPATCHER    - Operator messages

Flujo:
  enqueue({ text, priority, language, rate })
    ├─ Validar enabled
    ├─ Si critical: interrupt playback actual
    ├─ Si prioridad < non-critical: Clear queue no-critical
    └─ Añadir a queue

  Playback loop:
    ├─ Play message (expo-speech)
    ├─ On complete: emit callback, dequeue next
    └─ Repeat

Voice Preferences (persisted AsyncStorage):
  ├─ enabled: boolean
  ├─ rate: 0.5 | 0.8 | 1.0 | 1.2 | 1.5
  ├─ identifier: native voice ID
  └─ messages: { navigation: bool, notices: bool }
```

### CHAT CON TTS (useDriverTripChatTts)

```
Flujo Dispatcher → Driver:

Web Panel:
  POST /api/trips/:tripId/chat/reply
  { text: "Gira en La Plata" }

Backend:
  ├─ Create TripChatMessage doc
  └─ Emit to socket.io: driver_chat_message event

Mobile (Socket listener):
  ├─ Deduplicar (Set + AsyncStorage)
  ├─ VoiceOrchestrator.enqueue(msg.text, priority="dispatcher")
  ├─ On playback done: PATCH status="spoken"
  └─ After timeout: PATCH status="read"

Catch-up on reconnect:
  └─ GET /api/trips/:tripId/chat/pending
  └─ Procesar todos pending (repeat dedup)
```

### VOICE REPLY (useDriverVoiceReply)

```
State Machine:

IDLE
  ↓ Escuchar keyword "responder" por 8s
LISTENING_FOR_KEYWORD
  ↓ Keyword encontrado
DICTATION
  ├─ Escuchar voz, max 140 chars, max 20s o 3s silencio
  └─ Mostrar transcripción en vivo
  ↓
CONFIRM
  ├─ Reproducir: "Dijiste: {texto}"
  ├─ Esperar: "si", "enviar", etc. o timeout 5s
  └─ Si confirmado:
     ↓
SENDING
     POST /api/trips/:tripId/chat/reply
     { text: transcribed_text }
     ↓ On success
IDLE
```

---

## 6. BACKEND (COPILOT-WEB) - ARQUITECTURA

### STACK TECNOLÓGICO

```
Framework: Next.js 16 (App Router, Server Routes)
Database: MongoDB (mongoose ODM)
Auth: JWT (7 días expiry)
API: REST endpoints + Socket.IO for real-time
Maps: Google Maps Platform (Directions, Geocoding)
Real-time: Socket.IO (separate socket-server service)
```

### RUTA DE INICIALIZACIÓN

1. `next.config.ts` → Sets `runtime: "nodejs"`
2. `app/layout.tsx` → Root layout
3. `app/page.tsx` → Home / Redirect to dashboard
4. `lib/db.ts` → MongoDB connection pool (lazy init)
5. `lib/auth.ts` → JWT decode helpers

### MULTI-TENANT RESOLUTION

```typescript
getTenantContext(req) {
  // Priority:
  1. X-Tenant-Id header
  2. user.defaultCompanyId
  3. First active membership
  
  └─ Validate user belongs to tenant
  └─ Return { tenantId, tenantRole, source }
}

// USAGE in API routes:
const { tenantId } = getTenantContext(request);
const trips = await Trip.find({ companyId: tenantId, userId });
```

---

## 7. MODELOS DE DATOS (MONGODB)

### User
```mongodb
{
  firstName, lastName, email (unique),
  password (bcrypt), role (default: "user"),
  isDeleted, validatedMail, expoPushToken,
  defaultCompanyId,
  
  memberships: [{
    companyId,
    tenantRole,
    status: "active" | "inactive"
  }],
  
  lastKnownLocation: { latitude, longitude, heading, speedKmh, accuracy, recordedAt },
  timestamps
}
```
**Indices**: email, memberships.companyId, defaultCompanyId

### Route
```mongodb
{
  companyId,
  title, kml,
  
  policyPack: {
    pois: [{ coords, radius, title, alertText, type }],
    segments: [{ name, type, fromMeterM, toMeterM, speedLimit, alertText }]
  },
  
  nav: {
    status: "none" | "ready" | "needs_review" | "failed",
    compiledAt, mode: "google_steps",
    validate: { validatedAt, matchPct, pass, promoted }
  },
  
  google: {
    densePath: [{ latitude, longitude }],  // Decoded polyline
    steps: [{ Google Direction step }],
    totals: { distanceM, durationS }
  },
  
  timestamps
}
```
**Indices**: companyId, createdAt

### Trip
```mongodb
{
  companyId, userId (indexed), routeId (indexed),
  title, notes,
  
  status: "active" | "paused" | "finished" | "aborted" (indexed),
  startedAt (indexed), endedAt,
  
  startPos: { latitude, longitude },
  endPos: { latitude, longitude },
  
  live: { t, pos, speedKmh, heading, accuracyM },
  
  device: { platform, appVersion, deviceId },
  
  totals: {
    distanceM, durationS, maxSpeedKmh,
    speedOverCount, speedOverDurationS,
    offrouteCount, offrouteDurationS,
    poiHits, segmentEntries,
    samplesCount, eventsCount
  },
  
  timestamps
}
```
**Indices**: userId-startedAt, routeId-startedAt, companyId-userId-startedAt

### TripSample
```mongodb
{
  companyId (indexed), tripId (indexed, indexed), userId, routeId,
  
  t: Date (indexed),
  pos: { latitude, longitude },
  speedKmh, heading, accuracyM,
  mm: { index, t, distToPathM },
  
  timestamps
}
```
**Indices**: tripId-t, companyId-tripId-t

### TripEvent
```mongodb
{
  companyId (indexed), tripId (indexed), userId (indexed), routeId,
  
  t: Date (indexed),
  type: enum [
    "trip_start", "trip_end",
    "poi_enter", "poi_exit",
    "segment_enter", "segment_exit",
    "step_change",
    "speed_over_start", "speed_over_peak", "speed_over_end",
    "offroute_start", "offroute_end",
    "custom"
  ] (indexed),
  
  pos: { latitude, longitude },
  routePos: { mmIndex, mmT, distToPathM },
  poi: { poiId, title },
  segment: { segmentId, name, type },
  step: { stepIndex, maneuver },
  speed: { limitKmh, speedKmh, overByKmh, overForMs },
  meta: Mixed,
  
  timestamps
}
```
**Indices**: tripId-t, userId-t, companyId-tripId-t

### TripPlan (Assignment)
```mongodb
{
  companyId (indexed), driverUserId (indexed), routeId (indexed),
  plannedStartAt (indexed),
  
  status: enum [
    "planned", "assigned", "in_progress", "completed", "cancelled"
  ] (indexed),
  
  title, notes,
  vehicle: { plate, label },
  tripId: ObjectId (when started),
  
  createdBy: User.id,
  timestamps
}
```
**Indices**: driverUserId-plannedStartAt, status-plannedStartAt

### TripChatMessage
```mongodb
{
  companyId (indexed), tripId (indexed), driverUserId (indexed),
  senderUserId,
  
  text: String (max 140),
  status: "sent" | "delivered" | "spoken" | "read" (indexed),
  
  deliveredAt, spokenAt, readAt: Date,
  timestamps
}
```

---

## 8. API ENDPOINTS (Mobile-Web Contract)

### TRIP LIFECYCLE

#### Start Trip
```
POST /api/trips/start
Body: {
  routeId: "route_789",
  startPos: { latitude, longitude },
  device: { platform, appVersion, deviceId }
}

Response (200): { ok: true, tripId: "trip_456" }

Backend:
  ├─ Validate routeId belongs to tenant
  ├─ Create Trip { status: "active", startedAt: now, ... }
  ├─ Create TripEvent type="trip_start"
  └─ Notify socket of new trip
```

#### Record Samples
```
POST /api/trips/:tripId/samples
Body: {
  samples: [{
    t, pos: {latitude, longitude}, speedKmh, heading, accuracyM,
    mm: {index, t, distToPathM}
  }]
}

Response (200): { ok: true, inserted: 50 }

Backend:
  ├─ Validate trip active/paused
  ├─ For each sample:
  │  ├─ Validate pos finite
  │  └─ Create TripSample doc
  ├─ Update Trip.live, Trip.totals.samplesCount
  └─ Skip invalid (don't fail entire request)
```

#### Record Events
```
POST /api/trips/:tripId/events
Body: {
  events: [{
    t, type, pos: {latitude, longitude},
    routePos: {mmIndex, mmT, distToPathM},
    [type-specific fields]
  }]
}

Response (200): { ok: true, inserted: 3 }

Backend:
  ├─ Validate trip active/paused
  ├─ Create TripEvent docs
  ├─ Update Trip.totals based on type
  └─ Normalize routePos fields
```

#### Update Status (Pause/Resume)
```
PATCH /api/trips/:tripId/status
Body: { status: "paused" | "active" }

Response (200): { ok: true }

Backend:
  ├─ Validate allowed transition
  └─ Update Trip.status
```

#### Finish Trip
```
POST /api/trips/:tripId/finish
Body: {
  endPos: { latitude, longitude },
  totalsPatch: {
    distanceM, durationS, maxSpeedKmh,
    speedOverCount, speedOverDurationS,
    ...
  }
}

Response (200): { ok: true }

Backend:
  ├─ Create TripEvent type="trip_end"
  ├─ Update Trip { status: "finished", endedAt: now, endPos, ... }
  ├─ Merge totalsPatch (validate keys allowed)
  ├─ Lock trip (no more modifications)
  └─ Emit to socket
```

### ROUTES & TRIP PLANS

#### Get My Trip Plans
```
GET /api/trip-plans/my?status=assigned,in_progress&limit=50

Response (200): {
  ok: true,
  items: [{
    _id, routeId: {title, google.totals}, tripTitle,
    plannedStartAt, status, tripId, vehicle
  }]
}
```

#### Fetch Route
```
GET /api/routes/:routeId

Response (200): {
  ok: true,
  item: {
    _id, title,
    google: { steps, densePath, totals },
    policyPack: { pois, segments },
    nav: { status, mode, compiledAt }
  }
}
```

#### Compile Route
```
POST /api/routes/:routeId/compile

Backend:
  ├─ Parse KML
  ├─ Call Google Directions
  ├─ Extract steps + polyline
  ├─ Decode polyline → densePath
  └─ Mark nav.status = "ready"
```

---

## 9. FLUJOS DE USUARIO COMPLETOS

### FLUJO A: Chofer Completa Viaje Asignado

```
[WEB PANEL]
Dispatcher:
  1. Click "Crear plan de viaje"
  2. Select: Driver, Route, Time, Vehicle
  3. Click "Asignar"
  → POST /api/trip-plans + Push notification

[MOBILE]
Driver:
  1. Login (email/password)
  2. Home → "Selecciona ruta asignada"
  3. GET /api/trip-plans/my
  4. Tap ruta → EngineNav
  5. POST /api/trips/start → tripId
  6. Navega ~30 minutos:
     - Graba samples cada 30s
     - Eventos al momento
     - Sync cada 10s
     - Voz: giros, velocidad, POIs
  7. Llega → "Finalizar Viaje"
  8. POST /api/trips/:tripId/finish
  
[WEB PANEL]
Dashboard:
  - Vee: Trip finished, totals, duration, events
  - Click → Timeline con todos los events
```

### FLUJO B: Destino Libre

```
[MOBILE]
Driver:
  1. Home → "Ingresa destino"
  2. GooglePlacesAutocomplete → Select address
  3. EngineNav { mode: "destination" }
  4. Google Directions (client-side)
  5. Navega sin ruta predefinida
  6. Finaliza
  
[DIFERENCIAS]
  ✗ Sin POIs/segmentos (no hay policyPack)
  ✗ Sin auditoría de adherencia
  ✓ Funciona en destino genérico
```

### FLUJO C: Chat en Vivo

```
[WEB PANEL]
Dispatcher:
  1. Abre chat de viaje en panel
  2. Escribe: "Reduce velocidad"
  3. Click "Enviar"
  → POST /api/trips/:tripId/chat
  → Emit socket: driver_chat_message

[MOBILE]
Driver:
  1. Escucha (TTS): "Mensaje dice: Reduce velocidad"
  2. Dashboard marca "delivered"
  3. [Optional] Toca botón "Responder"
  4. Voz: "Está bien, bajo ya"
  5. POST /api/trips/:tripId/chat/reply
  → Status: "delivered" → "spoken" → "read"

[WEB PANEL]
  Dispatcher ve: Message status updates en tiempo real
```

---

## 10. CARACTERÍSTICAS POR MÓDULO

### NAVEGACIÓN
| Feature | Implemented | Details |
|---------|-------------|---------|
| GPS Realtime | ✓ | Expo Location, 1m interval |
| Map-Matching | ✓ | Snap to polyline, calc distance |
| Turn-by-turn | ✓ | Far (800m) + near (120m) alerts |
| Off-route | ✓ | 30m threshold, 3-4 tick filtering |
| Wrong-way | ✓ | Bearing diff 110°, 4 tick consistent |
| Auto-follow cam | ✓ | Heading-up, 60° pitch |
| Route visuals | ✓ | Polyline + overlays |

### VOZ Y AUDIO
| Feature | Implemented | Details |
|---------|-------------|---------|
| TTS | ✓ | expo-speech, 5-level priority queue |
| Turn instructions | ✓ | Far/near/arrival |
| Speed alerts | ✓ | Critical priority |
| Chat messages | ✓ | TTS + status tracking |
| Voice reply | ✓ | STT keyword→dictation→confirm |
| Preferences | ✓ | Speed, enable/disable categories |

### TRIP RECORDING
| Feature | Implemented | Details |
|---------|-------------|---------|
| Sampling | ✓ | Every 30s, dedup, max 2000 local |
| Events | ✓ | 11+ types, logged immediately |
| Syncing | ✓ | Every 10s, batched, exponential backoff |
| Offline | ✓ | AsyncStorage buffer, resumes on connect |
| Status | ✓ | active/paused/finished |

### MULTI-TENANT
| Feature | Implemented | Details |
|---------|-------------|---------|
| Memberships | ✓ | Multiple companies per user |
| Isolation | ✓ | All queries scoped |
| Switching | ✓ | Mobile can switch tenants |
| Headers | ✓ | X-Tenant-Id propagated |

---

## 11. SERVICIOS EXTERNOS

### Google Maps Platform
- **Directions API**: Route compilation
- **Places Autocomplete**: Destination search
- **React Native Maps**: Mobile rendering
- **Maps JavaScript**: Web dashboard
- **Cost**: ~$0.01 per route compile

### Socket.IO (Real-time)
- **Separate service**: socket-server/
- **Events**: driver_chat_message, trip_status_update
- **Auth**: jwt token (mobile), API key (backend)

### MongoDB Atlas
- **Collections**: users, routes, trips, samples, events, chat, plans
- **Estimated**: 100GB+ per year at scale
- **Key Indices**: For query performance

---

## 12. PUNTOS FALTANTES Y MEJORAS

### Pending Features
1. **Reenganche Inteligente**: Auto-rerouting si desvío > 5min
2. **KPI Scoring**: Cumplimiento de ruta post-viaje
3. **Structured Logging**: Sentry + ELK para observabilidad
4. **Route Validation**: Schema checks en compile
5. **Background Recovery**: expo-background-tasks
6. **Dynamic Speed Limits**: Horarios de restricción
7. **Performance Dashboard**: Aggregation de driver KPIs
8. **Offline Maps**: Cached tiles para navegación sin internet

### Inconsistencias Encontradas
1. **Event fields**: routePos usa `mmIndex/mmT` pero samples usa `index/t`
2. **Tenant resolution**: Mobile vs web priorizan diferente
3. **Status transitions**: No validar idempotencia (¿qué si envía PATCH dos veces?)
4. **Speed over duration**: Backend debería calcular de events, no confiar en app

### Recomendaciones Top 3
1. Week 1: Implement KPI Scoring (adherencia %)
2. Week 2: Add Structured Logging (Sentry + custom)
3. Week 3: Route Validation schemas (Zod)

---

**Fin del Análisis** ✓
