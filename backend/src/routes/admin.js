import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";

const router = Router();

function requireApprovalToken(req, res, next) {
  const configuredToken = process.env.ADMIN_APPROVAL_TOKEN;
  if (!configuredToken || configuredToken.length < 32) {
    return res.status(503).json({ message: "Administrator approval is not configured on this server." });
  }
  const suppliedToken = req.get("x-admin-approval-token") || "";
  const expected = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ message: "Administrator authorization is required." });
  }
  return next();
}

function registrationSummary(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    userCode: user.userCode,
    department: user.department,
    classCode: user.classCode || "",
    assignedClasses: user.assignedClasses || [],
    phone: user.phone || "",
    year: user.year || "",
    profilePhoto: user.profilePhoto || "",
    accountStatus: user.accountStatus,
    createdAt: user.createdAt
  };
}

router.get("/registrations", requireApprovalToken, async (_req, res, next) => {
  try {
    const pendingUsers = await User.find({ role: { $in: ["mentor", "hod"] }, accountStatus: "pending" })
      .sort({ createdAt: 1 });
    return res.json({ registrations: pendingUsers.map(registrationSummary) });
  } catch (error) {
    return next(error);
  }
});

router.post("/registrations/:userId/review", requireApprovalToken, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const decision = String(req.body.decision || "").toLowerCase();
    const reviewNote = String(req.body.reviewNote || "").trim();
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid registration ID." });
    }
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "Choose approved or rejected." });
    }
    if (decision === "rejected" && !reviewNote) {
      return res.status(400).json({ message: "Provide a reason when rejecting a registration." });
    }
    const user = await User.findOneAndUpdate(
      { _id: userId, role: { $in: ["mentor", "hod"] }, accountStatus: "pending" },
      {
        $set: {
          accountStatus: decision === "approved" ? "active" : "rejected",
          reviewedAt: new Date(),
          reviewNote: reviewNote.slice(0, 1000)
        }
      },
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).json({ message: "Pending registration not found; it may already have been reviewed." });
    }
    return res.json({
      message: decision === "approved" ? "Registration approved." : "Registration rejected.",
      registration: registrationSummary(user)
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
