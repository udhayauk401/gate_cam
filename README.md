# Student Gateway

A React, Express, and MongoDB starter application for student OD / Gate Pass requests, sequential mentor–HOD–mentor approval, notifications, and an explicitly simulated gate scan. The project is designed to run locally in VS Code.

> **Prototype notice:** This is not a production campus security system. Face recognition, liveness detection, biometric enrollment, real device identity verification, and physical gate safety interlocks are not implemented. The simulated gate uses the signed-in student's own request and must not be used to control a real gate. Obtain college authorization, privacy/legal review, consent, and a physical safety assessment before any real deployment.

## What works

- Five-second splash screen and role-based sign-in / registration screens.
- Student, mentor, and HOD accounts with bcrypt password hashes and an eight-hour, HTTP-only session cookie.
- Mandatory password change for seeded demo users before application features are available.
- Student OD / Gate Pass submission, editable permission-letter text, and optional PDF/image attachment.
- Sequential state checks: `Pending Mentor Approval` → `Pending HOD Approval` → `Awaiting Mentor Confirmation` → `Fully Approved`; rejection is recorded with its reason and approver history.
- Role-scoped request lists, notifications, profile editing, private uploaded-file access, and feedback storage.
- Gate-pass authorization checks and simulated departure/return event records. `DEMO_MODE=true` enables student-only scans that are explicitly marked session-authenticated. The real-device endpoint fails closed with HTTP 503 until a trusted identity-verification integration exists; setting a device token alone cannot authorize physical access.
- ESP32 actuator example for a bench prototype. It is not a face-recognition system or a complete safety controller.

## Requirements

- Node.js 20 or newer and npm.
- MongoDB Community Server running locally, or a MongoDB URI you are authorized to use.
- PowerShell terminal in VS Code (commands below use Windows paths).

## Setup

1. Copy `.env.example` to `backend/.env` and set your MongoDB Atlas `MONGODB_URI`, a long random `JWT_SECRET`, and a separate long random `ADMIN_APPROVAL_TOKEN`. URL-encode special characters in the Atlas password. Keep this file private and never put either secret in frontend variables.
2. From the project root, install the packages:

   ```powershell
   npm install
   npm install --prefix backend
   npm install --prefix frontend
   ```

3. Start the API and frontend in development mode:

   ```powershell
   npm run dev
   ```

   The frontend is at `http://localhost:5173`; the API is at `http://localhost:4000/api/health`. To run them in separate PowerShell terminals:

   ```powershell
   npm run dev --prefix backend
   npm run dev --prefix frontend
   ```
   For Microsoft Dev Tunnels, forward only the frontend port (5173). The Vite development server proxies `/api` requests to the local backend on port 4000, so browser requests and session cookies stay on the frontend origin. Keep tunnel access restricted to trusted testers; this development setup is not a production deployment.

4. To create clearly identified local demo accounts, set `DEMO_MODE=true` in `backend/.env`, then run:

   ```powershell
   npm run seed:demo --prefix backend
   ```

   Demo users:

   | Role | User code | Temporary demo password |
   |---|---|---|
   | Student | `732925ECR001` | `DemoPass!2026` |
   | Mentor | `MTR-ECE` | `DemoPass!2026` |
   | HOD | `HOD-ECE` | `DemoPass!2026` |

   The seed includes a pending request and a currently valid, fully approved demo Gate Pass. The demo scan button appears only with `DEMO_MODE=true`. These fixed credentials and sample records are for local testing only; never expose demo mode to a public network.

