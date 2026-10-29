import express from "express";
import User from "../models/User.js";
import GateRequest from "../models/Request.js";
import GateEvent from "../models/GateEvent.js";

const router = express.Router();

const EARLY_MINUTES = 60;             // departure-ku ithana minutes munnadi varaikkum allow
const DEFAULT_DEVICE_ID = "laptop-gate-1";

// POST /api/face/verify   body: { userCode, deviceKey, deviceId? }
router.post("/verify", async (req, res) => {
  try {
    const { userCode, deviceKey, deviceId } = req.body || {};

    // 1. Device key check
    if (!process.env.DEVICE_KEY || deviceKey !== process.env.DEVICE_KEY) {
      return res.status(401).json({ allow: false, reason: "unauthorized device" });
    }

    if (!userCode) {
      return res.status(400).json({ allow: false, reason: "userCode required" });
    }

    const code = String(userCode).trim().toUpperCase();
    const device = deviceId || DEFAULT_DEVICE_ID;

    // 2. Student irukkaa nu check
    const user = await User.findOne({ userCode: code, role: "student", accountStatus: "active" });
    if (!user) {
      return res.json({ allow: false, reason: "roll no not registered", userCode: code });
    }

    // 3. Approved gate request thedunga (1 day grace for late return)
    const now = new Date();
    const request = await GateRequest.findOne({
      student: user._id,
      status: "Fully Approved",
      gatePassRequired: true,
      expectedReturn: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
    }).sort({ expectedDeparture: -1 });

    if (!request) {
      return res.json({
        allow: false,
        reason: "no valid gate pass",
        student: user.name,
        userCode: code
      });
    }

    // 4. Ithuvarai nadandha events paarkalam
    const granted = await GateEvent.find({
      request: request._id,
      accessDecision: "granted"
    }).sort({ timestamp: 1 });

    const departures = granted.filter(e => e.eventType === "departure").length;
    const returns = granted.filter(e => e.eventType === "return").length;

    let eventType = null;
    if (departures === 0) eventType = "departure";
    else if (returns === 0) eventType = "return";

    // 5. Decision
    let allow = false;
    let reason = "ok";

    if (eventType === null) {
      reason = "pass already used";
    } else if (
      eventType === "departure" &&
      now < new Date(request.expectedDeparture.getTime() - EARLY_MINUTES * 60 * 1000)
    ) {
      reason = "too early for departure";
    } else {
      allow = true;
    }

    // 6. Log (denied-um log aagum)
    await GateEvent.create({
      request: request._id,
      student: user._id,
      deviceId: device,
      eventType: allow ? eventType : "denied",
      verificationResult: "session_authenticated",
      accessDecision: allow ? "granted" : "denied",
      timestamp: now
    });

    return res.json({
      allow,
      reason,
      eventType: allow ? eventType : null,
      student: user.name,
      department: user.department,
      userCode: code
    });
  } catch (err) {
    console.error("face/verify error:", err);
    return res.status(500).json({ allow: false, reason: "server error" });
  }
});

export default router;