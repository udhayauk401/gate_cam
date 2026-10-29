import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "./config/database.js";
import authRoutes from "./routes/auth.js";
import requestRoutes from "./routes/requests.js";
import gateRoutes from "./routes/gate.js";
import faceGateRoutes from "./routes/faceGate.js";
import adminRoutes from "./routes/admin.js";
import { requireAuth } from "./middleware/auth.js";
import { requirePasswordChanged } from "./middleware/passwordChanged.js";
import { imageUpload, verifyUpload } from "./middleware/upload.js";
import User from "./models/User.js";
import Request from "./models/Request.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to at least 32 characters.");
}

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://127.0.0.1:5173");
}
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }), authRoutes);
app.use("/api/admin", rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 }), adminRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/gate", gateRoutes);
app.use("/api/face", faceGateRoutes);

function profileForResponse(user) {
  const { id, role, name, userCode, department, classCode, assignedClasses, phone, year, profilePhoto, mustChangePassword } = user;
  return {
    id,
    role,
    name,
    userCode,
    department,
    classCode: classCode || "",
    assignedClasses: assignedClasses || [],
    phone: phone || "",
    year: year || "",
    profilePhoto: profilePhoto || "",
    mustChangePassword
  };
}

app.get("/api/profile", requireAuth, requirePasswordChanged, (req, res) => {
  return res.json({ user: profileForResponse(req.user) });
});

app.patch("/api/profile", requireAuth, requirePasswordChanged, async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: "Name cannot be blank." });
      req.user.name = String(name).trim().slice(0, 100);
    }
    if (phone !== undefined) req.user.phone = String(phone).trim().slice(0, 30);
    await req.user.save();
    return res.json({ message: "Profile updated.", user: profileForResponse(req.user) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/profile/photo", requireAuth, requirePasswordChanged, imageUpload.single("photo"), verifyUpload, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a JPG, PNG, or WebP profile photo." });
    req.user.profilePhoto = req.file.filename;
    req.user.profilePhotoData = await fs.readFile(req.file.path);
    req.user.profilePhotoContentType = req.file.mimetype;
    await req.user.save();
    return res.json({ message: "Profile photo updated.", user: profileForResponse(req.user) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/files/:filename", requireAuth, requirePasswordChanged, async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);
    const ownedPhoto = req.user.profilePhoto === filename;
    const participants = [
      { student: req.user.id },
      { mentor: req.user.id },
      { hod: req.user.id }
    ];
    const [relatedDocument, photoOwner] = await Promise.all([
      Request.exists({ supportingDocument: filename, $or: participants }),
      User.findOne({ profilePhoto: filename }).select("_id +profilePhotoData +profilePhotoContentType")
    ]);
    let relatedStudentPhoto = false;
    if (photoOwner && (req.user.role === "mentor" || req.user.role === "hod")) {
      const requestRole = req.user.role === "mentor" ? { mentor: req.user.id } : { hod: req.user.id };
      relatedStudentPhoto = Boolean(await Request.exists({ student: photoOwner.id, ...requestRole }));
    }
    if (!ownedPhoto && !relatedDocument && !relatedStudentPhoto) {
      return res.status(404).json({ message: "File not found." });
    }
    if (photoOwner?.profilePhotoData && (ownedPhoto || relatedStudentPhoto)) {
      res.type(photoOwner.profilePhotoContentType || "application/octet-stream");
      return res.send(photoOwner.profilePhotoData);
    }
    return res.sendFile(filename, { root: path.resolve("uploads") });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", mode: process.env.DEMO_MODE === "true" ? "demo" : "standard" })
);

app.use((error, _req, res, _next) => {
  console.error(error);
  const isValidationError = error.name === "ValidationError" || error.name === "CastError";
  const status = error.code === 11000 ? 409 : error.name === "MulterError" || isValidationError ? 400 : error.status || 500;
  const details = isValidationError
    ? Object.values(error.errors || {}).map((item) => item.message).join(" ")
    : error.code === 11000 ? "That user code is already registered." : error.message;
  return res.status(status).json({
    message: status === 500 ? "An unexpected server error occurred." : details
  });
});

const port = Number(process.env.PORT || 4000);
export { app };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  connectDatabase()
    .then(() => app.listen(port, () => console.log(`Student Gateway API listening on ${port}`)))
    .catch((error) => {
      console.error("Could not start Student Gateway API:", error.message);
      process.exitCode = 1;
    });
}