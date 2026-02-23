import mongoose, { Schema, model, models } from "mongoose";

const VehicleSchema = new Schema(
  {
    plate: { type: String, default: null },
    label: { type: String, default: null },
  },
  { _id: false }
);

const TripPlanSchema = new Schema(
  {
    driverUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    routeId: { type: Schema.Types.ObjectId, ref: "Route", required: true, index: true },
    plannedStartAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["planned", "assigned", "in_progress", "completed", "cancelled"],
      default: "planned",
      index: true,
    },
    title: { type: String, default: "" },
    notes: { type: String, default: "" },
    vehicle: { type: VehicleSchema, default: null },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", default: null, index: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

TripPlanSchema.index({ driverUserId: 1, plannedStartAt: -1 });
TripPlanSchema.index({ status: 1, plannedStartAt: 1 });

export type TripPlanDoc = mongoose.InferSchemaType<typeof TripPlanSchema>;

const TripPlan = models.TripPlan || model("TripPlan", TripPlanSchema);
export default TripPlan;

