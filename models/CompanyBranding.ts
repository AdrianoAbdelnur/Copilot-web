import mongoose, { Schema, models, model } from "mongoose";

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

const CompanyBrandingSchema = new Schema(
  {
    companyId: { type: String, required: true, trim: true, unique: true, index: true },
    logoUrl: { type: String, trim: true, default: "" },
    faviconUrl: { type: String, trim: true, default: "" },
    appName: { type: String, trim: true, default: "" },
    welcomeMessage: { type: String, trim: true, default: "" },
    themeMode: { type: String, enum: ["light", "dark", "auto"], default: "auto" },
    colors: {
      primary: {
        type: String,
        trim: true,
        default: "#0369A1",
        validate: {
          validator: (v: string) => HEX_COLOR.test(v),
          message: "primary must be hex color #RRGGBB",
        },
      },
      secondary: {
        type: String,
        trim: true,
        default: "#0F172A",
        validate: {
          validator: (v: string) => HEX_COLOR.test(v),
          message: "secondary must be hex color #RRGGBB",
        },
      },
      accent: {
        type: String,
        trim: true,
        default: "#14B8A6",
        validate: {
          validator: (v: string) => HEX_COLOR.test(v),
          message: "accent must be hex color #RRGGBB",
        },
      },
      background: {
        type: String,
        trim: true,
        default: "#F1F5F9",
        validate: {
          validator: (v: string) => HEX_COLOR.test(v),
          message: "background must be hex color #RRGGBB",
        },
      },
      text: {
        type: String,
        trim: true,
        default: "#0F172A",
        validate: {
          validator: (v: string) => HEX_COLOR.test(v),
          message: "text must be hex color #RRGGBB",
        },
      },
    },
  },
  { timestamps: true },
);

export type CompanyBrandingDoc = mongoose.InferSchemaType<typeof CompanyBrandingSchema>;

export default models.CompanyBranding || model("CompanyBranding", CompanyBrandingSchema);
