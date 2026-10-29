import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["student", "mentor", "hod"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    userCode: { type: String, required: true, uppercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    mustChangePassword: { type: Boolean, default: true },
    department: { type: String, required: true, uppercase: true, trim: true },
    classCode: { type: String, uppercase: true, trim: true },
    assignedClasses: { type: [String], default: [] },
    phone: { type: String, trim: true },
    year: { type: String, enum: ["I", "II", "III", "IV"] },
    profilePhoto: { type: String, default: "" },
    profilePhotoData: { type: Buffer, select: false },
    profilePhotoContentType: { type: String, select: false },
    accountStatus: { type: String, enum: ["active", "pending", "rejected"], default: "active" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true, maxlength: 1000 }
  },
  { timestamps: true }
);

userSchema.index({ role: 1, department: 1, classCode: 1 });
export default mongoose.model("User", userSchema);
