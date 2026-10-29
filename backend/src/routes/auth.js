import { Router } from "express";
import fs from "node:fs/promises";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { imageUpload, verifyUpload } from "../middleware/upload.js";

const router = Router();
const departments = new Set(["IT", "ECE", "CSE", "AIDS", "AIML", "MECH", "CIVIL"]);
const classCodePattern = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

function safeUser(user) {
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
    mustChangePassword: user.mustChangePassword
  };
}

router.post("/register", imageUpload.single("photo"), verifyUpload, async (req, res, next) => {
  try {
    const { role, name, userCode, department, classCode, assignedClasses, phone, year, password } = req.body;
    const normalizedRole = String(role || "").toLowerCase();
    const code = String(userCode || "").trim().toUpperCase();
    const dept = String(department || "").trim().toUpperCase();
    const normalizedName = String(name || "").trim();
    const newPassword = String(password || "");
    if (!["student", "mentor", "hod"].includes(normalizedRole) || !normalizedName || normalizedName.length > 100 ||
        !/^[A-Z0-9][A-Z0-9-]{1,49}$/.test(code) || !departments.has(dept)) {
      return res.status(400).json({ message: "Enter a valid role, name, user code, and department." });
    }
    if (newPassword.length < 10 || newPassword.length > 128) {
      return res.status(400).json({ message: "Choose a password between 10 and 128 characters." });
    }
    if (!/^\+?[0-9\s()-]{7,20}$/.test(String(phone || ""))) {
      return res.status(400).json({ message: "Enter a valid phone number." });
    }
    if (await User.exists({ userCode: code })) {
      return res.status(409).json({ message: "That user code is already registered." });
    }

    const normalizedClassCode = String(classCode || "").trim().toUpperCase();
    const classes = normalizedRole === "mentor"
      ? [...new Set(String(assignedClasses || classCode || "").split(/[,\n]/).map((value) => value.trim().toUpperCase()).filter(Boolean))]
      : [];
    if (normalizedRole === "student" && (!classCodePattern.test(normalizedClassCode) || !["I", "II", "III", "IV"].includes(year))) {
      return res.status(400).json({ message: "Students must provide their class code and year." });
    }
    if (normalizedRole === "mentor" && (!classes.length || classes.some((value) => !classCodePattern.test(value)))) {
      return res.status(400).json({ message: "Enter one or more valid assigned class codes, separated by commas." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await User.create({
      role: normalizedRole,
      name: normalizedName,
      userCode: code,
      passwordHash,
      department: dept,
      classCode: normalizedRole === "mentor" ? classes[0] : normalizedRole === "student" ? normalizedClassCode : "",
      assignedClasses: classes,
      phone: String(phone).trim(),
      year: normalizedRole === "student" ? year : undefined,
      profilePhoto: req.file?.filename || "",
      profilePhotoData: req.file ? await fs.readFile(req.file.path) : undefined,
      profilePhotoContentType: req.file?.mimetype,
      mustChangePassword: false,
      accountStatus: normalizedRole === "student" ? "active" : "pending"
    });
    return res.status(201).json({
      message: normalizedRole === "student"
        ? "Registration complete. You can now sign in."
        : "Registration submitted. Your account is pending administrator approval."
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const code = String(req.body.userCode || "").trim().toUpperCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ userCode: code }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "User code or password is incorrect." });
    }
    if (user.accountStatus === "pending") {
      return res.status(403).json({ message: "Your account is pending administrator approval." });
    }
    if (user.accountStatus === "rejected") {
      return res.status(403).json({ message: "Your account was rejected. Contact your college administrator." });
    }
    if (user.accountStatus !== "active") {
      return res.status(403).json({ message: "This account is unavailable." });
    }
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.cookie("gateway_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000
    });
    return res.json({ user: safeUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("gateway_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res.json({ message: "Signed out." });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: safeUser(req.user) }));

router.post("/password", requireAuth, async (req, res, next) => {
  try {
    const password = String(req.body.password || "");
    if (password.length < 10) return res.status(400).json({ message: "Use a password with at least 10 characters." });
    const user = await User.findById(req.user.id).select("+passwordHash");
    if (!user.mustChangePassword && !(await bcrypt.compare(String(req.body.currentPassword || ""), user.passwordHash))) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }
    if (await bcrypt.compare(password, user.passwordHash)) {
      return res.status(400).json({ message: "Choose a password different from your current password." });
    }
    user.passwordHash = await bcrypt.hash(password, 12);
    user.mustChangePassword = false;
    await user.save();
    return res.json({ user: safeUser(user) });
  } catch (error) {
    return next(error);
  }
});

export default router;
