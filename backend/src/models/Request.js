import mongoose from "mongoose";

const approvalSchema = new mongoose.Schema(
  {
    approver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["mentor", "hod"], required: true },
    decision: { type: String, enum: ["approved", "rejected"], required: true },
    comments: { type: String, trim: true, maxlength: 1000, default: "" },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema(
  {
    requestId: { type: String, unique: true, required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    hod: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requestType: { type: String, enum: ["OD", "Gate Pass"], required: true },
    category: { type: String, required: true },
    gatePassRequired: { type: Boolean, default: false },
    destination: { type: String, required: true, trim: true, maxlength: 200 },
    reason: { type: String, required: true, trim: true, maxlength: 3000 },
    letterContent: { type: String, required: true, maxlength: 5000 },
    expectedDeparture: { type: Date, required: true },
    expectedReturn: { type: Date, required: true },
    supportingDocument: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "Pending Mentor Approval",
        "Pending HOD Approval",
        "Awaiting Mentor Confirmation",
        "Fully Approved",
        "Rejected by Mentor",
        "Rejected by HOD",
        "Cancelled",
        "Expired"
      ],
      default: "Pending Mentor Approval"
    },
    rejectionReason: { type: String, trim: true, default: "" },
    approvals: { type: [approvalSchema], default: [] }
  },
  { timestamps: true }
);

requestSchema.index({ student: 1, createdAt: -1 });
requestSchema.index({ mentor: 1, status: 1 });
requestSchema.index({ hod: 1, status: 1 });
export default mongoose.model("Request", requestSchema);
