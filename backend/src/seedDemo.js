import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDatabase } from "./config/database.js";
import User from "./models/User.js";
import Request from "./models/Request.js";

if (process.env.DEMO_MODE !== "true") {
  throw new Error("Refusing to seed demo accounts unless DEMO_MODE=true.");
}

await connectDatabase();
const passwordHash = await bcrypt.hash("DemoPass!2026", 12);
const demoUsers = [
  { role: "student", name: "Arun Kumar", userCode: "732925ECR001", department: "ECE", classCode: "25EC3C", phone: "9000000001", year: "II" },
  { role: "mentor", name: "Meena Ravi", userCode: "MTR-ECE", department: "ECE", classCode: "25EC3C", assignedClasses: ["25EC3C"], phone: "9000000002" },
  { role: "hod", name: "Dr. Kavitha", userCode: "HOD-ECE", department: "ECE", phone: "9000000003" }
];

const saved = {};
for (const details of demoUsers) {
  saved[details.role] = await User.findOneAndUpdate(
    { userCode: details.userCode },
    { ...details, passwordHash, mustChangePassword: false, accountStatus: "active" },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

const baseRequest = {
  student: saved.student.id,
  mentor: saved.mentor.id,
  hod: saved.hod.id,
  requestType: "OD",
  category: "Presentation",
  gatePassRequired: false,
  destination: "VCET Seminar Hall",
  reason: "Demo request for the department technical presentation.",
  letterContent: "DEMO LETTER — Arun Kumar requests OD permission to attend a department presentation at VCET Seminar Hall.",
  expectedDeparture: new Date(Date.now() + 60 * 60 * 1000),
  expectedReturn: new Date(Date.now() + 4 * 60 * 60 * 1000),
  status: "Pending Mentor Approval"
};
await Request.findOneAndUpdate(
  { requestId: "SG-DEMO-PENDING" },
  { ...baseRequest, requestType: "OD" },
  { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
);

const approvedStart = new Date(Date.now() - 60 * 1000);
const approvedEnd = new Date(Date.now() + 60 * 60 * 1000);
await Request.findOneAndUpdate(
  { requestId: "SG-DEMO-GATEPASS" },
  {
    ...baseRequest,
    requestId: "SG-DEMO-GATEPASS",
    requestType: "Gate Pass",
    category: "Project Expo",
    gatePassRequired: true,
    destination: "VCET Innovation Centre",
    reason: "Demo-only pass for gate simulation.",
    letterContent: "DEMO LETTER — Arun Kumar requests a Gate Pass to attend the Project Expo at the VCET Innovation Centre.",
    expectedDeparture: approvedStart,
    expectedReturn: approvedEnd,
    status: "Fully Approved",
    approvals: [
      { approver: saved.mentor.id, role: "mentor", decision: "approved", comments: "Demo mentor approval." },
      { approver: saved.hod.id, role: "hod", decision: "approved", comments: "Demo HOD approval." },
      { approver: saved.mentor.id, role: "mentor", decision: "approved", comments: "Demo final confirmation." }
    ]
  },
  { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
);

console.log("Demo data ready. These accounts must never be used outside a local demo:");
console.log("Student: 732925ECR001 | Mentor: MTR-ECE | HOD: HOD-ECE");
console.log("Password for all demo accounts: DemoPass!2026");
process.exit(0);
