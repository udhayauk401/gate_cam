import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Bell, BookOpen, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3,
  FileCheck2, FilePlus2, FileText, GraduationCap, LayoutDashboard, LogOut, Menu,
  MessageSquareText, ShieldCheck, UserRound, X
} from "lucide-react";
import { api, fileUrl } from "./api.js";

const DEPARTMENTS = [
  ["IT", "Information Technology"],
  ["ECE", "Electronics and Communication Engineering"],
  ["CSE", "Computer Science and Engineering"],
  ["AIDS", "Artificial Intelligence and Data Science"],
  ["AIML", "Artificial Intelligence and Machine Learning"],
  ["MECH", "Mechanical Engineering"],
  ["CIVIL", "Civil Engineering"]
];
const YEARS = ["I", "II", "III", "IV"];
const CATEGORIES = ["Hackathon", "Presentation", "Sports", "Project Expo", "Health Issue", "Other Personal Reason"];

function Splash({ onDone }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3000);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return <div className="splash auth-scene"><div className="splash-brand"><img src="/assets/student-gateway-logo.png" alt="Student Gateway — Velalar College of Engineering and Technology" /><h1>Student Gateway</h1><p>Velalar College of Engineering and Technology</p></div></div>;
}

function App() {
  const [splash, setSplash] = useState(true);
  const finishSplash = useCallback(() => setSplash(false), []);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("Dashboard");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUser = useCallback(async () => {
    try {
      const { user: current } = await api("/auth/me");
      setUser(current);
    } catch (error) {
      if (!/sign in|session has expired|unavailable/i.test(error.message)) setNotice(error.message);
    }
  }, []);

  useEffect(() => { if (!splash) refreshUser(); }, [splash, refreshUser]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setPage("Dashboard");
      setUnreadCount(0);
    } catch (error) {
      setNotice(error.message);
    }
  }

  if (splash) return <Splash onDone={finishSplash} />;
  if (!user) return <AuthPage onLogin={setUser} />;

  return (
    <DashboardLayout user={user} page={page} onPage={setPage} onLogout={logout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} notice={notice} setNotice={setNotice} unreadCount={unreadCount} setUnreadCount={setUnreadCount}>
        <main className="main-content">
          <div className="page-heading"><div><div className="eyebrow">STUDENT GATEWAY / {user.role.toUpperCase()}</div>{page === "Dashboard" ? <><h1>Welcome, {user.name}!</h1><p className="greeting-subtitle">Have a great day!</p></> : <h1>{page}</h1>}</div><div className="welcome-date">{new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date())}</div></div>
          {user.mustChangePassword
            ? <PasswordNotice onSaved={(updated) => setUser(updated)} />
            : <Content user={user} page={page} onPage={setPage} onNotice={setNotice} onUserUpdate={setUser} onUnreadCount={setUnreadCount}/>}
        </main>
    </DashboardLayout>
  );
}

function roleNavigation(role) {
  if (role === "student") {
    return ["Dashboard", "My Profile", "Apply for OD / Gate Pass", "My Requests", "Request History", "Notifications", "Help & Support", "Feedback"];
  }
  if (role === "mentor") {
    return ["Dashboard", "My Profile", "Pending Requests", "Forwarded to HOD", "Awaiting Final Confirmation", "Approved Requests", "Rejected Requests", "Request History", "Notifications", "Help & Support"];
  }
  return ["Dashboard", "My Profile", "Pending Requests", "Approved Requests", "Rejected Requests", "Department Requests", "Request History", "Notifications", "Help & Support"];
}

