import { Router } from "express";
import Request from "../models/Request.js";
import GateEvent from "../models/GateEvent.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/passwordChanged.js";
import { notify } from "../services/notifications.js";

const router = Router();

async function evaluatePass(request, deviceId, requestedEventType) {
  const now = new Date();
  if (request.status === "Fully Approved" && now > request.expectedReturn) {
    request.status = "Expired";
    await request.save();
    await notify([request.student.id || request.student], `${request.requestId} has expired.`, request.requestId);
  }
  const history = await GateEvent.find({ request: request.id, accessDecision: "granted" }).sort({ timestamp: -1 });
  const last = history[0];
  if (last && now - last.timestamp < 30000) {
    return { status: 409, result: { decision: "denied", message: "Duplicate scan ignored. Please wait before scanning again." } };
  }
  const eligible = request.requestType === "Gate Pass" &&
    request.gatePassRequired &&
    request.status === "Fully Approved" &&
    now >= request.expectedDeparture &&
    now <= request.expectedReturn;
  if (!eligible) {
    await GateEvent.create({
      request: request.id,
      student: request.student.id,
      deviceId: String(deviceId).slice(0, 80),
      eventType: "denied",
      verificationResult: "session_authenticated",
      accessDecision: "denied"
    });
    return { status: 403, result: { decision: "denied", display: "ACCESS DENIED", message: "No currently valid, fully approved Gate Pass." } };
  }
  if (!["departure", "return"].includes(requestedEventType)) {
    return { status: 400, result: { decision: "denied", message: "Choose a departure or return scan." } };
  }
  if ((requestedEventType === "departure" && history.some((event) => event.eventType === "departure")) ||
      (requestedEventType === "return" && (!history.some((event) => event.eventType === "departure") ||
        history.some((event) => event.eventType === "return")))) {
    return { status: 409, result: { decision: "denied", message: "That departure or return has already been recorded, or the required departure is missing." } };
  }
  await GateEvent.create({
    request: request.id,
    student: request.student.id,
    deviceId: String(deviceId).slice(0, 80),
    eventType: requestedEventType,
    verificationResult: "session_authenticated",
    accessDecision: "granted"
  });
  return {
    status: 200,
    result: {
      decision: "granted",
      eventType: requestedEventType,
      display: "ACCESS GRANTED",
      message: `Demo pass verified. ${requestedEventType === "departure" ? "Departure" : "Return"} recorded.`
    }
  };
}

router.post("/scan", async (req, res, next) => {
  try {
    const expectedToken = process.env.GATE_DEVICE_TOKEN;
    if (!expectedToken || req.get("x-gate-token") !== expectedToken) {
      return res.status(401).json({ decision: "denied", message: "Gate device authentication failed." });
    }
    const { requestId, deviceId } = req.body;
    if (!requestId || !deviceId) return res.status(400).json({ decision: "denied", message: "Request ID and device ID are required." });
    return res.status(503).json({
      decision: "denied",
      message: "Identity verification is not integrated. No real gate access is authorized."
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/demo-scan", requireAuth, requirePasswordChanged, async (req, res, next) => {
  try {
    if (process.env.DEMO_MODE !== "true") {
      return res.status(404).json({ message: "The simulated gate is available only when DEMO_MODE=true." });
    }
    if (req.user.role !== "student") return res.status(403).json({ message: "Only the pass holder can run a demo scan." });
    const request = await Request.findOne({ requestId: req.body.requestId, student: req.user.id }).populate("student", "name userCode");
    if (!request) return res.status(404).json({ message: "Your request was not found." });
    const outcome = await evaluatePass(request, "SIMULATED-DEMO", req.body.eventType);
    return res.status(outcome.status).json(outcome.result);
  } catch (error) {
    return next(error);
  }
});

export default router;
