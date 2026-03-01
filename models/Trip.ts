import mongoose, { Schema, model, models } from "mongoose";

const GeoPointSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false }
);

const DeviceSchema = new Schema(
  {
    platform: { type: String, default: null },
    appVersion: { type: String, default: null },
    deviceId: { type: String, default: null },
  },
  { _id: false }
);

const TotalsSchema = new Schema(
  {
    distanceM: { type: Number, default: 0 },
    durationS: { type: Number, default: 0 },
    maxSpeedKmh: { type: Number, default: 0 },
    speedOverCount: { type: Number, default: 0 },
    speedOverDurationS: { type: Number, default: 0 },
    offrouteCount: { type: Number, default: 0 },
    offrouteDurationS: { type: Number, default: 0 },
    poiHits: { type: Number, default: 0 },
    segmentEntries: { type: Number, default: 0 },
    samplesCount: { type: Number, default: 0 },
    eventsCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const LiveSnapshotSchema = new Schema(
  {
    t: { type: Date, default: null },
    pos: { type: GeoPointSchema, default: null },
    speedKmh: { type: Number, default: null },
    heading: { type: Number, default: null },
    accuracyM: { type: Number, default: null },
  },
  { _id: false }
);

const TripSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    routeId: { type: Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    status: {
      type: String,
      enum: ["active", "paused", "finished", "aborted"],
      default: "active",
      index: true,
    },
    startedAt: { type: Date, required: true, index: true },
    endedAt: { type: Date, default: null },
    startPos: { type: GeoPointSchema, required: true },
    endPos: { type: GeoPointSchema, default: null },
    live: { type: LiveSnapshotSchema, default: () => ({}) },
    device: { type: DeviceSchema, default: null },
    totals: { type: TotalsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

TripSchema.index({ userId: 1, startedAt: -1 });
TripSchema.index({ routeId: 1, startedAt: -1 });

export type TripDoc = mongoose.InferSchemaType<typeof TripSchema>;

const Trip = models.Trip || model("Trip", TripSchema);
export default Trip;
