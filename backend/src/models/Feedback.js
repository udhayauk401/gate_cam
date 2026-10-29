import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, required: true, maxlength: 60 },
    rating: { type: Number, min: 1, max: 5, required: true },
    message: { type: String, required: true, maxlength: 2000 }
  },
  { timestamps: true }
);

export default mongoose.model("Feedback", feedbackSchema);
