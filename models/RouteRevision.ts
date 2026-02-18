import mongoose, { Schema, model, models } from "mongoose";

const StepSchema = new Schema(
  {
    distance: { type: Schema.Types.Mixed, default: null },
    duration: { type: Schema.Types.Mixed, default: null },
    html_instructions: { type: String, default: "" },
    start_location: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    end_location: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    maneuver: { type: String, default: null },
    polyline: { type: String, default: null },
  },
  { _id: false }
);

const PointSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false }
);

const RouteRevisionSchema = new Schema(
  {
    routeId: { type: Schema.Types.ObjectId, ref: "Route", required: true, index: true },

    version: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now, index: true },

    stage: {
      type: String,
      enum: ["match", "clusters", "plan", "repair", "candidate", "final"],
      default: "match",
    },

    note: { type: String, default: "" },

    params: {
      corridorM: { type: Number, default: 25 },
      gapIdx: { type: Number, default: 8 },
    },

    base: {
      kind: { type: String, enum: ["google", "patched", "revision"], default: "google" },
      revisionId: { type: Schema.Types.ObjectId, default: null },
    },

    google: {
      source: { type: String, default: "directions_v1" },
      overviewPolyline: { type: String, default: null },
      steps: { type: [StepSchema], default: [] },
      densePath: { type: [PointSchema], default: [] },
    },

    matchReport: { type: Schema.Types.Mixed, default: null },
    clusters: { type: Schema.Types.Mixed, default: null },
    plan: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: false }
);

RouteRevisionSchema.index({ routeId: 1, version: 1 }, { unique: true });

export type RouteRevisionDoc = mongoose.InferSchemaType<typeof RouteRevisionSchema>;

export default models.RouteRevision || model("RouteRevision", RouteRevisionSchema);
