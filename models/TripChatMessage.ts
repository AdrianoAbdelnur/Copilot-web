import mongoose, { Schema, model, models } from "mongoose";

export const tripChatStatuses = ["sent", "delivered", "spoken", "read"] as const;

const TripChatMessageSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", index: true, default: null },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    driverUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 140 },
    status: { type: String, enum: tripChatStatuses, default: "sent", index: true },
    deliveredAt: { type: Date, default: null },
    spokenAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TripChatMessageSchema.index({ tripId: 1, createdAt: -1 });
TripChatMessageSchema.index({ driverUserId: 1, createdAt: -1 });
TripChatMessageSchema.index({ companyId: 1, tripId: 1, createdAt: -1 });

export type TripChatMessageDoc = mongoose.InferSchemaType<typeof TripChatMessageSchema>;

const TripChatMessage = models.TripChatMessage || model("TripChatMessage", TripChatMessageSchema);
export default TripChatMessage;
