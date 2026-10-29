import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { after, before, describe, it } from "node:test";

const testUri = process.env.TEST_MONGODB_URI;
if (!testUri) {
  throw new Error("Set TEST_MONGODB_URI to a dedicated MongoDB test database before running API tests.");
}

const testDatabase = decodeURIComponent(new URL(testUri).pathname.slice(1));
if (!/_test$/i.test(testDatabase)) {
  throw new Error("API tests only run against a MongoDB database whose name ends in '_test'.");
}

process.env.MONGODB_URI = testUri;
process.env.JWT_SECRET = "student-gateway-api-tests-only-secret-2026";
process.env.NODE_ENV = "test";
process.env.DEMO_MODE = "true";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";
process.env.ADMIN_APPROVAL_TOKEN = "student-gateway-tests-admin-token-2026";

const { default: mongoose } = await import("mongoose");
const { default: User } = await import("../src/models/User.js");
const { default: Request } = await import("../src/models/Request.js");
const { default: Notification } = await import("../src/models/Notification.js");
const { default: GateEvent } = await import("../src/models/GateEvent.js");
const { connectDatabase } = await import("../src/config/database.js");
const { app } = await import("../src/server.js");

const suffix = `${process.pid}${Date.now()}`.slice(-14);
const codes = {
  student: `TEST-STU-${suffix}`,
  mentor: `TEST-MTR-${suffix}`,
  hod: `TEST-HOD-${suffix}`,
  outsider: `TEST-OUT-${suffix}`,
  temporary: `TEST-TMP-${suffix}`,
  registeredStudent: `REG-STU-${suffix}`,
  registeredMentor: `REG-MTR-${suffix}`,
  registeredHod: `REG-HOD-${suffix}`,
  rejectedMentor: `REG-REJ-${suffix}`,
  secondStudent: `REG-STU2-${suffix}`
};
const requestIds = {
  approval: `SG-TEST-APPROVAL-${suffix}`,
  rejection: `SG-TEST-REJECTION-${suffix}`
};
const createdRequestIds = [];
const password = "TestPass!2026";

let server;
let baseUrl;

async function createRequest(requestId, student, mentor, hod) {
  return Request.create({
    requestId,
    student,
    mentor,
    hod,
    requestType: "OD",
    category: "Presentation",
    destination: "VCET Seminar Hall",
    reason: "Integration test request",
    letterContent: "Integration test permission letter",
    expectedDeparture: new Date(Date.now() + 60 * 60 * 1000),
    expectedReturn: new Date(Date.now() + 3 * 60 * 60 * 1000)
  });
}

async function api(path, { cookie, adminToken, method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (adminToken) headers["x-admin-approval-token"] = adminToken;
  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  return { response, payload };
}

async function signIn(userCode) {
  const { response, payload } = await api("/auth/login", {
    method: "POST",
    body: { userCode, password }
  });
  assert.equal(response.status, 200, payload.message);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("gateway_session="), "login should set the session cookie");
  return { cookie, user: payload.user };
}

