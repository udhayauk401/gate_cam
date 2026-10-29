import { Router } from "express";
import crypto from "node:crypto";
import Request from "../models/Request.js";
import User from "../models/User.js";
import GateEvent from "../models/GateEvent.js";
import Notification from "../models/Notification.js";
import Feedback from "../models/Feedback.js";
import SupportTicket from "../models/SupportTicket.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/passwordChanged.js";
import { notify } from "../services/notifications.js";
import { upload, verifyUpload } from "../middleware/upload.js";

const router = Router();
router.use(requireAuth, requirePasswordChanged);
const categories = new Set(["Hackathon", "Presentation", "Sports", "Project Expo", "Health Issue", "Other Personal Reason"]);
const requestFields = "requestId student mentor hod requestType category gatePassRequired destination reason letterContent expectedDeparture expectedReturn supportingDocument status rejectionReason approvals createdAt updatedAt";

function canView(user, request) {
  if (user.role === "student") return String(request.student?._id || request.student) === String(user.id);
  if (user.role === "mentor") return String(request.mentor?._id || request.mentor) === String(user.id);
  return user.role === "hod" && String(request.hod?._id || request.hod) === String(user.id);
}

function makeLetter(student, data) {
  return `From:\n${student.name}\n${student.userCode}\nVelalar College of Engineering and Technology\nErode, Tamil Nadu\n\nTo:\nThe Head of the Department\n${student.department}\nVelalar College of Engineering and Technology\nErode, Tamil Nadu\n\nSubject: ${data.category}\n\nRespected Sir/Madam,\n\nI, ${student.name} (${student.userCode}), request ${data.requestType} permission for ${data.category}. Destination / venue: ${data.destination}. Requested from ${new Date(data.expectedDeparture).toLocaleString("en-IN")} to ${new Date(data.expectedReturn).toLocaleString("en-IN")}.\n\n${data.reason}\n\nThank you.\n\nYours faithfully,\n${student.name}\n${student.userCode}`;
}

