import mongoose from "mongoose";

const supportTicketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open" }
  },
  { timestamps: true }
);

export default mongoose.model("SupportTicket", supportTicketSchema);