describe("Student Gateway API integration", () => {
  before(async () => {
    await connectDatabase();
    const passwordHash = await bcrypt.hash(password, 4);
    const [student, mentor, hod, outsider, temporary] = await User.create([
      {
        role: "student",
        name: "API Test Student",
        userCode: codes.student,
        passwordHash,
        mustChangePassword: false,
        department: "ECE",
        classCode: "TEST-CLASS",
        year: "II"
      },
      {
        role: "mentor",
        name: "API Test Mentor",
        userCode: codes.mentor,
        passwordHash,
        mustChangePassword: false,
        department: "ECE",
        classCode: "TEST-CLASS",
        assignedClasses: ["TEST-CLASS"]
      },
      {
        role: "hod",
        name: "API Test HOD",
        userCode: codes.hod,
        passwordHash,
        mustChangePassword: false,
        department: "ECE"
      },
      {
        role: "mentor",
        name: "Unauthorised API Test Mentor",
        userCode: codes.outsider,
        passwordHash,
        mustChangePassword: false,
        department: "CSE",
        classCode: "OTHER-CLASS",
        assignedClasses: ["OTHER-CLASS"]
      },
      {
        role: "student",
        name: "Temporary Password API Test",
        userCode: codes.temporary,
        passwordHash,
        mustChangePassword: true,
        department: "ECE",
        classCode: "TEST-CLASS",
        year: "II"
      }
    ]);
    await Promise.all([
      createRequest(requestIds.approval, student.id, mentor.id, hod.id),
      createRequest(requestIds.rejection, student.id, mentor.id, hod.id)
    ]);
    server = app.listen(0);
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (mongoose.connection.readyState === 1) {
      const allRequestIds = [...Object.values(requestIds), ...createdRequestIds];
      const fixtureRequests = await Request.find({ requestId: { $in: allRequestIds } }).select("_id");
      const fixtureUsers = await User.find({ userCode: { $in: Object.values(codes) } }).select("profilePhoto");
      await Promise.all([
        Notification.deleteMany({ requestId: { $in: allRequestIds } }),
        GateEvent.deleteMany({ request: { $in: fixtureRequests.map((request) => request.id) } }),
        Request.deleteMany({ requestId: { $in: allRequestIds } }),
        User.deleteMany({ userCode: { $in: Object.values(codes) } }),
        ...fixtureUsers
          .filter((user) => user.profilePhoto)
          .map((user) => fs.rm(path.resolve("uploads", user.profilePhoto), { force: true }))
      ]);
    }
    await mongoose.disconnect();
  });

  it("requires authentication and scopes requests to their assigned users", async () => {
    const unauthenticated = await api("/requests");
    assert.equal(unauthenticated.response.status, 401);

    const student = await signIn(codes.student);
    assert.equal(student.user.role, "student");
    assert.equal("passwordHash" in student.user, false);

    const ownRequests = await api("/requests", { cookie: student.cookie });
    assert.equal(ownRequests.response.status, 200);
    assert.deepEqual(
      ownRequests.payload.requests.map((request) => request.requestId).sort(),
      Object.values(requestIds).sort()
    );

    const outsider = await signIn(codes.outsider);
    const noAssignedRequests = await api("/requests", { cookie: outsider.cookie });
    assert.equal(noAssignedRequests.response.status, 200);
    assert.equal(noAssignedRequests.payload.requests.length, 0);

    const forbiddenAction = await api(`/requests/${requestIds.approval}/action`, {
      cookie: outsider.cookie,
      method: "POST",
      body: { decision: "approved" }
    });
    assert.equal(forbiddenAction.response.status, 403);
  });

  it("blocks protected data until a temporary password is changed", async () => {
    const temporary = await signIn(codes.temporary);
    const blockedRequests = await api("/requests", { cookie: temporary.cookie });
    assert.equal(blockedRequests.response.status, 403);
    assert.match(blockedRequests.payload.message, /change your temporary password/i);

    const tooShort = await api("/auth/password", {
      cookie: temporary.cookie,
      method: "POST",
      body: { password: "short" }
    });
    assert.equal(tooShort.response.status, 400);

    const changed = await api("/auth/password", {
      cookie: temporary.cookie,
      method: "POST",
      body: { password: "NewPassword!2026" }
    });
    assert.equal(changed.response.status, 200);
    assert.equal(changed.payload.user.mustChangePassword, false);

    const nowAllowed = await api("/requests", { cookie: temporary.cookie });
    assert.equal(nowAllowed.response.status, 200);
  });

  it("persists registrations, gates privileged roles, and supports administrator review", async () => {
    const usersCollection = await mongoose.connection.db.listCollections({ name: "users" }).toArray();
    assert.equal(usersCollection.length, 1, "database initialization should create the users collection");
    const userIndexes = await User.collection.indexes();
    assert.ok(userIndexes.some((index) => index.unique && index.key.userCode === 1), "userCode should have a unique index");

    const newPassword = "RegisteredUser!2026";
    const photoBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const studentForm = new FormData();
    Object.entries({
      role: "student",
      name: "Registered API Student",
      userCode: codes.registeredStudent,
      department: "ECE",
      classCode: "25EC3C",
      year: "III",
      phone: "9000000011",
      password: newPassword
    }).forEach(([key, value]) => studentForm.append(key, value));
    studentForm.append("photo", new Blob([photoBytes], { type: "image/png" }), "profile.png");
    const studentRegistration = await api("/auth/register", {
      method: "POST",
      body: studentForm
    });
    assert.equal(studentRegistration.response.status, 201, studentRegistration.payload.message);

    const savedStudent = await User.findOne({ userCode: codes.registeredStudent })
      .select("+passwordHash +profilePhotoData +profilePhotoContentType");
    assert.ok(savedStudent, "student registration should persist to MongoDB");
    assert.equal(savedStudent.accountStatus, "active");
    assert.equal(savedStudent.classCode, "25EC3C");
    assert.equal(savedStudent.year, "III");
    assert.equal(await bcrypt.compare(newPassword, savedStudent.passwordHash), true);
    assert.equal(savedStudent.profilePhotoContentType, "image/png");
    assert.equal(Buffer.from(savedStudent.profilePhotoData).equals(Buffer.from(photoBytes)), true);

    const studentLogin = await api("/auth/login", {
      method: "POST",
      body: { userCode: codes.registeredStudent, password: newPassword }
    });
    assert.equal(studentLogin.response.status, 200);
    assert.equal(studentLogin.payload.user.role, "student");
    assert.equal("passwordHash" in studentLogin.payload.user, false);
    const studentCookie = studentLogin.response.headers.get("set-cookie")?.split(";")[0];
    const studentRequests = await api("/requests", { cookie: studentCookie });
    assert.equal(studentRequests.response.status, 200);
    const savedPhoto = await fetch(`${baseUrl}/api/files/${encodeURIComponent(savedStudent.profilePhoto)}`, {
      headers: { cookie: studentCookie }
    });
    assert.equal(savedPhoto.status, 200);
    assert.match(savedPhoto.headers.get("content-type"), /image\/png/);
    assert.deepEqual(Buffer.from(await savedPhoto.arrayBuffer()), Buffer.from(photoBytes));

    const duplicateStudent = await api("/auth/register", {
      method: "POST",
      body: {
        role: "student",
        name: "Duplicate API Student",
        userCode: codes.registeredStudent,
        department: "ECE",
        classCode: "25EC3C",
        year: "III",
        phone: "9000000011",
        password: newPassword
      }
    });
    assert.equal(duplicateStudent.response.status, 409);

    const invalidStudent = await api("/auth/register", {
      method: "POST",
      body: { role: "student", userCode: `BAD-${suffix}`, password: "short" }
    });
    assert.equal(invalidStudent.response.status, 400);

    const mentorRegistration = await api("/auth/register", {
      method: "POST",
      body: {
        role: "mentor",
        name: "Registered API Mentor",
        userCode: codes.registeredMentor,
        department: "ECE",
        assignedClasses: "25EC3C, 25EC3D",
        phone: "9000000012",
        password: newPassword
      }
    });
    assert.equal(mentorRegistration.response.status, 201, mentorRegistration.payload.message);
    const savedMentor = await User.findOne({ userCode: codes.registeredMentor });
    assert.equal(savedMentor.accountStatus, "pending");
    assert.deepEqual(savedMentor.assignedClasses, ["25EC3C", "25EC3D"]);
    assert.equal(savedMentor.classCode, "25EC3C");

    const pendingMentorLogin = await api("/auth/login", {
      method: "POST",
      body: { userCode: codes.registeredMentor, password: newPassword }
    });
    assert.equal(pendingMentorLogin.response.status, 403);
    assert.match(pendingMentorLogin.payload.message, /pending administrator approval/i);

    const unprotectedQueue = await api("/admin/registrations");
    assert.equal(unprotectedQueue.response.status, 401);
    const pendingQueue = await api("/admin/registrations", { adminToken: process.env.ADMIN_APPROVAL_TOKEN });
    assert.equal(pendingQueue.response.status, 200);
    assert.ok(pendingQueue.payload.registrations.some((user) => user.id === savedMentor.id));

    const approval = await api(`/admin/registrations/${savedMentor.id}/review`, {
      adminToken: process.env.ADMIN_APPROVAL_TOKEN,
      method: "POST",
      body: { decision: "approved" }
    });
    assert.equal(approval.response.status, 200, approval.payload.message);
    assert.equal(approval.payload.registration.accountStatus, "active");
    const approvedMentorLogin = await api("/auth/login", {
      method: "POST",
      body: { userCode: codes.registeredMentor, password: newPassword }
    });
    assert.equal(approvedMentorLogin.response.status, 200);
    assert.equal(approvedMentorLogin.payload.user.role, "mentor");
    const mentorCookie = approvedMentorLogin.response.headers.get("set-cookie")?.split(";")[0];
    const mentorRequests = await api("/requests", { cookie: mentorCookie });
    assert.equal(mentorRequests.response.status, 200);

    const hodRegistration = await api("/auth/register", {
      method: "POST",
      body: {
        role: "hod",
        name: "Registered API HOD",
        userCode: codes.registeredHod,
        department: "ECE",
        phone: "9000000013",
        password: newPassword
      }
    });
    assert.equal(hodRegistration.response.status, 201, hodRegistration.payload.message);
    const savedHod = await User.findOne({ userCode: codes.registeredHod });
    assert.equal(savedHod.accountStatus, "pending");

    const approvalHod = await api(`/admin/registrations/${savedHod.id}/review`, {
      adminToken: process.env.ADMIN_APPROVAL_TOKEN,
      method: "POST",
      body: { decision: "approved" }
    });
    assert.equal(approvalHod.response.status, 200);
    assert.equal(approvalHod.payload.registration.accountStatus, "active");
    const approvedHodLogin = await api("/auth/login", {
      method: "POST",
      body: { userCode: codes.registeredHod, password: newPassword }
    });
    assert.equal(approvedHodLogin.response.status, 200);
    assert.equal(approvedHodLogin.payload.user.role, "hod");
    const hodCookie = approvedHodLogin.response.headers.get("set-cookie")?.split(";")[0];
    const hodRequests = await api("/requests", { cookie: hodCookie });
    assert.equal(hodRequests.response.status, 200);

    const secondStudentRegistration = await api("/auth/register", {
      method: "POST",
      body: {
        role: "student",
        name: "Second Class API Student",
        userCode: codes.secondStudent,
        department: "ECE",
        classCode: "25EC3D",
        year: "III",
        phone: "9000000015",
        password: newPassword
      }
    });
    assert.equal(secondStudentRegistration.response.status, 201);
    const secondStudentLogin = await api("/auth/login", {
      method: "POST",
      body: { userCode: codes.secondStudent, password: newPassword }
    });
    assert.equal(secondStudentLogin.response.status, 200);
    const secondStudentCookie = secondStudentLogin.response.headers.get("set-cookie")?.split(";")[0];
    const departure = new Date(Date.now() + 60 * 60 * 1000);
    const expectedReturn = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const multiClassRequest = await api("/requests", {
      cookie: secondStudentCookie,
      method: "POST",
      body: {
        requestType: "OD",
        category: "Presentation",
        destination: "VCET Seminar Hall",
        reason: "Testing a second mentor class assignment",
        expectedDeparture: departure.toISOString(),
        expectedReturn: expectedReturn.toISOString()
      }
    });
    assert.equal(multiClassRequest.response.status, 201, multiClassRequest.payload.message);
    createdRequestIds.push(multiClassRequest.payload.request.requestId);
    const routedRequest = await Request.findOne({ requestId: multiClassRequest.payload.request.requestId });
    assert.equal(String(routedRequest.mentor), String(savedMentor.id));

    const rejectedMentorRegistration = await api("/auth/register", {
      method: "POST",
      body: {
        role: "mentor",
        name: "Rejected API Mentor",
        userCode: codes.rejectedMentor,
        department: "ECE",
        assignedClasses: "25EC3C",
        phone: "9000000014",
        password: newPassword
      }
    });
    assert.equal(rejectedMentorRegistration.response.status, 201);
    const rejectedMentor = await User.findOne({ userCode: codes.rejectedMentor });
    const mentorRejection = await api(`/admin/registrations/${rejectedMentor.id}/review`, {
      adminToken: process.env.ADMIN_APPROVAL_TOKEN,
      method: "POST",
      body: { decision: "rejected", reviewNote: "Please verify your appointment." }
    });
    assert.equal(mentorRejection.response.status, 200);
    const rejectedMentorLogin = await api("/auth/login", {
      method: "POST",
      body: { userCode: codes.rejectedMentor, password: newPassword }
    });
    assert.equal(rejectedMentorLogin.response.status, 403);
    assert.match(rejectedMentorLogin.payload.message, /rejected/i);
  });

  it("enforces mentor → HOD → mentor approvals and rejection reasons", async () => {
    const student = await signIn(codes.student);
    const mentor = await signIn(codes.mentor);
    const hod = await signIn(codes.hod);

    const studentCannotApprove = await api(`/requests/${requestIds.approval}/action`, {
      cookie: student.cookie,
      method: "POST",
      body: { decision: "approved" }
    });
    assert.equal(studentCannotApprove.response.status, 403);

    const hodCannotSkipMentor = await api(`/requests/${requestIds.approval}/action`, {
      cookie: hod.cookie,
      method: "POST",
      body: { decision: "approved" }
    });
    assert.equal(hodCannotSkipMentor.response.status, 409);

    const missingReason = await api(`/requests/${requestIds.rejection}/action`, {
      cookie: mentor.cookie,
      method: "POST",
      body: { decision: "rejected" }
    });
    assert.equal(missingReason.response.status, 400);

    const firstApproval = await api(`/requests/${requestIds.approval}/action`, {
      cookie: mentor.cookie,
      method: "POST",
      body: { decision: "approved", comments: "Mentor review complete." }
    });
    assert.equal(firstApproval.response.status, 200);
    assert.equal(firstApproval.payload.request.status, "Pending HOD Approval");

    const mentorCannotApproveTwice = await api(`/requests/${requestIds.approval}/action`, {
      cookie: mentor.cookie,
      method: "POST",
      body: { decision: "approved" }
    });
    assert.equal(mentorCannotApproveTwice.response.status, 409);

    const hodApproval = await api(`/requests/${requestIds.approval}/action`, {
      cookie: hod.cookie,
      method: "POST",
      body: { decision: "approved", comments: "HOD review complete." }
    });
    assert.equal(hodApproval.response.status, 200);
    assert.equal(hodApproval.payload.request.status, "Awaiting Mentor Confirmation");

    const finalApproval = await api(`/requests/${requestIds.approval}/action`, {
      cookie: mentor.cookie,
      method: "POST",
      body: { decision: "approved", comments: "Final confirmation complete." }
    });
    assert.equal(finalApproval.response.status, 200);
    assert.equal(finalApproval.payload.request.status, "Fully Approved");
    assert.equal(finalApproval.payload.request.approvals.length, 3);

    const rejection = await api(`/requests/${requestIds.rejection}/action`, {
      cookie: mentor.cookie,
      method: "POST",
      body: { decision: "rejected", rejectionReason: "Required details are missing." }
    });
    assert.equal(rejection.response.status, 200);
    assert.equal(rejection.payload.request.status, "Rejected by Mentor");
    assert.equal(rejection.payload.request.rejectionReason, "Required details are missing.");
  });
});
