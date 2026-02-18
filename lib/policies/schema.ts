import { z } from "zod";

export const LatLngSchema = z.object({
  lat: z.number(),
  lng: z.number()
});

export const PolicyPointSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string(),
  point: LatLngSchema,
  radiusM: z.number().optional(),
  message: z.string().optional()
});

export const PolicyGeofenceSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  polygon: z.array(LatLngSchema).min(3),
  speedLimitKmh: z.number().optional()
});

export const PolicySegmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  line: z.array(LatLngSchema).min(2),
  speedLimitKmh: z.number().optional()
});

export const PolicyPackSchema = z.object({
  version: z.literal(1),
  route: z.object({
    name: z.string().optional(),
    line: z.array(LatLngSchema).min(2)
  }),
  segments: z.array(PolicySegmentSchema).default([]),
  geofences: z.array(PolicyGeofenceSchema).default([]),
  points: z.array(PolicyPointSchema).default([])
});

export type PolicyPack = z.infer<typeof PolicyPackSchema>;