function DashboardLayout({ user, page, onPage, onLogout, sidebarOpen, setSidebarOpen, notice, setNotice, unreadCount, setUnreadCount, children }) {
  return (
    <div className="app-shell">
      <TopHeader user={user} page={page} onPage={onPage} onLogout={onLogout} unreadCount={unreadCount} setUnreadCount={setUnreadCount} onOpenSidebar={() => setSidebarOpen(true)} onNotice={setNotice}/>
      <div className="workspace">
        {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"/>}
        <RoleSidebar role={user.role} page={page} onPage={onPage} onLogout={onLogout} open={sidebarOpen} onClose={() => setSidebarOpen(false)}/>
        {children}
      </div>
      {notice && <div className="toast"><CheckCircle2 size={18}/>{notice}<button onClick={() => setNotice("")}><X size={16}/></button></div>}
    </div>
  );
}

function TopHeader({ user, page, onPage, onLogout, unreadCount, setUnreadCount, onOpenSidebar, onNotice }) {
  const lastUnreadError = useRef("");
  useEffect(() => {
    let active = true;
    async function loadUnreadCount() {
      if (user.mustChangePassword) return;
      try {
        const result = await api("/requests/notifications");
        if (active) setUnreadCount(result.unreadCount ?? result.notifications.filter((item) => !item.read).length);
        lastUnreadError.current = "";
      } catch (error) {
        if (active && lastUnreadError.current !== error.message) {
          lastUnreadError.current = error.message;
          onNotice(error.message);
        }
      }
    }
    loadUnreadCount();
    const timer = window.setInterval(loadUnreadCount, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user.id, user.mustChangePassword, page, onNotice, setUnreadCount]);

  const classes = user.role === "mentor" ? (user.assignedClasses?.length ? user.assignedClasses : user.classCode ? [user.classCode] : []) : user.classCode ? [user.classCode] : [];
  const departmentLine = [user.department, ...classes].filter(Boolean).join(" · ");
  return <header className="topbar">
    <button className="mobile-menu" onClick={onOpenSidebar} aria-label="Open navigation"><Menu size={20}/></button>
    <div className="brand"><img src="/assets/student-gateway-logo.png" alt="Student Gateway — Velalar College of Engineering and Technology" /><span>Student Gateway<small>VCET · Erode</small></span></div>
    <div className="top-actions">
      <span className="role-pill">{user.role.toUpperCase()}</span>
      <button className={`notification-button ${page === "Notifications" ? "selected" : ""}`} onClick={() => onPage("Notifications")} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} title="Notifications">
        <Bell size={19}/>{unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      <button className="header-user" onClick={() => onPage("My Profile")} aria-label="Open profile">
        <ProfileAvatar user={user} className="avatar-mini"/>
        <span className="header-user-details"><b>{user.name}</b><small>{user.userCode}</small><small>{departmentLine}</small></span>
      </button>
      <button className="icon-btn" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={18}/></button>
    </div>
  </header>;
}

function RoleSidebar({ role, page, onPage, onLogout, open, onClose }) {
  return <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
    <button className="sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={19}/></button>
    <div className="side-label">WORKSPACE</div>
    {roleNavigation(role).map((item) => <button key={item} className={`nav-item ${page === item ? "active" : ""}`} onClick={() => { onPage(item); onClose(); }}><NavIcon name={item}/><span>{item}</span></button>)}
    <div className="side-help"><ShieldCheck size={18}/><span>Secure approvals<br/><small>Every decision is recorded</small></span></div>
    <button className="nav-item logout-link" onClick={onLogout}><LogOut size={17}/><span>Logout</span></button>
  </aside>;
}

function ProfileAvatar({ user, className = "", previewUrl = "" }) {
  const image = previewUrl || (user.profilePhoto ? fileUrl(user.profilePhoto) : "");
  return <span className={className}>{image ? <img crossOrigin="use-credentials" src={image} alt={`${user.name}'s profile`}/> : user.name?.slice(0, 1)?.toUpperCase()}</span>;
}

function NavIcon({ name }) {
  const map = {
    Dashboard: LayoutDashboard, "My Profile": UserRound, "Apply for OD / Gate Pass": FilePlus2,
    "My Requests": FileText, "Pending Requests": Clock3, "Forwarded to HOD": ArrowRight,
    "Awaiting Final Confirmation": CheckCircle2, "Approved Requests": FileCheck2,
    "Rejected Requests": X, "Department Requests": GraduationCap, "Request History": BookOpen,
    Notifications: Bell, "Help & Support": CircleHelp, Feedback: MessageSquareText
  };
  const Icon = map[name] || LayoutDashboard;
  return <Icon size={17}/>;
}

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("select");
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState(null);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const body = new FormData();
        Object.entries({ ...form, role }).forEach(([key, value]) => body.append(key, value));
        if (photo) body.append("photo", photo);
        const result = await api("/auth/register", { method: "POST", body });
        setMode("login");
        setForm({ userCode: String(form.userCode || "").trim().toUpperCase(), password: "" });
        setPhoto(null);
        setError(result.message);
      } else {
        const result = await api("/auth/login", {
          method: "POST",
          body: { userCode: form.userCode, password: form.password }
        });
        onLogin(result.user);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  if (mode === "select") return (
    <div className="auth-page auth-scene role-selection">
      <section className="welcome-promo" aria-label="Student Gateway introduction">
        <h2>Empowering<br/>Students<br/><span>for a Smarter<br/>Tomorrow</span></h2>
        <div className="promo-rule"/>
        <p>Permissions <b>·</b> Approvals <b>·</b> Gate Passes<br/>All in One Place</p>
      </section>
      <div className="auth-card welcome-card">
        <img className="auth-logo" src="/assets/student-gateway-logo.png" alt="Student Gateway — Velalar College of Engineering and Technology" />
        <div className="eyebrow">VELALAR COLLEGE OF ENGINEERING AND TECHNOLOGY</div>
        <h1>Welcome to your<br/><span>Student Gateway</span></h1>
        <p className="muted">One secure place for permissions, approvals, and campus gate passes.</p>
        <div className="role-cards">
          {["student", "mentor", "hod"].map((item) => <button className="role-card" key={item} onClick={() => { setRole(item); setMode("login"); }}><span className="role-icon">{item === "student" ? <GraduationCap/> : item === "mentor" ? <UserRound/> : <ShieldCheck/>}</span><span><b>{item === "hod" ? "HOD" : item[0].toUpperCase() + item.slice(1)} Login</b><small>{item === "student" ? "Continue to your workspace" : item === "mentor" ? "Review and approve student requests" : "Manage departmental approvals"}</small></span><span className="role-arrow"><ArrowRight size={18}/></span></button>)}
        </div>
        <div className="auth-footer"><span>New student?</span> <button className="text-button" onClick={() => { setRole("student"); setMode("register"); }}>Create an account <ArrowRight size={14}/></button></div>
        <p className="demo-label"><ShieldCheck size={14}/> Secure sign-in for authorised college users.</p>
      </div>
      <aside className="welcome-benefits" aria-label="Gateway features">
        <div className="benefit-item"><span><ShieldCheck size={23}/></span><b>Secure<br/>Access</b></div>
        <div className="benefit-item"><span><FileCheck2 size={23}/></span><b>Digital<br/>Approvals</b></div>
        <div className="benefit-item"><span><BookOpen size={23}/></span><b>Campus<br/>Gate Passes</b></div>
        <div className="benefit-item"><span><GraduationCap size={23}/></span><b>Academic<br/>Support</b></div>
        <div className="benefit-rule"/>
        <p>A SMARTER<br/>CAMPUS EXPERIENCE</p>
      </aside>
      {error && <div className="toast">{error}<button onClick={() => setError("")}><X size={16}/></button></div>}
    </div>
  );

  return (
    <div className="auth-page auth-scene"><div className="auth-card form-card">
      <button className="back-button" onClick={() => setMode("select")}>← Back to role selection</button>
      <div className="form-logo"><img src="/assets/student-gateway-logo.png" alt="Student Gateway — Velalar College of Engineering and Technology"/><span>Student Gateway</span></div>
      <div className="eyebrow">{role.toUpperCase()} PORTAL</div>
      <h1>{mode === "register" ? "Create your account" : "Welcome back"}</h1>
      <p className="muted">{mode === "register" ? "Use your college details to get started." : "Sign in to manage your requests and approvals."}</p>
      <form className="stack-form" onSubmit={submit}>
        {mode === "register" && <>
          <label>Full name<input name="name" value={form.name || ""} onChange={update} required maxLength="100" placeholder="Your full name"/></label>
          <label>{role === "student" ? "Roll number" : "User code"}<input name="userCode" value={form.userCode || ""} onChange={update} required placeholder={role === "student" ? "732925ECR001" : "College-issued code"}/></label>
          <label>Department<select name="department" value={form.department || ""} onChange={update} required><option value="">Select department</option>          {DEPARTMENTS.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}</select></label>
          {role === "mentor" && <label>Assigned classes (comma-separated)<input name="assignedClasses" value={form.assignedClasses || ""} onChange={update} required placeholder="25EC3C, 25EC3D"/></label>}
          {role === "student" && <label>Class<input name="classCode" value={form.classCode || ""} onChange={update} required placeholder="25EC3C"/></label>}
          {role === "student" && <label>Year<select name="year" value={form.year || ""} onChange={update} required><option value="">Select year</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></label>}
          <label>Phone number<input name="phone" value={form.phone || ""} onChange={update} required inputMode="tel" placeholder="10-digit phone number"/></label>
          <label>Password<input type="password" name="password" value={form.password || ""} onChange={update} required autoComplete="new-password" minLength="10" maxLength="128" placeholder="At least 10 characters"/></label>
          <label className="file-label">Profile photo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] || null)}/><small>JPG, PNG, or WebP up to 5 MB.</small></label>
          {role === "student"
            ? <div className="info-note">Student accounts can sign in as soon as registration is complete.</div>
            : <div className="info-note">Mentor and HOD accounts stay pending until a college administrator verifies and approves them.</div>}
        </>}
        {mode === "login" && <>
          <label>{role === "student" ? "Roll number" : "User code"}<input name="userCode" value={form.userCode || ""} onChange={update} required autoComplete="username" placeholder={role === "student" ? "732925ECR001" : "Your user code"}/></label>
          <label>Password<input type="password" name="password" value={form.password || ""} onChange={update} required autoComplete="current-password" placeholder="Enter your password"/></label>
        </>}
        {error && <div className={error.startsWith("Registration ") ? "success-note" : "error-note"}>{error}</div>}
        <button className="primary-button wide" disabled={loading}>{loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}<ArrowRight size={17}/></button>
      </form>
      <div className="auth-footer">{mode === "register" ? "Already registered?" : "Need an account?"} <button className="text-button" onClick={() => { setError(""); setMode(mode === "register" ? "login" : "register"); }}>{mode === "register" ? "Sign in" : "Register"}</button></div>
    </div></div>
  );
}

