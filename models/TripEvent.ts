import mongoose, { Schema, model, models } from "mongoose";

export const tripEventTypes = [
  "trip_start",
  "trip_end",
  "poi_enter",
  "poi_exit",
  "segment_enter",
  "segment_exit",
  "step_change",
  "speed_over_start",
  "speed_over_peak",
  "speed_over_end",
  "offroute_start",
  "offroute_end",
  "custom",
] as const;

const GeoPointSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false }
);

const RoutePosSchema = new Schema(
  {
    mmIndex: { type: Number, default: null },
    mmT: { type: Number, default: null },
    distToPathM: { type: Number, default: null },
  },
  { _id: false }
);

const PoiSchema = new Schema(
  {
    poiId: { type: Schema.Types.Mixed, default: null },
    title: { type: String, default: null },
  },
  { _id: false }
);

const SegmentSchema = new Schema(
  {
    segmentId: { type: Schema.Types.Mixed, default: null },
    name: { type: String, default: null },
    type: { type: String, default: null },
  },
  { _id: false }
);

const StepSchema = new Schema(
  {
    stepIndex: { type: Number, default: null },
    maneuver: { type: String, default: null },
  },
  { _id: false }
);

const SpeedSchema = new Schema(
  {
    limitKmh: { type: Number, default: null },
    speedKmh: { type: Number, default: null },
    overByKmh: { type: Number, default: null },
    overForMs: { type: Number, default: null },
  },
  { _id: false }
);

const TripEventSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    routeId: { type: Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    t: { type: Date, required: true, index: true },
    type: { type: String, enum: tripEventTypes, required: true, index: true },
    pos: { type: GeoPointSchema, required: true },
    routePos: { type: RoutePosSchema, default: null },
    poi: { type: PoiSchema, default: null },
    segment: { type: SegmentSchema, default: null },
    step: { type: StepSchema, default: null },
    speed: { type: SpeedSchema, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

TripEventSchema.index({ tripId: 1, t: 1 });
TripEventSchema.index({ userId: 1, t: -1 });

export type TripEventDoc = mongoose.InferSchemaType<typeof TripEventSchema>;

const TripEvent = models.TripEvent || model("TripEvent", TripEventSchema);
export default TripEvent;
