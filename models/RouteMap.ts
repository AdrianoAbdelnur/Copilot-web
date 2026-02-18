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

const RouteSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    kml: { type: String, default: null },

    policyPack: { type: Schema.Types.Mixed, default: null },

    meta: {
      routePoints: { type: Number, default: 0 },
      zones: { type: Number, default: 0 },
      pois: { type: Number, default: 0 },
      anchorsCount: { type: Number, default: 0 },
      corridorM: { type: Number, default: 25 },
    },

nav: {
  status: {
    type: String,
    enum: ["none", "ready", "needs_review", "failed"],
    default: "none",
  },
  compiledAt: { type: Date, default: null },

  mode: {
    type: String,
    enum: ["google_steps", "custom_steps"],
    default: "google_steps",
  },

  validate: {
    validatedAt: { type: Date, default: null },
    matchPct: { type: Number, default: 0 },
    outCount: { type: Number, default: 0 },
    pass: { type: Boolean, default: false },
    promoted: { type: Boolean, default: false },
  },
},

   google: {
      source: { type: String, default: "directions_v1" },
      fetchedAt: { type: Date, default: null },

      overviewPolyline: { type: String, default: null },
      steps: { type: [StepSchema], default: [] },
      densePath: { type: [PointSchema], default: [] },

      totals: {
        distanceM: { type: Number, default: 0 },
        durationS: { type: Number, default: 0 },
      },
  },
  },
  { timestamps: true }
);

export type RouteDoc = mongoose.InferSchemaType<typeof RouteSchema>;

export default models.Route || model("Route", RouteSchema);