function PasswordNotice({ onSaved }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function save(event) {
    event.preventDefault();
    try {
      const result = await api("/auth/password", { method: "POST", body: { password } });
      onSaved(result.user);
    } catch (saveError) {
      setError(saveError.message);
    }
  }
  return <form className="password-notice" onSubmit={save}><ShieldCheck size={20}/><div><b>Change your temporary password</b><small>Choose at least 10 characters to continue.</small>{error && <span className="inline-error">{error}</span>}</div><input type="password" minLength="10" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="New password"/><button className="primary-button">Update</button></form>;
}

function Content({ user, page, onPage, onNotice, onUserUpdate, onUnreadCount }) {
  if (page === "Apply for OD / Gate Pass") return <RequestForm user={user} onNotice={onNotice} onDone={() => onPage("My Requests")}/>;
  if (page === "My Profile") return <Profile user={user} onNotice={onNotice} onUserUpdate={onUserUpdate}/>;
  if (page === "Notifications") return <Notifications onUnreadCount={onUnreadCount}/>;
  if (page === "Help & Support") return <Help/>;
  if (page === "Feedback") return <Feedback onNotice={onNotice}/>;
  if (page === "Dashboard") return <Dashboard user={user} onNotice={onNotice} onPage={onPage}/>;
  return <RequestList user={user} page={page} onNotice={onNotice}/>;
}