5. Student, Mentor, and HOD users can register in the frontend with a unique user code and a password of at least 10 characters. Student accounts activate immediately. Mentor registrations include one or more comma-separated assigned classes; Mentor and HOD accounts stay pending until an administrator reviews them. Passwords are bcrypt-hashed before being stored in the shared `users` collection.

   The administrator approval API is protected by the server-only `ADMIN_APPROVAL_TOKEN` header and is not exposed through the frontend. From a trusted PowerShell terminal, list pending registrations:

   ```powershell
   $secureToken = Read-Host "Enter ADMIN_APPROVAL_TOKEN from backend/.env" -AsSecureString
   $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
   try {
     $headers = @{ "x-admin-approval-token" = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer) }
   } finally {
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
   }
   $pending = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/registrations" -Headers $headers
   $pending.registrations
   ```

   Approve a pending account using its returned `id`:

   ```powershell
   $registrationId = "<pending-registration-id>"
   $body = @{ decision = "approved" } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri "http://localhost:4000/api/admin/registrations/$registrationId/review" -Headers $headers -ContentType "application/json" -Body $body
   ```

   To reject instead, use `decision = "rejected"` and include a `reviewNote`. Keep the token out of browser code, logs, screenshots, and source control. Rotate it if exposed. This API uses one server-side approval secret; it is intended for a trusted administrator tool/terminal, not an open public admin dashboard.

   For local-only mentor/HOD demo accounts, the `seed:mentor-hod` script creates `MENTOR001` for class `25EC3C` and `HOD001` for department `ECE`. It requires `DEMO_MODE=true`, skips existing user codes, and their date-of-birth temporary passwords must be changed on first sign-in:

   ```powershell
   npm run seed:mentor-hod --prefix backend
   ```

## MongoDB collections and indexes

The backend connects using `MONGODB_URI`, registers the existing Mongoose models, and initializes their collections and indexes at startup. New accounts are saved to the existing `users` collection. Initialization does not delete or replace user or student records.

## Backend API tests

The integration tests exercise authenticated request access and the mentor → HOD → mentor approval sequence against a separate MongoDB database. Configure `TEST_MONGODB_URI` in `backend/.env` to point to a database whose name ends in `_test`; the tests refuse to run against any other database. They create uniquely named fixtures and clean up only those fixtures when finished. Do not point this setting at a production database.

Run from the project root:

```powershell
npm test
```

## Hardware bench prototype

See [hardware/README.md](./hardware/README.md). Keep the servo disconnected from any actual gate during development. For an actual gate installation, the controller, power, emergency release, access policy, network threat model, local regulations, and fail-safe behavior need review by qualified college facilities and security staff. The ESP32 sample expects a separate camera/scanner system to verify identity and provide a request ID; no camera/face matching component is included.

## API outline

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/password`, `GET /api/auth/me`
- `GET /api/admin/registrations` and `POST /api/admin/registrations/:userId/review` with the server-only `x-admin-approval-token` header
- `POST /api/requests`, `GET /api/requests`, `GET /api/requests/:requestId`, `POST /api/requests/:requestId/action`
- `GET /api/requests/notifications`, `PATCH /api/requests/notifications/:id/read`, `POST /api/requests/feedback`
- `PATCH /api/profile`, `POST /api/requests/profile/photo`, authenticated file access at `GET /api/files/:filename`
- Authenticated local simulation: `POST /api/gate/demo-scan` with `{ "requestId": "SG-DEMO-GATEPASS" }`
- Simulated departure/return: `POST /api/gate/demo-scan` with `{ "requestId": "...", "eventType": "departure" }` or `"return"` while signed in as the pass holder.
- Gate-device placeholder: `POST /api/gate/scan` with `x-gate-token: <GATE_DEVICE_TOKEN>`; it deliberately denies with HTTP 503 until a trusted identity-verification component is implemented and reviewed.

The demo gate denies access unless the pass is a Gate Pass, is marked as requiring a gate pass, has reached `Fully Approved`, and is inside the expected date/time window. It records one departure and one return and ignores repeated scans during a 30-second cooldown. It does **not** perform biometric identity verification or issue any real gate command. The hardware endpoint is intentionally fail-closed and does **not** grant access yet.

## Checks

```powershell
npm run build
```

The frontend build does not require MongoDB. API workflow checks require a running MongoDB instance and test accounts.
