import mongoose, { Schema, models, model } from "mongoose";

const CompanySchema = new Schema(
  {
    name: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

export type CompanyDoc = mongoose.InferSchemaType<typeof CompanySchema>;

export default models.Company || model("Company", CompanySchema);