function Dashboard({ user, onNotice }) {
  return <RequestList user={user} page="Dashboard" onNotice={onNotice}/>;
}

function printLetter(request) {
  const popup = window.open("", "_blank");
  if (!popup) return;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(request.requestId)} permission letter</title><style>body{font:14px/1.7 Georgia,serif;color:#172943;margin:50px auto;max-width:760px;padding:0 24px}header{font:700 12px Arial,sans-serif;color:#42617d;border-bottom:1px solid #dce5ed;padding-bottom:12px;margin-bottom:28px}pre{white-space:pre-wrap;font:14px/1.8 Georgia,serif}.status{font:700 12px Arial,sans-serif;color:#087f72;margin-top:24px}@media print{body{margin:0 auto}}</style></head><body><header>STUDENT GATEWAY · ${escapeHtml(request.requestId)}</header><pre>${escapeHtml(request.letterContent)}</pre><div class="status">Current status: ${escapeHtml(request.status)}</div></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

function RequestForm({ user, onNotice, onDone }) {
  const [form, setForm] = useState({
    requestType: "OD",
    category: "",
    destination: "",
    reason: "",
    departureDate: "",
    departureTime: "",
    returnDate: "",
    returnTime: "",
    gatePassRequired: "No"
  });
  const [letter, setLetter] = useState("");
  const [document, setDocument] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const departure = form.departureDate && form.departureTime ? `${form.departureDate}T${form.departureTime}` : "";
  const expectedReturn = form.returnDate && form.returnTime ? `${form.returnDate}T${form.returnTime}` : "";
  const letterText = useMemo(() => letter || (form.category ? `From:\n${user.name}\n${user.userCode}\nVelalar College of Engineering and Technology\nErode, Tamil Nadu\n\nTo:\nThe Head of the Department\n${user.department}\nVelalar College of Engineering and Technology\nErode, Tamil Nadu\n\nSubject: ${form.category}\n\nRespected Sir/Madam,\n\nI, ${user.name} (${user.userCode}), request ${form.requestType} permission for ${form.category}. Destination / venue: ${form.destination || "[Destination]"}. Requested from ${departure || "[Departure date and time]"} to ${expectedReturn || "[Return date and time]"}.\n\n${form.reason || "[Add your detailed request]"}\n\nThank you.\n\nYours faithfully,\n${user.name}\n${user.userCode}` : ""), [letter, form, user, departure, expectedReturn]);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const body = new FormData();
    Object.entries({
      ...form,
      expectedDeparture: departure,
      expectedReturn,
      gatePassRequired: form.gatePassRequired === "Yes",
      letterContent: letterText
    }).forEach(([key, value]) => body.append(key, String(value)));
    if (document) body.append("document", document);
    try {
      const result = await api("/requests", { method: "POST", body });
      onNotice(`Request ${result.request.requestId} submitted to your mentor.`);
      onDone();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }
  return <div className="panel request-panel">
    <div className="panel-title"><div><span className="section-icon cyan"><FilePlus2 size={19}/></span><div><h2>New permission request</h2><p>Your letter will move through the required approval sequence.</p></div></div><span className="status-tag">Mentor → HOD → Mentor</span></div>
    <form className="request-form" onSubmit={submit}>
      <div className="form-grid">
        <label>Request type<select value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value, gatePassRequired: e.target.value === "Gate Pass" ? (form.gatePassRequired === "Yes" ? "Yes" : "No") : "No" })}><option>OD</option><option>Gate Pass</option></select></label>
        <label>Category<select value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); setLetter(""); }} required><option value="">Choose a category</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Departure date<input type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} required/></label>
        <label>Departure time<input type="time" value={form.departureTime} onChange={(e) => setForm({ ...form, departureTime: e.target.value })} required/></label>
        <label>Expected return date<input type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} required/></label>
        <label>Expected return time<input type="time" value={form.returnTime} onChange={(e) => setForm({ ...form, returnTime: e.target.value })} required/></label>
        <label>Gate pass required<select value={form.requestType === "OD" ? "No" : form.gatePassRequired} onChange={(e) => setForm({ ...form, gatePassRequired: e.target.value })} disabled={form.requestType === "OD"}><option>No</option><option>Yes</option></select></label>
        <label className="full">Destination or venue<input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} required maxLength="200" placeholder="Where are you going?"/></label>
        <label className="full">Reason<textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required maxLength="3000" rows="3" placeholder="Describe the event or reason for permission."/></label>
        <label className="file-label full">Supporting document (optional)<input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setDocument(e.target.files?.[0] || null)}/><small>PDF or image, up to 5 MB.</small></label>
      </div>
    {form.category && <label className="letter-preview">Permission letter preview<textarea value={letterText} onChange={(e) => setLetter(e.target.value)} rows="14" maxLength="5000"/></label>}
      {error && <div className="error-note">{error}</div>}
      <div className="form-actions"><span className="muted small">Request status starts as Pending Mentor Approval.</span><button className="primary-button" disabled={saving}>{saving ? "Submitting…" : "Submit request"}<ArrowRight size={17}/></button></div>
    </form>
  </div>;
}

