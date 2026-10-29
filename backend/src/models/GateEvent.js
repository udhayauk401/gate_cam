import mongoose from "mongoose";

const gateEventSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: "Request", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    deviceId: { type: String, required: true, maxlength: 80 },
    eventType: { type: String, enum: ["departure", "return", "denied"], required: true },
    verificationResult: { type: String, enum: ["session_authenticated", "not_performed", "failed"], required: true },
    accessDecision: { type: String, enum: ["granted", "denied"], required: true },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

gateEventSchema.index({ request: 1, eventType: 1 });
export default mongoose.model("GateEvent", gateEventSchema);
