import mongoose, { Schema, model, models } from "mongoose";

const GeoPointSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false }
);

const MatchSchema = new Schema(
  {
    index: { type: Number, default: null },
    t: { type: Number, default: null },
    distToPathM: { type: Number, default: null },
  },
  { _id: false }
);

const TripSampleSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    routeId: { type: Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    t: { type: Date, required: true, index: true },
    pos: { type: GeoPointSchema, required: true },
    speedKmh: { type: Number, default: null },
    heading: { type: Number, default: null },
    accuracyM: { type: Number, default: null },
    mm: { type: MatchSchema, default: null },
  },
  { timestamps: true }
);

TripSampleSchema.index({ tripId: 1, t: 1 });

export type TripSampleDoc = mongoose.InferSchemaType<typeof TripSampleSchema>;

const TripSample = models.TripSample || model("TripSample", TripSampleSchema);
export default TripSample;