function RequestList({ user, page, onNotice }) {
  const [requests, setRequests] = useState([]);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [comments, setComments] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api("/requests");
      setRequests(result.requests);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    api("/health").then((result) => setDemoMode(result.mode === "demo")).catch(() => setDemoMode(false));
  }, [load]);

  const filtered = requests.filter((request) => {
    if (page === "Pending Requests") return request.status === (user.role === "hod" ? "Pending HOD Approval" : "Pending Mentor Approval");
    if (page === "Forwarded to HOD") return request.status === "Pending HOD Approval";
    if (page === "Awaiting Final Confirmation") return request.status === "Awaiting Mentor Confirmation";
    if (page === "Approved Requests") return request.status === "Fully Approved";
    if (page === "Rejected Requests") return request.status.startsWith("Rejected");
    if (page === "Department Requests") return true;
    return true;
  });
  async function decide(request, decision) {
    if (decision === "rejected" && rejecting !== request.requestId) {
      setRejecting(request.requestId);
      return;
    }
    if (decision === "rejected" && !rejectionReasons[request.requestId]?.trim()) {
      setError("Enter a rejection reason before confirming.");
      return;
    }
    try {
      await api(`/requests/${request.requestId}/action`, {
        method: "POST",
        body: { decision, rejectionReason: rejectionReasons[request.requestId] || "", comments: comments[request.requestId] || "" }
      });
      setRejecting("");
      setRejectionReasons({ ...rejectionReasons, [request.requestId]: "" });
      onNotice(`Request ${request.requestId} ${decision}.`);
      await load();
    } catch (actionError) {
      setError(actionError.message);
    }
  }
  async function simulateScan(request, eventType) {
    try {
      const result = await api("/gate/demo-scan", { method: "POST", body: { requestId: request.requestId, eventType } });
      onNotice(result.message);
      await load();
    } catch (scanError) {
      setError(scanError.message);
    }
  }
  const pendingCount = requests.filter((request) => {
    if (user.role === "student") return ["Pending Mentor Approval", "Pending HOD Approval", "Awaiting Mentor Confirmation"].includes(request.status);
    if (user.role === "mentor") return request.status === "Pending Mentor Approval";
    return request.status === "Pending HOD Approval";
  }).length;
  const canAct = (request) => user.role === "mentor"
    ? ["Pending Mentor Approval", "Awaiting Mentor Confirmation"].includes(request.status)
    : user.role === "hod" && request.status === "Pending HOD Approval";
  const approvedCount = requests.filter((request) => request.status === "Fully Approved").length;
  const rejectedCount = requests.filter((request) => request.status.startsWith("Rejected")).length;
  const forwardedCount = requests.filter((request) => request.status === "Pending HOD Approval").length;
  const finalConfirmationCount = requests.filter((request) => request.status === "Awaiting Mentor Confirmation").length;
  const summaryItems = user.role === "mentor"
    ? [
      { icon: <Clock3/>, label: "Pending requests", value: pendingCount },
      { icon: <ArrowRight/>, label: "Forwarded to HOD", value: forwardedCount },
      { icon: <CheckCircle2/>, label: "Awaiting final confirmation", value: finalConfirmationCount },
      { icon: <FileCheck2/>, label: "Approved", value: approvedCount },
      { icon: <X/>, label: "Rejected", value: rejectedCount }
    ]
    : user.role === "hod"
      ? [
        { icon: <Clock3/>, label: "Pending approvals", value: pendingCount },
        { icon: <FileCheck2/>, label: "Approved", value: approvedCount },
        { icon: <X/>, label: "Rejected", value: rejectedCount },
        { icon: <GraduationCap/>, label: "Department requests", value: requests.length }
      ]
      : [
        { icon: <FileText/>, label: "Total requests", value: requests.length },
        { icon: <Clock3/>, label: "Awaiting review", value: pendingCount },
        { icon: <CheckCircle2/>, label: "Approved", value: approvedCount }
      ];
  const dashboardRequests = page === "Dashboard" ? filtered.slice(0, 5) : filtered;

  return <div className="content-stack">
    {page === "Dashboard" && <div className={`metric-row metric-row-${user.role}`}>{summaryItems.map((item) => <SummaryCard key={item.label} icon={item.icon} label={item.label} value={item.value}/>)}</div>}
    <div className="panel">
      <div className="panel-title"><div><span className="section-icon"><FileText size={19}/></span><div><h2>{page === "Dashboard" ? "Recent requests" : page}</h2><p>{user.role === "student" ? "Your request history and approval progress." : "Requests assigned to your role and department."}</p></div></div><button className="secondary-button" onClick={load}>Refresh</button></div>
      {error && <div className="error-note">{error}</div>}
      {loading ? <div className="empty-state">Loading requests…</div> : filtered.length === 0 ? <div className="empty-state"><FileCheck2 size={26}/><b>No requests here yet</b><span>New items will appear when requests are submitted.</span></div> :
        <div className="request-list">{dashboardRequests.map((request) => <RequestCard
          key={request._id}
          request={request}
          user={user}
          demoMode={demoMode}
          canAct={canAct(request)}
          rejecting={rejecting === request.requestId}
          rejectionReason={rejectionReasons[request.requestId] || ""}
          comment={comments[request.requestId] || ""}
          onRejectReason={(value) => setRejectionReasons({ ...rejectionReasons, [request.requestId]: value })}
          onComment={(value) => setComments({ ...comments, [request.requestId]: value })}
          onCancelReject={() => { setRejecting(""); setRejectionReasons({ ...rejectionReasons, [request.requestId]: "" }); }}
          onDecision={(decision) => decide(request, decision)}
          onSimulate={(eventType) => simulateScan(request, eventType)}
        />)}</div>}
    </div>
  </div>;
}

