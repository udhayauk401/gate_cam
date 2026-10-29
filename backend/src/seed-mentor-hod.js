import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database.js";
import User from "./models/User.js";

if (process.env.DEMO_MODE !== "true") {
  throw new Error("Refusing to seed demo mentor/HOD accounts unless DEMO_MODE=true.");
}

const demoAccounts = [
  {
    role: "mentor",
    name: "Demo Mentor",
    userCode: "MENTOR001",
    department: "ECE",
    classCode: "25EC3C",
    assignedClasses: ["25EC3C"],
    phone: "9000000001",
    dateOfBirth: "01/01/2000"
  },
  {
    role: "hod",
    name: "Demo HOD",
    userCode: "HOD001",
    department: "ECE",
    phone: "9000000002",
    dateOfBirth: "02/02/1975"
  }
];

async function seedAccounts() {
  try {
    await connectDatabase();

    for (const { dateOfBirth, ...account } of demoAccounts) {
      const existingUser = await User.findOne({ userCode: account.userCode });
      if (existingUser) {
        console.log(`${account.userCode} already exists; skipped.`);
        continue;
      }

      const passwordHash = await bcrypt.hash(dateOfBirth, 12);
      await User.create({
        ...account,
        passwordHash,
        profilePhoto: "",
        mustChangePassword: true,
        accountStatus: "active"
      });
      console.log(`Created demo ${account.role}: ${account.userCode}`);
    }

    console.log("Demo Mentor/HOD seed completed. Change both temporary passwords after first sign-in.");
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

await seedAccounts();
