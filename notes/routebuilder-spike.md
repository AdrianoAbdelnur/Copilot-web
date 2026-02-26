# RouteBuilder Spike Context (Retomar después)

Fecha: 2026-02-25
Branch: `routebuilder-core-spike`

## Objetivo del spike
Construir un módulo independiente `RouteBuilder` (core + providers + exporter) para emular edición de rutas tipo Google My Maps (por calles), sin integrar todavía en la UI principal.

## Estado actual (hecho)
- Módulo core independiente en `lib/routeBuilder/*`
  - Tipos neutrales (`LatLng`, `RouteEditState`, `RouteComputeRequest`, `RouteResult`, `RouteProvider`)
  - Editor incremental (`setAnchor`, `addPointToEnd`, `insertPointAtIndex`, `movePoint`, `removePoint`, `clear`)
  - Distinción `stop` vs `shaping`
  - `buildRequest` devuelve `null` si hay menos de 2 puntos (`incomplete`)
- Servicio/orquestador `computeRouteForState` con manejo de errores y normalización
- Providers:
  - `MockRouteProvider` (tests/demo sin red)
  - `GoogleDirectionsProvider` (server-side REST, usa `GOOGLE_MAPS_API_KEY`)
- Exporter KML (`LineString` + Placemarks opcionales)
- Demo runner programático (`lib/routeBuilder/demoRunner.ts`)
- Pantalla demo aislada `app/route-builder-demo/page.tsx`
  - Google Maps real (browser key)
  - Click en mapa para anchor/append/insert
  - Cálculo por Directions vía endpoint demo server-side
  - `Places Autocomplete` para elegir dirección desde dropdown
  - Panel de puntos, request preview, KML export
- Endpoint demo server-side para Directions:
  - `app/api/route-builder/compute/route.ts`

## Requisitos de configuración (Google)
### Frontend (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`)
Necesita APIs habilitadas en el proyecto de Google Cloud:
- `Maps JavaScript API`
- `Places API` (o `Places API (New)` según el proyecto)

Restricciones sugeridas:
- HTTP referrers: `http://localhost:3000/*`

### Backend (`GOOGLE_MAPS_API_KEY`)
Necesita:
- `Directions API`

## Cómo probar (rápido)
1. Abrir `http://localhost:3000/route-builder-demo`
2. Escribir dirección y elegir una opción del Autocomplete
3. `Usar como Anchor`
4. Modo `Append` + clicks en mapa
5. Ver ruta por calles + request + KML

## Limitaciones actuales (pendientes)
- Insert de shaping point en mapa requiere `idx` manual (UI de demo)
- No hay click sobre polyline para insertar automáticamente en tramo más cercano
- No hay drag de puntos / drag de línea estilo My Maps
- No hay persistencia de `RouteEditState` en DB
- No está integrado en `/routes` ni en pantallas productivas

## Próximos pasos recomendados (orden)
1. Insert automático sobre la línea (sin `idx` manual)
   - Detectar segmento más cercano sobre `RouteResult.geometry.coordinates`
   - Inferir índice de inserción en `controlPoints`
2. Selección y edición de puntos existentes en mapa
   - Click marker => panel con mover/eliminar/cambiar `kind`
3. Drag de control points
   - `draggable: true` en markers demo
   - `movePoint` + recompute al soltar
4. UX de “append/infer”
   - Si no hay anchor, primer click = anchor automáticamente
   - Si hay anchor y no hay controlPoints, segundo click = append stop
5. Persistencia de estado
   - Guardar `RouteEditState` y snapshot de `RouteResult`
6. Integración gradual en UI real
   - Crear entrada controlada desde `/routes` sin romper flujo actual

## Archivos clave del spike
- `lib/routeBuilder/types.ts`
- `lib/routeBuilder/routeEditor.ts`
- `lib/routeBuilder/routeService.ts`
- `lib/routeBuilder/providers/googleDirectionsProvider.ts`
- `lib/routeBuilder/providers/mockProvider.ts`
- `lib/routeBuilder/exporters/kmlExporter.ts`
- `lib/routeBuilder/demoRunner.ts`
- `app/api/route-builder/compute/route.ts`
- `app/route-builder-demo/page.tsx`

## Comandos para retomar
```bash
git checkout routebuilder-core-spike
npm run dev
```

Luego abrir:
- `http://localhost:3000/route-builder-demo`

## Nota
Hay cambios del usuario en otros archivos del repo (UI/rutas actuales). No mezclar ni revertir esos cambios al continuar este spike.

