import dns from "node:dns";
import mongoose from "mongoose";
import "../models/User.js";
import "../models/Request.js";
import "../models/Notification.js";
import "../models/GateEvent.js";
import "../models/Feedback.js";
import "../models/SupportTicket.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  console.log("Connected to MongoDB");
}