function RequestCard({ request, user, demoMode, canAct, rejecting, rejectionReason, comment, onRejectReason, onComment, onCancelReject, onDecision, onSimulate }) {
  const [letterOpen, setLetterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const student = request.student || {};
  const showDemoControls = demoMode && user.role === "student" && request.requestType === "Gate Pass" && request.gatePassRequired && request.status === "Fully Approved";
  return <article className="request-card">
    <div className="request-card-top">
      <div className="request-heading">
        <span className="request-id">{request.requestId}</span>
        <h3>{request.category} <span>· {request.requestType}</span></h3>
        <div className="request-person">
          {student.name && <ProfileAvatar user={student} className="request-avatar"/>}
          <span>{student.name} · {student.userCode} · {student.classCode}</span>
        </div>
      </div>
      <Status status={request.status}/>
    </div>
    <div className="request-details">
      <span><Clock3 size={15}/><b>Departure</b>{new Date(request.expectedDeparture).toLocaleString("en-IN")}</span>
      <span><ArrowRight size={15}/><b>Expected return</b>{new Date(request.expectedReturn).toLocaleString("en-IN")}</span>
      <span><GraduationCap size={15}/><b>Destination</b>{request.destination}</span>
    </div>
    {request.supportingDocument && <a className="file-link" href={fileUrl(request.supportingDocument)} target="_blank" rel="noreferrer"><FileText size={15}/>Supporting document</a>}
    {showDemoControls && <div className="demo-scan">
      <button className="secondary-button" onClick={() => onSimulate("departure")}><ShieldCheck size={15}/>Simulate departure</button>
      <button className="secondary-button" onClick={() => onSimulate("return")}><ShieldCheck size={15}/>Simulate return</button>
      <small>Demo only · does not operate the physical gate</small>
    </div>}
    <div className="request-card-links">
      <button className={`text-button request-toggle ${letterOpen ? "selected" : ""}`} onClick={() => setLetterOpen((open) => !open)} aria-expanded={letterOpen}><FileText size={14}/>{letterOpen ? "Hide letter" : "View letter"}</button>
      <button className={`text-button request-toggle ${historyOpen ? "selected" : ""}`} onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}><BookOpen size={14}/>{historyOpen ? "Hide request history" : "Request history"}</button>
    </div>
    {letterOpen && <div className="letter-details">
      <div className="letter-actions"><pre>{request.letterContent}</pre><button className="secondary-button" onClick={() => printLetter(request)}>Print letter · {request.status}</button></div>
    </div>}
    {historyOpen && <div className="approval-history request-history">
      {request.rejectionReason && <div className="rejection-reason"><b>Rejection reason:</b> {request.rejectionReason}</div>}
      {request.approvals?.length > 0 ? request.approvals.map((item, index) => <div key={`${request._id}-${index}`}><b>{item.role.toUpperCase()}</b> {item.decision} · {item.approver?.name || ""} · {new Date(item.timestamp).toLocaleString("en-IN")} {item.comments && <span>— {item.comments}</span>}</div>) : <span>No approval history recorded yet.</span>}
      {request.gateEvents?.length > 0 && <div><b>Gate access history</b>{request.gateEvents.map((event) => <div key={event._id}><b>{event.eventType.toUpperCase()}</b> · {event.accessDecision} · {new Date(event.timestamp).toLocaleString("en-IN")} · {event.deviceId}</div>)}</div>}
    </div>}
    {canAct && <div className="action-area">
      {rejecting && <><label className="rejection-field">Rejection reason<input value={rejectionReason} onChange={(event) => onRejectReason(event.target.value)} required placeholder="Required to reject this request"/></label><button className="secondary-button" onClick={onCancelReject}>Cancel</button></>}
      <input value={comment} onChange={(event) => onComment(event.target.value)} placeholder="Optional comments"/>
      <button className="success-button" onClick={() => onDecision("approved")}><Check size={16}/>{request.status === "Awaiting Mentor Confirmation" ? "Give final confirmation" : user.role === "mentor" ? "Approve & forward to HOD" : "Approve"}</button>
      <button className="danger-button" onClick={() => onDecision("rejected")}><X size={16}/>{rejecting ? "Confirm rejection" : "Reject"}</button>
    </div>}
  </article>;
}