router.post("/", allowRoles("student"), upload.single("document"), verifyUpload, async (req, res, next) => {
  try {
    const { requestType, category, destination, reason, expectedDeparture, expectedReturn } = req.body;
    const departure = new Date(expectedDeparture);
    const returned = new Date(expectedReturn);
    if (!["OD", "Gate Pass"].includes(requestType) || !categories.has(category) ||
        !destination?.trim() || !reason?.trim() || Number.isNaN(+departure) ||
        Number.isNaN(+returned) || returned <= departure) {
      return res.status(400).json({ message: "Complete all request fields and choose a return time after departure." });
    }
    const mentor = await User.findOne({
      role: "mentor",
      department: req.user.department,
      accountStatus: "active",
      $or: [
        { classCode: req.user.classCode },
        { assignedClasses: req.user.classCode }
      ]
    });
    const hod = await User.findOne({
      role: "hod",
      department: req.user.department,
      accountStatus: "active"
    });
    if (!mentor || !hod) {
      return res.status(409).json({ message: "Your class mentor or department HOD is not configured. Contact the administrator." });
    }
    const data = { requestType, category, destination: destination.trim(), reason: reason.trim(), expectedDeparture, expectedReturn };
    const request = await Request.create({
      requestId: `SG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
      student: req.user.id,
      mentor: mentor.id,
      hod: hod.id,
      requestType,
      category,
      gatePassRequired: requestType === "Gate Pass" && req.body.gatePassRequired === "true",
      destination: destination.trim(),
      reason: reason.trim(),
      letterContent: String(req.body.letterContent || makeLetter(req.user, data)).slice(0, 5000),
      expectedDeparture: departure,
      expectedReturn: returned,
      supportingDocument: req.file?.filename || ""
    });
    await notify([mentor.id], `${req.user.name} submitted a ${requestType} request.`, request.requestId);
    return res.status(201).json({ request });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    let filter = {};
    if (req.user.role === "student") filter.student = req.user.id;
    if (req.user.role === "mentor") filter.mentor = req.user.id;
    if (req.user.role === "hod") filter.hod = req.user.id;
    const requests = await Request.find(filter).select(requestFields)
      .populate("student", "name userCode department classCode year profilePhoto")
      .populate("mentor", "name userCode")
      .populate("hod", "name userCode department")
      .populate("approvals.approver", "name userCode role")
      .sort({ createdAt: -1 }).limit(200);
    const events = await GateEvent.find({ request: { $in: requests.map((request) => request.id) } })
      .select("request eventType verificationResult accessDecision deviceId timestamp")
      .sort({ timestamp: 1 });
    const eventsByRequest = new Map();
    for (const event of events) {
      const key = String(event.request);
      eventsByRequest.set(key, [...(eventsByRequest.get(key) || []), event]);
    }
    return res.json({
      requests: requests.map((request) => ({
        ...request.toObject(),
        gateEvents: eventsByRequest.get(request.id) || []
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:requestId/action", allowRoles("mentor", "hod"), async (req, res, next) => {
  try {
    const request = await Request.findOne({ requestId: req.params.requestId });
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (!canView(req.user, request)) return res.status(403).json({ message: "This request is outside your assigned students or department." });
    const { decision, comments = "", rejectionReason = "" } = req.body;
    if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ message: "Choose approve or reject." });
    if (decision === "rejected" && !String(rejectionReason).trim()) {
      return res.status(400).json({ message: "A rejection reason is required." });
    }
    const status = request.status;
    let nextStatus;
    if (req.user.role === "mentor" && status === "Pending Mentor Approval") {
      nextStatus = decision === "approved" ? "Pending HOD Approval" : "Rejected by Mentor";
    } else if (req.user.role === "hod" && status === "Pending HOD Approval") {
      nextStatus = decision === "approved" ? "Awaiting Mentor Confirmation" : "Rejected by HOD";
    } else if (req.user.role === "mentor" && status === "Awaiting Mentor Confirmation") {
      nextStatus = decision === "approved" ? "Fully Approved" : "Rejected by Mentor";
    } else {
      return res.status(409).json({ message: "This request is not awaiting an action from your role." });
    }
    request.approvals.push({
      approver: req.user.id,
      role: req.user.role,
      decision,
      comments: String(comments).slice(0, 1000)
    });
    request.status = nextStatus;
    request.rejectionReason = decision === "rejected" ? String(rejectionReason).trim().slice(0, 1000) : "";
    await request.save();
    const recipients = [request.student, request.mentor, request.hod];
    const message = decision === "rejected"
      ? `${request.requestId} was rejected by the ${req.user.role.toUpperCase()}: ${request.rejectionReason}`
      : `${request.requestId} status updated to ${nextStatus}.`;
    await notify(recipients, message, request.requestId);
    return res.json({ request });
  } catch (error) {
    return next(error);
  }
});

router.post("/feedback", allowRoles("student"), async (req, res, next) => {
  try {
    const { category, rating, message } = req.body;
    if (!category || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 || !message?.trim()) {
      return res.status(400).json({ message: "Choose a category, rating from 1 to 5, and enter a message." });
    }
    await Feedback.create({ user: req.user.id, category, rating: Number(rating), message: message.trim() });
    return res.status(201).json({ message: "Thank you. Your feedback has been submitted." });
  } catch (error) {
    return next(error);
  }
});

router.post("/support", async (req, res, next) => {
  try {
    const subject = String(req.body.subject || "").trim();
    const message = String(req.body.message || "").trim();
    if (!subject || !message) return res.status(400).json({ message: "Enter a subject and describe your support request." });
    await SupportTicket.create({ user: req.user.id, subject, message });
    return res.status(201).json({ message: "Your support request has been sent to the college support team." });
  } catch (error) {
    return next(error);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ user: req.user.id, read: false })
    ]);
    return res.json({ notifications, unreadCount });
  } catch (error) {
    return next(error);
  }
});

router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found." });
    return res.json({ notification });
  } catch (error) {
    return next(error);
  }
});

router.get("/:requestId", async (req, res, next) => {
  try {
    const request = await Request.findOne({ requestId: req.params.requestId })
      .select(requestFields)
      .populate("student", "name userCode department classCode year profilePhoto")
      .populate("mentor", "name userCode")
      .populate("hod", "name userCode department")
      .populate("approvals.approver", "name userCode role");
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (!canView(req.user, request)) return res.status(403).json({ message: "You cannot view this request." });
    const events = await GateEvent.find({ request: request.id }).sort({ timestamp: 1 });
    return res.json({ request, events });
  } catch (error) {
    return next(error);
  }
});

export default router;
