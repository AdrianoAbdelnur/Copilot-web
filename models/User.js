const { model, Schema, models } = require("mongoose");

const LastKnownLocationSchema = new Schema(
    {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        heading: { type: Number, default: null },
        speedKmh: { type: Number, default: null },
        accuracy: { type: Number, default: null },
        recordedAt: { type: Date, default: null }
    },
    { _id: false }
);

const UserSchema = new Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true
        },
        lastName: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            index: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true,
            select: false
        },
        role: {
            type: String,
            default: "user"
        },
        isDeleted: {
            type: Boolean,
            default: false
        },
        validatedMail: {
            type: Boolean,
            default: false
        },
        expoPushToken: {
            type: String,
            default: null
        },
        authorizedTransport: {
            type: Boolean,
            default: false
        },
        lastKnownLocation: {
            type: LastKnownLocationSchema,
            default: undefined
        }
    },
    { timestamps: true }
);

module.exports = models.User || model("User", UserSchema);