function SummaryCard({ icon, label, value }) {
  return <div className="metric-card"><span className="metric-icon">{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function Status({ status }) {
  const type = status.includes("Approved") || status === "Fully Approved" ? "green" : status.startsWith("Rejected") ? "red" : status.startsWith("Pending") || status.startsWith("Awaiting") ? "amber" : "gray";
  return <span className={`status-badge ${type}`}><span/>{status}</span>;
}

function Profile({ user, onNotice, onUserUpdate }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || "");
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const photoInput = useRef(null);
  useEffect(() => {
    if (!photo) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function cancelEdit() {
    setName(user.name);
    setPhone(user.phone || "");
    setPhoto(null);
    setPhotoError("");
    setEditing(false);
  }

  function choosePhoto(event) {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";
    setPhotoError("");
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setPhotoError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setPhotoError("Profile photos must be 5 MB or smaller.");
      return;
    }
    setPhoto(selected);
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const profile = await api("/profile", { method: "PATCH", body: { name, phone } });
      onUserUpdate(profile.user);
      if (photo) {
        const body = new FormData();
        body.append("photo", photo);
        const updated = await api("/profile/photo", { method: "POST", body });
        onUserUpdate(updated.user);
      }
      setEditing(false);
      setPhoto(null);
      setPhotoError("");
      onNotice("Your profile has been updated.");
    } catch (error) {
      onNotice(error.message);
    } finally {
      setSaving(false);
    }
  }
  const classes = user.role === "mentor" ? (user.assignedClasses?.length ? user.assignedClasses : user.classCode ? [user.classCode] : []) : user.classCode ? [user.classCode] : [];
  return <div className="panel profile-panel"><div className="panel-title"><div><span className="section-icon"><UserRound size={18}/></span><div><h2>Profile details</h2><p>Review and update your permitted account information.</p></div></div>{!editing && <button className="secondary-button" onClick={() => setEditing(true)}>Edit Profile</button>}</div><div className="profile-hero"><ProfileAvatar user={user} className="profile-photo" previewUrl={previewUrl}/><div><h2>{user.name}</h2><p>{user.role.toUpperCase()} · {user.department}</p></div></div><form className="stack-form profile-form" onSubmit={save}><div className="form-grid"><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength="100" disabled={!editing}/></label><label>{user.role === "student" ? "Roll number" : "User code"}<input value={user.userCode} disabled/></label><label>Department<input value={user.department} disabled/></label>{classes.length > 0 && <label>{user.role === "mentor" ? "Assigned classes" : "Class"}<input value={classes.join(", ")} disabled/></label>}{user.role === "student" && user.year && <label>Year<input value={user.year} disabled/></label>}<label>Phone number<input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength="30" disabled={!editing}/></label></div>{editing && <div className="profile-photo-editor"><input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={choosePhoto} hidden/><button type="button" className="secondary-button" onClick={() => photoInput.current?.click()}>{photo ? "Change Photo" : user.profilePhoto ? "Change Photo" : "Upload Photo"}</button><span className="muted small">{photo ? photo.name : "JPG, PNG, or WebP · up to 5 MB"}</span>{photoError && <div className="error-note">{photoError}</div>}</div>}{editing && <div className="profile-actions"><button className="primary-button" disabled={saving || Boolean(photoError)}>{saving ? "Saving…" : "Save Changes"}<Check size={17}/></button><button type="button" className="secondary-button" onClick={cancelEdit} disabled={saving}>Cancel</button></div>}</form></div>;
}

function Notifications({ onUnreadCount }) {
  const [items, setItems] = useState([]);
  const [unreadCount, setCurrentUnreadCount] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/requests/notifications")
      .then((result) => {
        setItems(result.notifications);
        const count = result.unreadCount ?? result.notifications.filter((item) => !item.read).length;
        setCurrentUnreadCount(count);
        onUnreadCount(count);
      })
      .catch((e) => setError(e.message));
  }, [onUnreadCount]);
  async function markRead(item) {
    try {
      await api(`/requests/notifications/${item._id}/read`, { method: "PATCH" });
      setItems((current) => current.map((notice) => notice._id === item._id ? { ...notice, read: true } : notice));
      if (!item.read) {
        setCurrentUnreadCount((count) => Math.max(0, count - 1));
        onUnreadCount((count) => Math.max(0, count - 1));
      }
    } catch (e) { setError(e.message); }
  }
  return <div className="panel"><div className="panel-title"><div><span className="section-icon"><Bell size={19}/></span><div><h2>Notifications</h2><p>Updates about submissions and approval decisions.</p></div></div></div>{error && <div className="error-note">{error}</div>}{items.length ? items.map((item) => <div className={`notice-row ${item.read ? "" : "unread"}`} key={item._id}><Bell size={17}/><div><b>{item.message}</b><small>{new Date(item.createdAt).toLocaleString("en-IN")}{item.requestId && ` · ${item.requestId}`}</small></div>{!item.read && <button className="text-button" onClick={() => markRead(item)}>Mark read</button>}</div>) : <div className="empty-state">No notifications yet.</div>}</div>;
}

function Feedback({ onNotice }) {
  const [form, setForm] = useState({ category: "Experience", rating: "5", message: "" });
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    try {
      const result = await api("/requests/feedback", { method: "POST", body: form });
      onNotice(result.message);
      setForm({ ...form, message: "" });
      setError("");
    } catch (e) { setError(e.message); }
  }
  return <div className="panel compact-panel"><div className="panel-title"><div><span className="section-icon"><MessageSquareText size={19}/></span><div><h2>Share your feedback</h2><p>Your comments help us improve the permission process.</p></div></div></div><form className="stack-form" onSubmit={submit}><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Experience</option><option>Suggestion</option><option>Issue</option></select></label><label>Rating<select value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label><label>Message<textarea rows="5" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength="2000" required placeholder="Tell us what went well or what could be improved."/></label>{error && <div className="error-note">{error}</div>}<button className="primary-button">Submit feedback<ArrowRight size={17}/></button></form></div>;
}

function Help() {
  const [form, setForm] = useState({ subject: "", message: "" });
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  async function submit(event) {
    event.preventDefault();
    try {
      const result = await api("/requests/support", { method: "POST", body: form });
      setSent(result.message);
      setForm({ subject: "", message: "" });
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  return <div className="content-stack"><div className="panel"><div className="panel-title"><div><span className="section-icon"><CircleHelp size={19}/></span><div><h2>Help & support</h2><p>Quick guidance for submitting and tracking requests.</p></div></div></div>  <div className="faq-list"><details><summary>How does the approval process work?<ChevronDown size={16}/></summary><p>Student submission → Mentor review → HOD review → Mentor final confirmation. Requests cannot skip a stage.</p></details><details><summary>When is a gate pass valid?<ChevronDown size={16}/></summary><p>Only a fully approved Gate Pass marked as requiring gate access is eligible, and only during its requested time window. The live gate endpoint remains disabled until trusted identity verification is integrated.</p></details><details><summary>What if my mentor or HOD is not listed?<ChevronDown size={16}/></summary><p>Mentors and HODs can register in their role portal. Their accounts appear after a college administrator verifies and approves them.</p></details><details><summary>How do I attach supporting documents?<ChevronDown size={16}/></summary><p>Attach a PDF or image no larger than 5 MB when applying. Only request participants can access uploaded files.</p></details></div><div className="support-note"><BookOpen size={19}/><div><b>College support</b><span>Contact your department office for account invitations, class assignments, or account corrections.</span><small>Velalar College of Engineering and Technology · Erode, Tamil Nadu</small></div></div></div><div className="panel compact-panel"><div className="panel-title"><div><span className="section-icon"><MessageSquareText size={19}/></span><div><h2>Send a support request</h2><p>Your message is saved for the college support team.</p></div></div></div><form className="stack-form" onSubmit={submit}><label>Subject<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength="120" required/></label><label>How can we help?<textarea rows="4" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength="2000" required/></label>{error && <div className="error-note">{error}</div>}{sent && <div className="success-note">{sent}</div>}<button className="primary-button">Send support request<ArrowRight size={17}/></button></form></div><div className="panel security-panel"><ShieldCheck size={20}/><div><b>Privacy reminder</b><p>This demo does not perform biometric face recognition. Obtain college authorization and informed consent before adding any biometric system.</p></div></div></div>;
}

export default App;
