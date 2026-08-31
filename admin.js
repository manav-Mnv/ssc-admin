// Constants and Configuration
const KEY_STORE = "ssc_admin_key";

// DOM Selector Helper
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// DOM Elements
const gate = $("#gate");
const app = $("#app");
const gateInput = $("#gateInput");
const gateBtn = $("#gateBtn");
const gateErr = $("#gateErr");

const countEl = $("#count");
const refreshBtn = $("#refreshBtn");
const logoutBtn = $("#logoutBtn");
const exportBtn = $("#exportBtn");
const searchEl = $("#search");

const statTotal = $("#statTotal");
const statEmailProgress = $("#statEmailProgress");
const statEmailRatio = $("#statEmailRatio");
const statUniMail = $("#statUniMail");
const statPersonalMail = $("#statPersonalMail");

const startDispatchBtn = $("#startDispatchBtn");
const queueStatusText = $("#queueStatusText");
const queueProgressFill = $("#queueProgressFill");
const queueProgressPct = $("#queueProgressPct");
const queueProgressCount = $("#queueProgressCount");

const segmentChips = $("#segmentChips");
const activeFilterNote = $("#activeFilterNote");
const tableWrap = $("#tableWrap");

// Modal Elements
const detailModal = $("#detailModal");
const modalCloseBtn = $("#modalCloseBtn");
const modalStudentName = $("#modalStudentName");
const modalStudentEmail = $("#modalStudentEmail");
const modalDataContainer = $("#modalDataContainer");
const modalTabBtns = $$(".modal-tab-btn");

// Application State
let ALL_ROWS = [];
let ACTIVE_SEGMENT = null;
let ACTIVE_DEPARTMENT = null;
let ACTIVE_PAGE = "dashboard";
let ACTIVE_TABLE = "registrations"; // "registrations" or "registrations_backup"
let IS_SUPER_ADMIN = false;
let USER_ROLE = "admin"; // "super_admin" or "admin"
let isDispatching = false;
let stopDispatchFlag = false;

// Pagination State
let CURRENT_PAGE = 1;
let PAGE_SIZE = 50;

// Security & URL Validation Utility
function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "n/a") return null;
  
  // Prevent javascript:, data:, vbscript:, file: protocol attacks
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("file:")) {
    return null;
  }
  
  // If user provided a domain without protocol (e.g. github.com/user), prepend https://
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (_) {}
  
  return null;
}

// Link helper
function hasLink(r, col) {
  return safeUrl(r[col]) !== null;
}

// Segmentation Filters Config
const SEGMENTS = [
  { key: "unsent", label: "Email Pending", test: (r) => !r.email_sent },
  { key: "sent", label: "Email Sent", test: (r) => r.email_sent },
  { key: "ideas", label: "App Ideas Ready", test: (r) => String(r.idea_description || r.app_playground_idea || "").trim().length > 0 },
  { key: "mac", label: "Mac / iPad Access", test: (r) => String(r.mac_access || "").toLowerCase().includes("yes") || String(r.mac_access || "").toLowerCase().includes("mac") || String(r.mac_access || "").toLowerCase().includes("ipad") },
  { key: "competitions", label: "Prior Hackathon Exp", test: (r) => r.previous_competitions === true || r.previous_competitions === "true" || r.previous_competitions === "yes" },
  { key: "github", label: "Has GitHub", test: (r) => hasLink(r, "github_profile") },
  { key: "linkedin", label: "Has LinkedIn", test: (r) => hasLink(r, "linkedin_profile") },
  { key: "web", label: "Has Portfolio", test: (r) => hasLink(r, "portfolio_website") }
];

// Schema Categorization for 39 Columns
const CATEGORIES = {
  personal: [
    "full_name", "email", "contact_number", "faculty_institute", "programme_course", 
    "current_semester_year", "division_batch", "enrollment_number", "student_status", 
    "has_uni_email", "uni_email", "uni_enrollment_id", "personal_email"
  ],
  device: [
    "mac_access", "device_frequency", "needs_mac_lab", "hours_per_week_prep", 
    "app_experience", "apple_experience", "independence_confidence", "interests_improving", 
    "previous_competitions", "competition_details"
  ],
  idea: [
    "why_interested", "has_idea", "idea_description", "excitement_level", 
    "build_interest", "commitment_level", "hours_per_week_program", "work_schedule", 
    "willing_to_attend", "anything_else"
  ],
  developer: [
    "github_profile", "linkedin_profile", "portfolio_website", "email_sent", "created_at"
  ]
};

// Passcode Gate Retrieval
function getKey() {
  return sessionStorage.getItem(KEY_STORE) || "";
}

// Initialization and Login Handling
function showGate(msg) {
  app.classList.add("hidden");
  gate.classList.remove("hidden");
  if (msg) gateErr.textContent = msg;
  gateInput.focus();
}

async function tryUnlock() {
  gateErr.textContent = "Verifying authentication...";
  const passcode = gateInput.value.trim();
  if (!passcode) {
    gateErr.textContent = "Passcode is required.";
    return;
  }

  try {
    const r = await fetch("/api/entries", {
      headers: { "x-admin-key": passcode }
    });
    
    if (r.status === 200) {
      sessionStorage.setItem(KEY_STORE, passcode);
      
      // GSAP Out/In Transition
      const tl = gsap.timeline();
      tl.to(".gate-card", {
        duration: 0.35,
        scale: 0.9,
        opacity: 0,
        y: -25,
        ease: "power2.in"
      });
      tl.call(() => {
        gate.classList.add("hidden");
        app.classList.remove("hidden");
        gsap.set(".gate-card", { scale: 1, opacity: 1, y: 0 });
      });
      tl.fromTo("#app", 
        { opacity: 0, y: 30 },
        { duration: 0.5, opacity: 1, y: 0, ease: "power3.out" }
      );
      
      load();
    } else {
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) {
        gateErr.textContent = "Access denied. Invalid passcode.";
      } else {
        gateErr.textContent = `Database Error (${r.status}): ${data.error || "Unknown server response"}`;
      }
      gsap.fromTo(".gate-card", 
        { x: -10 },
        { duration: 0.35, x: 0, ease: "rough({strength: 2, points: 8, template: linear})" }
      );
    }
  } catch (e) {
    gateErr.textContent = "Connection failed: " + e.message;
  }
}

function logout() {
  sessionStorage.removeItem(KEY_STORE);
  
  const tl = gsap.timeline();
  tl.to("#app", {
    duration: 0.3,
    opacity: 0,
    y: 30,
    ease: "power2.in"
  });
  tl.call(() => {
    app.classList.add("hidden");
    gate.classList.remove("hidden");
    gateInput.value = "";
    gateErr.textContent = "";
  });
  tl.fromTo(".gate-card",
    { scale: 0.9, opacity: 0 },
    { duration: 0.4, scale: 1, opacity: 1, ease: "power3.out" }
  );
}

// Update UI aesthetics and permissions based on user role
function applyRoleUI(isSuper, role) {
  IS_SUPER_ADMIN = !!isSuper;
  USER_ROLE = role || (isSuper ? "super_admin" : "admin");

  const sidebarRoleEl = $("#sidebarUserRole");
  const sidebarAvatarEl = $("#sidebarUserAvatar");
  const sidebarUserCard = $("#sidebarUserCard");
  const deleteAllBtn = $("#deleteAllBtn");
  const queueRoleLockBadge = $("#queueRoleLockBadge");
  const startDispatchBtn = $("#startDispatchBtn");
  const queueStatusText = $("#queueStatusText");

  // Backup & Archive Super Admin controls
  const navTabBackupArchive = $("#navTabBackupArchive");
  const sourceTableSwitcherRow = $("#sourceTableSwitcherRow");
  const backupBtn = $("#backupBtn");
  const supabaseSnapshotBtn = $("#supabaseSnapshotBtn");

  if (IS_SUPER_ADMIN) {
    if (sidebarRoleEl) {
      sidebarRoleEl.innerHTML = `👑 Super Admin`;
      sidebarRoleEl.className = "sidebar-user-role role-super";
    }
    if (sidebarAvatarEl) {
      sidebarAvatarEl.classList.add("avatar-super");
    }
    if (sidebarUserCard) {
      sidebarUserCard.classList.add("card-super");
    }
    if (deleteAllBtn) {
      deleteAllBtn.style.display = "inline-flex";
    }
    if (queueRoleLockBadge) {
      queueRoleLockBadge.classList.add("hidden");
    }
    if (startDispatchBtn && !isDispatching) {
      startDispatchBtn.removeAttribute("title");
    }

    // Super Admin: Enable Backup tools
    if (navTabBackupArchive) navTabBackupArchive.style.display = "flex";
    if (sourceTableSwitcherRow) sourceTableSwitcherRow.style.display = "flex";
    if (backupBtn) backupBtn.style.display = "inline-flex";
    if (supabaseSnapshotBtn) supabaseSnapshotBtn.style.display = "inline-flex";
  } else {
    if (sidebarRoleEl) {
      sidebarRoleEl.innerHTML = `👤 Admin (Reviewer)`;
      sidebarRoleEl.className = "sidebar-user-role role-reviewer";
    }
    if (sidebarAvatarEl) {
      sidebarAvatarEl.classList.remove("avatar-super");
    }
    if (sidebarUserCard) {
      sidebarUserCard.classList.remove("card-super");
    }
    // Reviewer: Hide Delete All button completely from Danger Zone
    if (deleteAllBtn) {
      deleteAllBtn.style.display = "none";
    }
    // Reviewer: Show locked badge in Email Dispatcher
    if (queueRoleLockBadge) {
      queueRoleLockBadge.classList.remove("hidden");
    }
    if (startDispatchBtn && !isDispatching) {
      startDispatchBtn.setAttribute("disabled", "true");
      startDispatchBtn.setAttribute("title", "Super Admin authorization required to dispatch emails");
      startDispatchBtn.innerHTML = `
        <span>Locked</span>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      `;
    }
    if (queueStatusText && !isDispatching) {
      queueStatusText.textContent = "🔒 Email dispatching is reserved for Super Admin.";
    }

    // Reviewer: Hide all Backup Archive and Snapshot tools
    if (navTabBackupArchive) navTabBackupArchive.style.display = "none";
    if (sourceTableSwitcherRow) sourceTableSwitcherRow.style.display = "none";
    if (backupBtn) backupBtn.style.display = "none";
    if (supabaseSnapshotBtn) supabaseSnapshotBtn.style.display = "none";

    // Safety fallback: if currently pointed to backup table, force revert to live registrations
    if (ACTIVE_TABLE === "registrations_backup") {
      ACTIVE_TABLE = "registrations";
    }
  }
}

// Fetch Registrations Data (Live Direct Sync)
async function load(isSilent = false, isManual = false) {
  const isBackupView = ACTIVE_TABLE === "registrations_backup";
  const syncButtons = [$("#topbarSyncBtn"), $("#overviewRefreshBtn"), $("#refreshBtn")].filter(Boolean);
  
  // Activate spinning animation on all refresh buttons
  syncButtons.forEach(btn => btn.classList.add("syncing"));

  if (!isSilent) {
    tableWrap.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>${isBackupView ? "Syncing immutable backup archive from public.registrations_backup..." : "Syncing live submissions directly from Supabase..."}</p>
      </div>
    `;
  }
  
  try {
    // Add cache-busting timestamp to bypass any intermediate caching
    const basePath = isBackupView ? "/api/entries?source=backup" : "/api/entries";
    const cacheBuster = `_t=${Date.now()}`;
    const url = basePath.includes("?") ? `${basePath}&${cacheBuster}` : `${basePath}?${cacheBuster}`;

    const r = await fetch(url, {
      headers: { "x-admin-key": getKey() }
    });
    
    if (r.status === 401) {
      showGate("Session expired. Please re-authenticate.");
      return;
    }
    
    const data = await r.json();
    if (!data.rows) throw new Error(data.error || "Malformed API response");
    
    applyRoleUI(data.is_super_admin, data.role);
    
    ALL_ROWS = data.rows;
    const totalCount = data.count !== undefined ? data.count : data.rows.length;
    countEl.textContent = totalCount;
    
    calculateMetrics(data.rows);
    updateFacultyBreakdown(data.rows);
    renderTable(searchEl.value);
    renderSegments(data.rows);

    // Update Live Sync timestamp banner
    const lastSyncedEl = $("#lastSyncedTime");
    if (lastSyncedEl) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      lastSyncedEl.textContent = `Last updated: ${timeStr} · ${totalCount} records`;
    }

    if (isManual) {
      const toast = document.createElement("div");
      toast.style.cssText = "position:fixed;bottom:24px;right:24px;background:#0f172a;color:#f8fafc;border:1px solid rgba(255,255,255,0.1);border-left:3px solid var(--accent-emerald);padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;z-index:99999;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;";
      toast.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="var(--accent-emerald)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> <span>Live sync complete: ${totalCount} registrations</span>`;
      document.body.appendChild(toast);
      gsap.fromTo(toast, { opacity: 0, y: 12 }, { duration: 0.25, opacity: 1, y: 0, ease: "power2.out" });
      setTimeout(() => gsap.to(toast, { duration: 0.25, opacity: 0, y: 8, onComplete: () => toast.remove() }), 2800);
    }
  } catch (e) {
    tableWrap.innerHTML = `
      <div class="loading-state">
        <span style="color:var(--swift);font-size:24px;">⚠</span>
        <p>Failed to sync database: ${esc(e.message)}</p>
        <button onclick="load(false, true)" class="btn btn-secondary btn-sm" style="margin-top:10px;">Retry Connect</button>
      </div>
    `;
    const lastSyncedEl = $("#lastSyncedTime");
    if (lastSyncedEl) {
      lastSyncedEl.innerHTML = `<span style="color:#ef4444;">Sync Error: ${esc(e.message)}</span>`;
    }
  } finally {
    // Remove spinning animation
    setTimeout(() => {
      syncButtons.forEach(btn => btn.classList.remove("syncing"));
    }, 400);
  }
}

// Compute Metrics Stats
function calculateMetrics(rows) {
  const total = rows.length;
  statTotal.textContent = total;

  // 1. Email Send Status
  const sentCount = rows.filter(r => r.email_sent).length;
  const unsentCount = total - sentCount;
  const pct = total ? Math.round((sentCount / total) * 100) : 0;
  
  statEmailProgress.textContent = `${pct}%`;
  statEmailRatio.textContent = `${sentCount} sent / ${unsentCount} pending`;

  // Update Email Queue Manager UI
  if (!isDispatching) {
    queueProgressFill.style.width = `${pct}%`;
    queueProgressPct.textContent = `${pct}% dispatched`;
    queueProgressCount.textContent = `${sentCount} / ${total} emails sent`;
    
    if (!IS_SUPER_ADMIN) {
      queueStatusText.textContent = `🔒 ${unsentCount} pending email${unsentCount === 1 ? '' : 's'}. (Super Admin authorization required to dispatch).`;
      startDispatchBtn.setAttribute("disabled", "true");
      startDispatchBtn.setAttribute("title", "Super Admin authorization required to dispatch emails");
      startDispatchBtn.innerHTML = `
        <span>Locked</span>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      `;
    } else if (unsentCount > 0) {
      queueStatusText.textContent = `Queue holds ${unsentCount} pending email${unsentCount > 1 ? 's' : ''}.`;
      startDispatchBtn.removeAttribute("disabled");
      startDispatchBtn.removeAttribute("title");
      startDispatchBtn.innerHTML = `
        <span>Start Dispatch</span>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      `;
    } else {
      queueStatusText.textContent = "Email queue is completely empty!";
      startDispatchBtn.setAttribute("disabled", "true");
      startDispatchBtn.removeAttribute("title");
      startDispatchBtn.innerHTML = `
        <span>All Sent</span>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
      `;
    }
  }

  // 2. University vs Personal email metrics
  let uniMailCount = 0;
  let personalMailCount = 0;
  
  rows.forEach(r => {
    if (r.has_uni_email === true || r.has_uni_email === "true") {
      uniMailCount++;
    } else {
      personalMailCount++;
    }
  });

  if (statUniMail) statUniMail.textContent = uniMailCount;
  if (statPersonalMail) statPersonalMail.textContent = personalMailCount;

  // 3. Render Segments Filters
  renderSegments(rows);
}

// Generate Segment Chips Filters
function renderSegments(rows) {
  const counts = {};
  SEGMENTS.forEach((s) => {
    counts[s.key] = rows.filter(s.test).length;
  });

  segmentChips.innerHTML = SEGMENTS.map((s) => {
    const activeClass = ACTIVE_SEGMENT === s.key ? " active" : "";
    return `
      <button class="chip${activeClass}" data-seg="${esc(s.key)}">
        <span class="chip-label">${esc(s.label)}</span>
        <span class="chip-count">${counts[s.key]}</span>
      </button>
    `;
  }).join("");

  segmentChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.getAttribute("data-seg");
      ACTIVE_SEGMENT = ACTIVE_SEGMENT === key ? null : key;
      CURRENT_PAGE = 1;
      updateFilterNote();
      renderTable(searchEl.value);
    });
  });
}

function updateFilterNote() {
  if (ACTIVE_TABLE === "registrations_backup") {
    activeFilterNote.innerHTML = `
      <span style="color:#0284c7;display:inline-flex;align-items:center;gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Viewing <strong>Immutable Backup Archive (public.registrations_backup)</strong></span>
      <button class="link-btn" id="returnToLiveBtn" style="color:#0284c7;font-weight:700;">Switch to Live Submissions</button>
    `;
    activeFilterNote.classList.remove("hidden");
    const returnBtn = $("#returnToLiveBtn");
    if (returnBtn) {
      returnBtn.addEventListener("click", () => switchPage("all"));
    }
    return;
  }

  if (ACTIVE_DEPARTMENT === "ideas") {
    activeFilterNote.innerHTML = `
      <span style="color:var(--swift);display:inline-flex;align-items:center;gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M12 2a6 6 0 0 1 6 6c0 2.22-1.21 4.15-3 5.19V16a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2.81C7.21 12.15 6 10.22 6 8a6 6 0 0 1 6-6z"></path><path d="M9 21h6"></path></svg> Viewing <strong>App Idea Submissions (Enrollment & Project Concepts)</strong></span>
      <button class="link-btn" id="viewAllSubmissionsBtn" style="color:var(--swift);font-weight:700;">Show All Submissions</button>
    `;
    activeFilterNote.classList.remove("hidden");
    const viewAllBtn = $("#viewAllSubmissionsBtn");
    if (viewAllBtn) {
      viewAllBtn.addEventListener("click", () => switchPage("all"));
    }
    return;
  }

  if (!ACTIVE_SEGMENT) {
    activeFilterNote.textContent = "";
    activeFilterNote.classList.add("hidden");
    return;
  }
  const seg = SEGMENTS.find((s) => s.key === ACTIVE_SEGMENT);
  if (!seg) return;
  activeFilterNote.innerHTML = `
    <span>Active Filter: Segmenting registrations matching <strong>${esc(seg.label)}</strong></span>
    <button class="link-btn" id="clearSegBtn">Reset Filter</button>
  `;
  activeFilterNote.classList.remove("hidden");
  
  const clearBtn = $("#clearSegBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      ACTIVE_SEGMENT = null;
      CURRENT_PAGE = 1;
      updateFilterNote();
      renderTable(searchEl.value);
    });
  }
}

// Array & Value Formatter Helper
function parseArrayField(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    if (val.includes(",")) {
      return val.split(",").map(s => s.trim()).filter(Boolean);
    }
    return [val.trim()];
  }
  return [String(val)];
}

function renderFormattedValue(key, value) {
  if (value === null || value === undefined || value === "") {
    return `<span class="empty">N/A (Not Provided)</span>`;
  }

  // Boolean fields
  if (typeof value === "boolean" || value === "true" || value === "false") {
    const isTrue = value === true || value === "true";
    return `<span class="status-indicator ${isTrue ? 'sent' : 'unsent'}"><span class="status-dot"></span><span>${isTrue ? 'Yes / Confirmed' : 'No'}</span></span>`;
  }

  // Array fields
  const isArrayField = Array.isArray(value) || 
    key === "interests_improving" || 
    key === "excitement_level" || 
    key === "build_interest" || 
    key === "work_schedule";

  if (isArrayField) {
    const items = parseArrayField(value);
    if (!items.length) return `<span class="empty">None selected</span>`;
    const colorClasses = ["", "blue", "purple", "green"];
    return `
      <div class="tag-chip-container">
        ${items.map((item, idx) => `
          <span class="tag-chip ${colorClasses[idx % colorClasses.length]}">${esc(item)}</span>
        `).join("")}
      </div>
    `;
  }

  // Links & URLs
  const validLink = safeUrl(value);
  if (validLink) {
    return `<a href="${esc(validLink)}" target="_blank" rel="noopener noreferrer" style="color:var(--swift);text-decoration:underline;">${esc(String(value))} ↗</a>`;
  }

  return esc(String(value));
}

// Application Reference Code Helper
function getRefCode(r) {
  if (!r) return "";
  if (r.id) {
    return `#SSC27-${String(r.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }
  return "#SSC27-PENDING";
}

// Get Filtered Rows based on search, department, and segment
function getFilteredRows(query) {
  const q = (query || "").trim().toLowerCase();
  const cleanQ = q.replace(/^#?ssc27-?/i, "");
  
  return ALL_ROWS.filter((r) => {
    if (q) {
      const ref = getRefCode(r).toLowerCase();
      const match = (
        ref.includes(q) ||
        ref.includes(cleanQ) ||
        String(r.id || "").toLowerCase().includes(cleanQ) ||
        String(r.full_name || "").toLowerCase().includes(q) ||
        String(r.email || "").toLowerCase().includes(q) ||
        String(r.personal_email || "").toLowerCase().includes(q) ||
        String(r.uni_email || "").toLowerCase().includes(q) ||
        String(r.contact_number || "").toLowerCase().includes(q) ||
        String(r.enrollment_number || r.enrollment_id || "").toLowerCase().includes(q) ||
        String(r.faculty_institute || "").toLowerCase().includes(q) ||
        String(r.programme_course || "").toLowerCase().includes(q) ||
        String(r.student_status || "").toLowerCase().includes(q) ||
        String(r.idea_description || "").toLowerCase().includes(q)
      );
      if (!match) return false;
    }

    if (ACTIVE_DEPARTMENT) {
      if (ACTIVE_DEPARTMENT === "uni-mail") {
        if (!(r.has_uni_email === true || r.has_uni_email === "true")) return false;
      } else if (ACTIVE_DEPARTMENT === "personal-mail") {
        if (r.has_uni_email === true || r.has_uni_email === "true") return false;
      } else if (ACTIVE_DEPARTMENT === "ideas") {
        const ideaText = String(r.idea_description || r.app_playground_idea || "").trim();
        if (ideaText.length === 0) return false;
      }
    }

    if (ACTIVE_SEGMENT) {
      const seg = SEGMENTS.find((s) => s.key === ACTIVE_SEGMENT);
      if (seg && !seg.test(r)) return false;
    }

    return true;
  });
}

// High-Performance Table Renderer with Pagination
function renderTable(query) {
  const filtered = getFilteredRows(query);
  const totalFiltered = filtered.length;

  if (totalFiltered === 0) {
    tableWrap.innerHTML = `
      <div class="loading-state">
        <span style="font-size:24px;">🔍</span>
        <p>${query || ACTIVE_SEGMENT || ACTIVE_DEPARTMENT ? "No registration matches found for current filter." : "No records recorded in database."}</p>
      </div>
    `;
    return;
  }

  const effectivePageSize = PAGE_SIZE === "all" ? totalFiltered : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / effectivePageSize));
  
  if (CURRENT_PAGE > totalPages) CURRENT_PAGE = totalPages;
  if (CURRENT_PAGE < 1) CURRENT_PAGE = 1;

  const startIndex = (CURRENT_PAGE - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, totalFiltered);
  const pageRows = filtered.slice(startIndex, endIndex);
  const isIdeasView = ACTIVE_DEPARTMENT === "ideas";

  let html = `
    <div class="table-scroll-wrap">
      ${isIdeasView ? `
        <div class="ideas-view-banner">
          <div class="ideas-view-title">
            <span class="ideas-badge">💡 App Idea Submissions</span>
            <span class="ideas-count-text">${totalFiltered} student project idea${totalFiltered === 1 ? '' : 's'}</span>
          </div>
          <div class="ideas-hint">Focused view: Click any idea submission to inspect candidate profile & developer links.</div>
        </div>
      ` : ''}
      <table class="entries ${isIdeasView ? 'entries-ideas' : ''}">
        <thead>
          ${isIdeasView ? `
            <tr>
              <th style="width: 45px;">#</th>
              <th style="width: 170px;">Enrollment No.</th>
              <th style="width: 220px;">Candidate</th>
              <th style="width: 210px;">Faculty & Course</th>
              <th>App Playground Idea & Description</th>
              <th style="width: 140px;">Mac Access</th>
              <th style="width: 50px;"></th>
            </tr>
          ` : `
            <tr>
              <th style="width: 45px;">#</th>
              <th style="min-width: 240px;">Candidate</th>
              <th style="min-width: 170px;">Enrollment No.</th>
              <th style="min-width: 210px;">Faculty & Course</th>
              <th style="min-width: 160px;">Phone & Mac</th>
              <th style="min-width: 120px;">Email Status</th>
              <th style="width: 50px;"></th>
            </tr>
          `}
        </thead>
        <tbody>
  `;

  pageRows.forEach((r) => {
    const idx = ALL_ROWS.indexOf(r) + 1;
    const dateStr = fmtDate(r.created_at);
    const isSent = r.email_sent;
    const enrollNo = r.enrollment_number || r.enrollment_id || "—";
    const studentName = r.full_name || "N/A";
    const studentEmail = r.email || "";
    const rawIdea = String(r.idea_description || r.app_playground_idea || "").trim();
    const macRaw = String(r.mac_access || "").trim() || "—";
    const phone = r.contact_number || "—";
    const course = r.programme_course || "—";
    const sem = r.current_semester_year ? `Sem ${r.current_semester_year}` : "";

    const fac = (r.faculty_institute || "Other").trim();
    let facClass = "faculty-pill";
    if (fac.toUpperCase().includes("PIET")) facClass += " piet";
    else if (fac.toUpperCase().includes("PIT")) facClass += " pit";

    const hasUni = r.has_uni_email === true || r.has_uni_email === "true";
    const emailTypeTag = hasUni
      ? `<span class="email-mini-tag uni" title="University Email">🎓 Uni</span>`
      : `<span class="email-mini-tag personal" title="Personal Email">📧 Personal</span>`;

    if (isIdeasView) {
      html += `
        <tr class="row row-idea" data-id="${esc(r.id || idx)}">
          <td style="color:var(--text-secondary);font-size:12px;">${idx}</td>
          <td class="enrollment-cell" style="font-size:13.5px;font-weight:700;color:var(--swift);letter-spacing:0.4px;">
            ${esc(enrollNo)}
          </td>
          <td>
            <div class="name-cell">${esc(studentName)}</div>
            <div class="email-cell">${esc(studentEmail)}</div>
          </td>
          <td>
            <div><span class="${facClass}">${esc(fac)}</span></div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">${esc(course)}</div>
          </td>
          <td style="white-space:normal;min-width:300px;padding:12px 16px;">
            <div class="idea-text-box">
              <span class="idea-quote-mark">“</span>
              <span class="idea-full-text">${esc(rawIdea || "No description provided.")}</span>
              <span class="idea-quote-mark">”</span>
            </div>
          </td>
          <td><span class="mac-pill">${esc(macRaw)}</span></td>
          <td><span class="chevy-btn" title="View details">▶</span></td>
        </tr>
      `;
    } else {
      html += `
        <tr class="row" data-id="${esc(r.id || idx)}">
          <td style="color:var(--text-secondary);font-size:12px;">${idx}</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="name-cell">${esc(studentName)}</span>
              <span class="ref-code-badge" style="font-family:monospace;font-size:11px;background:rgba(240,81,56,0.1);color:#f05138;padding:1px 6px;border-radius:4px;font-weight:700;border:1px solid rgba(240,81,56,0.25);" title="Application Reference Code">${esc(getRefCode(r))}</span>
              ${emailTypeTag}
            </div>
            <div class="email-cell" style="margin-top:2px;">${esc(studentEmail)}</div>
          </td>
          <td class="enrollment-cell" style="font-weight:700;color:var(--swift);letter-spacing:0.4px;">
            ${esc(enrollNo)}
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="${facClass}">${esc(fac)}</span>
              ${sem ? `<span style="font-size:11.5px;color:var(--text-secondary);font-weight:500;">${esc(sem)}</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">${esc(course)}</div>
          </td>
          <td>
            <div style="font-size:12.5px;font-weight:600;letter-spacing:0.3px;color:var(--text-primary);">${esc(phone)}</div>
            <div style="margin-top:3px;"><span class="mac-pill" style="font-size:11px;padding:2px 7px;">${esc(macRaw)}</span></div>
          </td>
          <td>
            <span class="status-indicator ${isSent ? 'sent' : 'unsent'}">
              <span class="status-dot"></span>
              <span>${isSent ? 'Sent' : 'Pending'}</span>
            </span>
          </td>
          <td><span class="chevy-btn" title="View full 39 fields">▶</span></td>
        </tr>
      `;
    }
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  // Pagination Footer Bar
  html += `
    <div class="pagination-wrap">
      <div class="pagination-info">
        Showing <strong>${startIndex + 1}</strong>–<strong>${endIndex}</strong> of <strong>${totalFiltered}</strong> registrations
      </div>
      <div class="pagination-size-wrap">
        <span>Rows per page:</span>
        <select id="pageSizeSelect" class="page-size-select">
          <option value="25" ${PAGE_SIZE === 25 ? 'selected' : ''}>25</option>
          <option value="50" ${PAGE_SIZE === 50 ? 'selected' : ''}>50</option>
          <option value="100" ${PAGE_SIZE === 100 ? 'selected' : ''}>100</option>
          <option value="250" ${PAGE_SIZE === 250 ? 'selected' : ''}>250</option>
          <option value="all" ${PAGE_SIZE === "all" ? 'selected' : ''}>All (${totalFiltered})</option>
        </select>
      </div>
      <div class="pagination-controls">
        <button class="page-btn" id="firstPageBtn" ${CURRENT_PAGE === 1 ? 'disabled' : ''} title="First Page">«</button>
        <button class="page-btn" id="prevPageBtn" ${CURRENT_PAGE === 1 ? 'disabled' : ''} title="Previous Page">‹</button>
        <span class="page-indicator-text">Page ${CURRENT_PAGE} of ${totalPages}</span>
        <button class="page-btn" id="nextPageBtn" ${CURRENT_PAGE === totalPages ? 'disabled' : ''} title="Next Page">›</button>
        <button class="page-btn" id="lastPageBtn" ${CURRENT_PAGE === totalPages ? 'disabled' : ''} title="Last Page">»</button>
      </div>
    </div>
  `;

  tableWrap.innerHTML = html;

  // Attach row click listeners for inline expansion
  tableWrap.querySelectorAll("tr.row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = tr.getAttribute("data-id");
      const row = ALL_ROWS.find(r => String(r.id || (ALL_ROWS.indexOf(r) + 1)) === id);
      if (row) toggleDetailRow(tr, row);
    });
  });

  // Attach pagination control listeners
  const pageSizeSelect = $("#pageSizeSelect");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      PAGE_SIZE = val === "all" ? "all" : parseInt(val, 10);
      CURRENT_PAGE = 1;
      renderTable(searchEl.value);
    });
  }

  const firstBtn = $("#firstPageBtn");
  const prevBtn = $("#prevPageBtn");
  const nextBtn = $("#nextPageBtn");
  const lastBtn = $("#lastPageBtn");

  if (firstBtn) firstBtn.addEventListener("click", () => { CURRENT_PAGE = 1; renderTable(searchEl.value); });
  if (prevBtn) prevBtn.addEventListener("click", () => { if (CURRENT_PAGE > 1) { CURRENT_PAGE--; renderTable(searchEl.value); } });
  if (nextBtn) nextBtn.addEventListener("click", () => { if (CURRENT_PAGE < totalPages) { CURRENT_PAGE++; renderTable(searchEl.value); } });
  if (lastBtn) lastBtn.addEventListener("click", () => { CURRENT_PAGE = totalPages; renderTable(searchEl.value); });
}

// Collapsible Detail Row System (Inline Accordion with 39-column Support)
function toggleDetailRow(tr, row) {
  const existing = tr.nextElementSibling;
  if (existing && existing.classList.contains("detail-row")) {
    const wrapper = existing.querySelector(".detail-content-wrapper");
    gsap.to(wrapper, {
      duration: 0.25,
      height: 0,
      opacity: 0,
      ease: "power2.in",
      onComplete: () => {
        existing.remove();
        tr.classList.remove("open");
      }
    });
    return;
  }
  
  // Close any open detail rows
  $$("tr.detail-row").forEach((openRow) => {
    const prev = openRow.previousElementSibling;
    if (prev) prev.classList.remove("open");
    openRow.remove();
  });
  
  const isIdeasView = ACTIVE_DEPARTMENT === "ideas";
  const colspan = isIdeasView ? 7 : 14;
  let inlineTab = isIdeasView ? "idea" : "all";

  const detailRow = document.createElement("tr");
  detailRow.className = "detail-row";
  
  detailRow.innerHTML = `
    <td colspan="${colspan}">
      <div class="detail-content-wrapper" style="height: 0; opacity: 0;">
        <div class="detail-inner glass-card">
          <div class="detail-action-bar" style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <span class="ref-code-badge" style="font-family:monospace;font-size:12px;background:rgba(240,81,56,0.15);color:#f05138;padding:3px 8px;border-radius:5px;font-weight:700;border:1px solid rgba(240,81,56,0.3);">
                ${esc(getRefCode(row))}
              </span>
              <span class="status-indicator ${row.email_sent ? 'sent' : 'unsent'}">
                <span class="status-dot"></span>
                <span>${row.email_sent ? 'Email Sent' : 'Queue Pending'}</span>
              </span>
              <span style="font-size:12.5px;color:var(--text-secondary);">Direct Recipient: <strong style="color:var(--text-primary);">${esc(row.email)}</strong></span>
            </div>
            <button class="btn btn-sm direct-send-email-btn" data-id="${esc(row.id)}" style="background:rgba(240,81,56,0.14);color:#f05138;border:1px solid rgba(240,81,56,0.3);display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;padding:6px 12px;border-radius:7px;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <span>${row.email_sent ? 'Resend Confirmation' : 'Send Confirmation Now'}</span>
            </button>
          </div>
          <div class="detail-tabs">
            <button class="detail-tab-btn ${inlineTab === 'all' ? 'active' : ''}" data-tab="all">All 39 Fields</button>
            <button class="detail-tab-btn" data-tab="personal">Personal & Academic</button>
            <button class="detail-tab-btn" data-tab="device">Device & Experience</button>
            <button class="detail-tab-btn ${inlineTab === 'idea' ? 'active' : ''}" data-tab="idea">App Idea & Motivation</button>
            <button class="detail-tab-btn" data-tab="developer">Developer Profiles</button>
          </div>
          <div class="detail-body-container">
            <!-- Dynamically populated -->
          </div>
        </div>
      </div>
    </td>
  `;
  
  tr.parentNode.insertBefore(detailRow, tr.nextSibling);
  tr.classList.add("open");
  
  const directSendBtn = detailRow.querySelector(".direct-send-email-btn");
  if (directSendBtn) {
    directSendBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await triggerDirectEmail(row, directSendBtn);
    });
  }
  
  const wrapper = detailRow.querySelector(".detail-content-wrapper");
  const container = detailRow.querySelector(".detail-body-container");
  const tabBtns = detailRow.querySelectorAll(".detail-tab-btn");
  
  function renderInlineData() {
    let html = "";
    
    if (inlineTab === "developer") {
      const github = safeUrl(row.github_profile);
      const linkedin = safeUrl(row.linkedin_profile);
      const portfolio = safeUrl(row.portfolio_website);
      
      html = `
        <div class="inline-data-grid">
          <div class="links-panel span-2">
            <h4 class="section-subtitle">Verified Developer Portfolios & Social Links</h4>
            <div class="links-grid" style="margin-top:12px;">
              ${github ? `
                <a href="${esc(github)}" target="_blank" rel="noopener noreferrer" class="link-card github">
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                  <span>GitHub Profile ↗</span>
                </a>
              ` : ''}
              ${linkedin ? `
                <a href="${esc(linkedin)}" target="_blank" rel="noopener noreferrer" class="link-card linkedin">
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                  <span>LinkedIn Profile ↗</span>
                </a>
              ` : ''}
              ${portfolio ? `
                <a href="${esc(portfolio)}" target="_blank" rel="noopener noreferrer" class="link-card portfolio">
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                  <span>Portfolio Website ↗</span>
                </a>
              ` : ''}
              ${!github && !linkedin && !portfolio ? '<div style="color:var(--text-muted);font-size:13.5px;font-style:italic;padding:10px 0;">No portfolio or profile links provided.</div>' : ''}
            </div>
          </div>
        </div>
      `;
    } else {
      const keys = Object.keys(row);
      let itemsHtml = "";
      
      keys.forEach((key) => {
        if (key === "id") return;
        
        // Tab-specific filters
        if (inlineTab === "personal" && !CATEGORIES.personal.includes(key)) return;
        if (inlineTab === "device" && !CATEGORIES.device.includes(key)) return;
        if (inlineTab === "idea" && !CATEGORIES.idea.includes(key)) return;
        
        const value = row[key];
        const displayVal = renderFormattedValue(key, value);
        
        const isLongText = key.toLowerCase().includes('idea') || 
                           key.toLowerCase().includes('description') || 
                           key.toLowerCase().includes('why_') || 
                           key.toLowerCase().includes('anything_') ||
                           key.toLowerCase().includes('detail') ||
                           Array.isArray(value);
                           
        const spanClass = isLongText ? "modal-item span-2" : "modal-item";
        const prettyLabel = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        
        itemsHtml += `
          <div class="${spanClass}">
            <span class="modal-label">${esc(prettyLabel)}</span>
            <div class="modal-value">${displayVal}</div>
          </div>
        `;
      });
      
      html = `<div class="inline-data-grid">${itemsHtml}</div>`;
    }
    
    container.innerHTML = html;
  }
  
  renderInlineData();
  
  gsap.to(wrapper, {
    duration: 0.35,
    height: "auto",
    opacity: 1,
    ease: "power2.out"
  });
  
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      inlineTab = btn.getAttribute("data-tab");
      renderInlineData();
    });
  });
}

// Update Faculty & Department Breakdown Cards
function updateFacultyBreakdown(rows) {
  const total = rows.length;
  let uniCount = 0;
  let personalCount = 0;
  let ideasCount = 0;
  let sentCount = 0;
  
  rows.forEach(r => {
    if (r.has_uni_email === true || r.has_uni_email === "true") {
      uniCount++;
    } else {
      personalCount++;
    }
    const ideaText = String(r.idea_description || r.app_playground_idea || "").trim();
    if (ideaText.length > 0) {
      ideasCount++;
    }
    if (r.email_sent === true || r.email_sent === "true") {
      sentCount++;
    }
  });
  
  const uniPct = total ? Math.round((uniCount / total) * 100) : 0;
  const personalPct = total ? Math.round((personalCount / total) * 100) : 0;
  const ideasPct = total ? Math.round((ideasCount / total) * 100) : 0;
  const sentPct = total ? Math.round((sentCount / total) * 100) : 0;
  
  const deptIdeasCount = $("#deptIdeasCount");
  const deptIdeasProgress = $("#deptIdeasProgress");
  const deptIdeasPct = $("#deptIdeasPct");

  const deptPietCount = $("#deptPietCount");
  const deptPietProgress = $("#deptPietProgress");
  const deptPietPct = $("#deptPietPct");
  
  const deptPitCount = $("#deptPitCount");
  const deptPitProgress = $("#deptPitProgress");
  const deptPitPct = $("#deptPitPct");
  
  const deptOtherCount = $("#deptOtherCount");
  const deptOtherProgress = $("#deptOtherProgress");
  const deptOtherPct = $("#deptOtherPct");

  if (deptIdeasCount) deptIdeasCount.textContent = ideasCount;
  if (deptIdeasProgress) deptIdeasProgress.style.width = `${ideasPct}%`;
  if (deptIdeasPct) deptIdeasPct.textContent = `${ideasPct}% with ideas (${ideasCount}/${total})`;
  
  if (deptPietCount) deptPietCount.textContent = uniCount;
  if (deptPietProgress) deptPietProgress.style.width = `${uniPct}%`;
  if (deptPietPct) deptPietPct.textContent = `${uniPct}% official uni emails (${uniCount}/${total})`;
  
  if (deptPitCount) deptPitCount.textContent = personalCount;
  if (deptPitProgress) deptPitProgress.style.width = `${personalPct}%`;
  if (deptPitPct) deptPitPct.textContent = `${personalPct}% personal emails (${personalCount}/${total})`;
  
  if (deptOtherCount) deptOtherCount.textContent = total;
  if (deptOtherProgress) deptOtherProgress.style.width = `${sentPct}%`;
  if (deptOtherPct) deptOtherPct.textContent = total === 0 ? "0 submissions" : `${sentCount} of ${total} confirmed (${sentPct}%)`;
}

// Direct Single-Student Email Dispatch Handler
async function triggerDirectEmail(row, btn) {
  if (!IS_SUPER_ADMIN) {
    alert("Super Admin passcode required to dispatch automated emails.");
    return;
  }

  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none" class="spin-hover" style="animation:spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
    <span>Sending to ${esc(row.email || "recipient")}...</span>
  `;

  try {
    const response = await fetch("/api/send-emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": getKey()
      },
      body: JSON.stringify({ id: row.id })
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.error || `HTTP ${response.status}`);
    }

    btn.innerHTML = `<span>✔ Email Sent Successfully!</span>`;
    btn.style.background = "rgba(16, 185, 129, 0.15)";
    btn.style.color = "#10b981";
    btn.style.borderColor = "rgba(16, 185, 129, 0.35)";

    // Refresh rows silently
    await load(true);
  } catch (err) {
    alert(`Email dispatch failed: ${err.message}`);
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

// Batch Email Dispatch Loop
async function startDispatch() {
  if (!IS_SUPER_ADMIN) {
    alert("Unauthorized: Only Super Admin can dispatch automated emails.");
    return;
  }

  if (isDispatching) {
    stopDispatchFlag = true;
    startDispatchBtn.setAttribute("disabled", "true");
    queueStatusText.textContent = "Pausing dispatch queue after current batch...";
    return;
  }

  const unsentCount = ALL_ROWS.filter(r => !r.email_sent).length;
  if (unsentCount === 0) return;

  isDispatching = true;
  stopDispatchFlag = false;
  
  startDispatchBtn.innerHTML = `
    <span>Pause Queue</span>
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
  `;
  startDispatchBtn.classList.remove("btn-primary");
  startDispatchBtn.classList.add("btn-secondary");
  
  let processed = 0;
  const totalCount = ALL_ROWS.length;
  queueStatusText.textContent = `Processing batch sends... Keep dashboard window open.`;

  while (isDispatching && !stopDispatchFlag) {
    try {
      const response = await fetch("/api/send-emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": getKey()
        },
        body: JSON.stringify({ batchSize: 5 })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const resData = await response.json();
      processed += (resData.sent || resData.processed || 0);

      // Silently sync database
      await load(true);

      const currentUnsent = ALL_ROWS.filter(r => !r.email_sent).length;
      const sentCount = totalCount - currentUnsent;
      const localPct = totalCount ? Math.round((sentCount / totalCount) * 100) : 0;

      queueProgressFill.style.width = `${localPct}%`;
      queueProgressPct.textContent = `${localPct}% processed`;
      queueProgressCount.textContent = `${sentCount} / ${totalCount} emails sent`;
      queueStatusText.textContent = `Dispatched batch successfully. Remaining unsent queue: ${currentUnsent}`;

      if (resData.processed === 0 || currentUnsent === 0) {
        queueStatusText.textContent = "All email queue jobs completed successfully!";
        gsap.fromTo(".queue-manager", 
          { boxShadow: "0 0 0 rgba(48, 209, 88, 0)" },
          { duration: 0.6, boxShadow: "0 0 20px rgba(48, 209, 88, 0.4)", yoyo: true, repeat: 1 }
        );
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (e) {
      queueStatusText.textContent = `Queue Error: ${e.message}`;
      startDispatchBtn.classList.remove("btn-secondary");
      startDispatchBtn.classList.add("btn-primary");
      break;
    }
  }

  isDispatching = false;
  stopDispatchFlag = false;
  startDispatchBtn.removeAttribute("disabled");
  calculateMetrics(ALL_ROWS);
}

// Export Filtered Table as CSV (All 39 Fields)
function exportCSV() {
  const filtered = getFilteredRows(searchEl.value);

  if (filtered.length === 0) {
    alert("There are no rows to export matching current filter.");
    return;
  }

  // Exact 39-column map matching schema
  const CSV_COLUMNS = [
    { header: "Timestamp",                  key: "created_at",             type: "date"    },
    { header: "Full Name",                  key: "full_name",               type: "text"    },
    { header: "Primary Email",              key: "email",                   type: "text"    },
    { header: "WhatsApp / Phone",           key: "contact_number",          type: "text"    },
    { header: "Faculty / Institute",        key: "faculty_institute",       type: "text"    },
    { header: "Programme / Course",         key: "programme_course",        type: "text"    },
    { header: "Semester / Year",            key: "current_semester_year",   type: "text"    },
    { header: "Division / Batch",           key: "division_batch",          type: "text"    },
    { header: "Enrollment Number",          key: "enrollment_number",       type: "text"    },
    { header: "Has University Email",       key: "has_uni_email",           type: "bool"    },
    { header: "University Email",           key: "uni_email",               type: "text"    },
    { header: "Personal Email",             key: "personal_email",          type: "text"    },
    { header: "Student Status",             key: "student_status",          type: "text"    },
    { header: "Why Interested",             key: "why_interested",          type: "text"    },
    { header: "Has App Idea",               key: "has_idea",                type: "text"    },
    { header: "App Idea Description",       key: "idea_description",        type: "text"    },
    { header: "Excitement Areas",           key: "excitement_level",        type: "array"   },
    { header: "Build Interest Areas",       key: "build_interest",          type: "array"   },
    { header: "Mac / iPad Access",          key: "mac_access",              type: "text"    },
    { header: "Device Usage Frequency",     key: "device_frequency",        type: "text"    },
    { header: "Mac Lab Needed",             key: "needs_mac_lab",           type: "text"    },
    { header: "Prep Hours / Week",          key: "hours_per_week_prep",     type: "text"    },
    { header: "App Dev Experience",         key: "app_experience",          type: "text"    },
    { header: "Apple Platform Experience",  key: "apple_experience",        type: "text"    },
    { header: "Independence / Confidence",  key: "independence_confidence", type: "text"    },
    { header: "Skills / Interests",         key: "interests_improving",     type: "array"   },
    { header: "Previous Competitions",      key: "previous_competitions",   type: "bool"    },
    { header: "Competition Details",        key: "competition_details",     type: "text"    },
    { header: "Commitment Level",           key: "commitment_level",        type: "text"    },
    { header: "Program Hours / Week",       key: "hours_per_week_program",  type: "text"    },
    { header: "Preferred Work Schedule",    key: "work_schedule",           type: "array"   },
    { header: "Willing to Attend Sessions", key: "willing_to_attend",       type: "text"    },
    { header: "GitHub",                     key: "github_profile",          type: "text"    },
    { header: "LinkedIn",                   key: "linkedin_profile",        type: "text"    },
    { header: "Portfolio",                  key: "portfolio_website",       type: "text"    },
    { header: "Additional Comments",        key: "anything_else",           type: "text"    },
    { header: "Confirmation Email Sent",    key: "email_sent",              type: "bool"    },
  ];

  function csvFormat(val, type) {
    if (val === null || val === undefined || val === "") return "";
    if (type === "bool") {
      if (val === true || val === "true" || val === 1 || val === "yes") return "Yes";
      if (val === false || val === "false" || val === 0 || val === "no") return "No";
      return String(val);
    }
    if (type === "array") {
      const arr = parseArrayField(val);
      return arr.join(", ");
    }
    if (type === "date") {
      return fmtDate(val);
    }
    return String(val);
  }

  const csvEsc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  let csvContent = CSV_COLUMNS.map(c => csvEsc(c.header)).join(",") + "\n";

  filtered.forEach((row) => {
    const rowValues = CSV_COLUMNS.map(({ key, type }) => {
      let val = row[key];
      if (key === "enrollment_number" && (val === null || val === undefined || val === "")) {
        val = row["enrollment_id"] || row["enrollment_no"] || "";
      }
      return csvEsc(csvFormat(val, type));
    });
    csvContent += rowValues.join(",") + "\n";
  });

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `SSC2027_Registrations_${timestamp}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Backup JSON (Loaded client cache)
function backupJSON() {
  if (!IS_SUPER_ADMIN) {
    alert("Unauthorized: Exporting raw backup snapshots requires Super Admin privileges.");
    return;
  }
  if (ALL_ROWS.length === 0) {
    alert("No data to back up.");
    return;
  }
  const payload = {
    exported_at: new Date().toISOString(),
    table_source: ACTIVE_TABLE,
    total_records: ALL_ROWS.length,
    records: ALL_ROWS,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `SSC2027_Backup_${timestamp}.json`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ───────────────────────────────────────────────────────────────
// Supabase Immutable Backup Snapshot Modal & Download Logic
// ───────────────────────────────────────────────────────────────
function showSupabaseBackupModal() {
  if (!IS_SUPER_ADMIN) {
    alert("Unauthorized: Access to the immutable backup archive requires Super Admin privileges.");
    return;
  }
  const modal = $("#supabaseBackupModal");
  const statusEl = $("#backupDownloadStatus");
  if (statusEl) statusEl.textContent = "";
  if (!modal) return;
  modal.classList.remove("hidden");
  gsap.fromTo(modal.querySelector(".modal-card"),
    { scale: 0.92, opacity: 0, y: 20 },
    { duration: 0.3, scale: 1, opacity: 1, y: 0, ease: "power3.out" }
  );
}

function closeSupabaseBackupModal() {
  const modal = $("#supabaseBackupModal");
  if (!modal) return;
  gsap.to(modal.querySelector(".modal-card"), {
    duration: 0.2, scale: 0.92, opacity: 0, y: 10, ease: "power2.in",
    onComplete: () => modal.classList.add("hidden")
  });
}

// Download Complete Snapshot directly from Supabase public.registrations_backup
async function downloadSupabaseBackup(format = "json") {
  if (!IS_SUPER_ADMIN) {
    alert("Unauthorized: Access to the immutable backup archive requires Super Admin privileges.");
    return;
  }
  const statusEl = $("#backupDownloadStatus");
  if (statusEl) {
    statusEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;color:#0284c7;"><svg class="spin" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Fetching immutable snapshot from public.registrations_backup...</span>`;
  }

  try {
    const r = await fetch("/api/entries?source=backup&limit=10000", {
      headers: { "x-admin-key": getKey() }
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${r.status}`);
    }

    const data = await r.json();
    const rows = data.rows || [];

    if (rows.length === 0) {
      if (statusEl) statusEl.textContent = "Backup table is currently empty.";
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      const payload = {
        source_table: "public.registrations_backup",
        exported_at: new Date().toISOString(),
        total_records: rows.length,
        is_immutable_archive: true,
        records: rows
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `SSC2027_Supabase_Backup_Archive_${timestamp}.json`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (format === "csv") {
      const CSV_COLUMNS = [
        { header: "Timestamp",                  key: "created_at",             type: "date"    },
        { header: "Full Name",                  key: "full_name",               type: "text"    },
        { header: "Primary Email",              key: "email",                   type: "text"    },
        { header: "WhatsApp / Phone",           key: "contact_number",          type: "text"    },
        { header: "Faculty / Institute",        key: "faculty_institute",       type: "text"    },
        { header: "Programme / Course",         key: "programme_course",        type: "text"    },
        { header: "Semester / Year",            key: "current_semester_year",   type: "text"    },
        { header: "Division / Batch",           key: "division_batch",          type: "text"    },
        { header: "Enrollment Number",          key: "enrollment_number",       type: "text"    },
        { header: "Has University Email",       key: "has_uni_email",           type: "bool"    },
        { header: "University Email",           key: "uni_email",               type: "text"    },
        { header: "Personal Email",             key: "personal_email",          type: "text"    },
        { header: "Student Status",             key: "student_status",          type: "text"    },
        { header: "Why Interested",             key: "why_interested",          type: "text"    },
        { header: "Has App Idea",               key: "has_idea",                type: "text"    },
        { header: "App Idea Description",       key: "idea_description",        type: "text"    },
        { header: "Excitement Areas",           key: "excitement_level",        type: "array"   },
        { header: "Build Interest Areas",       key: "build_interest",          type: "array"   },
        { header: "Mac / iPad Access",          key: "mac_access",              type: "text"    },
        { header: "Device Usage Frequency",     key: "device_frequency",        type: "text"    },
        { header: "Mac Lab Needed",             key: "needs_mac_lab",           type: "text"    },
        { header: "Prep Hours / Week",          key: "hours_per_week_prep",     type: "text"    },
        { header: "App Dev Experience",         key: "app_experience",          type: "text"    },
        { header: "Apple Platform Experience",  key: "apple_experience",        type: "text"    },
        { header: "Independence / Confidence",  key: "independence_confidence", type: "text"    },
        { header: "Skills / Interests",         key: "interests_improving",     type: "array"   },
        { header: "Previous Competitions",      key: "previous_competitions",   type: "bool"    },
        { header: "Competition Details",        key: "competition_details",     type: "text"    },
        { header: "Commitment Level",           key: "commitment_level",        type: "text"    },
        { header: "Program Hours / Week",       key: "hours_per_week_program",  type: "text"    },
        { header: "Preferred Work Schedule",    key: "work_schedule",           type: "array"   },
        { header: "Willing to Attend Sessions", key: "willing_to_attend",       type: "text"    },
        { header: "GitHub",                     key: "github_profile",          type: "text"    },
        { header: "LinkedIn",                   key: "linkedin_profile",        type: "text"    },
        { header: "Portfolio",                  key: "portfolio_website",       type: "text"    },
        { header: "Additional Comments",        key: "anything_else",           type: "text"    },
        { header: "Confirmation Email Sent",    key: "email_sent",              type: "bool"    },
      ];

      function csvFormat(val, type) {
        if (val === null || val === undefined || val === "") return "";
        if (type === "bool") {
          if (val === true || val === "true" || val === 1 || val === "yes") return "Yes";
          if (val === false || val === "false" || val === 0 || val === "no") return "No";
          return String(val);
        }
        if (type === "array") {
          const arr = parseArrayField(val);
          return arr.join(", ");
        }
        if (type === "date") return fmtDate(val);
        return String(val);
      }

      const csvEsc = (v) => `"${String(v).replace(/"/g, '""')}"`;
      let csvContent = CSV_COLUMNS.map(c => csvEsc(c.header)).join(",") + "\n";
      rows.forEach((row) => {
        const rowValues = CSV_COLUMNS.map(({ key, type }) => {
          let val = row[key];
          if (key === "enrollment_number" && (val === null || val === undefined || val === "")) {
            val = row["enrollment_id"] || row["enrollment_no"] || "";
          }
          return csvEsc(csvFormat(val, type));
        });
        csvContent += rowValues.join(",") + "\n";
      });

      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `SSC2027_Supabase_Backup_Archive_${timestamp}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    if (statusEl) {
      statusEl.innerHTML = `<span style="color:#10b981;font-weight:600;">✔ Downloaded ${rows.length} rows from registrations_backup (${format.toUpperCase()})</span>`;
    }
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:#ef4444;">Error: ${esc(err.message)}</span>`;
    }
  }
}

// Delete All Data Modal Handling
function showDeleteModal() {
  if (!IS_SUPER_ADMIN) {
    alert("Unauthorized: Only Super Admin can access database deletion.");
    return;
  }

  const modal = $("#deleteModal");
  const input = $("#deleteConfirmInput");
  const pwInput = $("#deletePasswordInput");
  const confirmBtn = $("#deleteConfirmBtn");
  const errorEl = $("#deleteConfirmError");
  const step2 = $("#deleteStep2");
  const stepLine = $("#deleteStepLine");
  const step2Dot = $("#deleteStep2Dot");

  input.value = "";
  if (pwInput) pwInput.value = "";
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = "0.5";
  confirmBtn.style.cursor = "not-allowed";
  errorEl.style.display = "none";
  step2.style.display = "none";
  stepLine.style.width = "0%";
  step2Dot.style.background = "rgba(239,68,68,0.15)";
  step2Dot.style.border = "2px solid rgba(239,68,68,0.3)";
  step2Dot.style.color = "#ef4444";

  modal.classList.remove("hidden");
  gsap.fromTo(modal.querySelector(".modal-card"),
    { scale: 0.92, opacity: 0, y: 20 },
    { duration: 0.3, scale: 1, opacity: 1, y: 0, ease: "power3.out" }
  );
  setTimeout(() => input.focus(), 320);
}

function closeDeleteModal() {
  const modal = $("#deleteModal");
  gsap.to(modal.querySelector(".modal-card"), {
    duration: 0.2, scale: 0.92, opacity: 0, y: 10, ease: "power2.in",
    onComplete: () => modal.classList.add("hidden")
  });
}

async function confirmDeleteAll() {
  if (!IS_SUPER_ADMIN) {
    alert("Unauthorized: Only Super Admin can perform database deletion.");
    return;
  }

  const confirmBtn = $("#deleteConfirmBtn");
  const originalHTML = confirmBtn.innerHTML;

  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><svg class="spin" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Deleting...</span>`;

  try {
    const r = await fetch("/api/delete-all", {
      method: "DELETE",
      headers: { "x-admin-key": getKey() }
    });
    const data = await r.json();

    if (!r.ok) throw new Error(data.error || "Server error");

    closeDeleteModal();
    ALL_ROWS = [];
    renderTable("");
    calculateMetrics([]);
    updateFacultyBreakdown([]);
    countEl.textContent = 0;

    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed;bottom:24px;right:24px;background:#0f172a;color:#f8fafc;border:1px solid rgba(255,255,255,0.1);border-left:3px solid var(--accent-rose);padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;z-index:99999;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;";
    toast.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="var(--accent-rose)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> <span>All active registrations cleared. (registrations_backup preserved).</span>`;
    document.body.appendChild(toast);
    gsap.fromTo(toast, { opacity: 0, y: 12 }, { duration: 0.25, opacity: 1, y: 0, ease: "power2.out" });
    setTimeout(() => gsap.to(toast, { duration: 0.25, opacity: 0, y: 8, onComplete: () => toast.remove() }), 3500);

  } catch (err) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalHTML;
    $("#deleteConfirmError").textContent = "Error: " + err.message;
    $("#deleteConfirmError").style.display = "block";
  }
}

// Helpers
function fmtDate(dateVal) {
  if (!dateVal) return "N/A";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  } catch {
    return String(dateVal);
  }
}

// Debounce Utility for Fast Search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Single Page Application View Switcher
function switchPage(pageId) {
  if (pageId === ACTIVE_PAGE) return;
  
  $$(".nav-tab").forEach(tab => {
    if (tab.getAttribute("data-page") === pageId) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });
  
  const dashboardDiv = $("#page-dashboard");
  const regsDiv = $("#page-registrations");
  
  const currentDiv = ACTIVE_PAGE === "dashboard" ? dashboardDiv : regsDiv;
  const targetDiv = pageId === "dashboard" ? dashboardDiv : regsDiv;
  
  const tl = gsap.timeline();
  
  tl.to(currentDiv, {
    duration: 0.2,
    opacity: 0,
    y: 10,
    ease: "power2.in",
    onComplete: () => {
      currentDiv.classList.add("hidden");
      targetDiv.classList.remove("hidden");
      
      if (pageId === "ideas") {
        ACTIVE_SEGMENT = null;
        ACTIVE_DEPARTMENT = "ideas";
        ACTIVE_TABLE = "registrations";
      } else if (pageId === "uni-mail") {
        ACTIVE_SEGMENT = null;
        ACTIVE_DEPARTMENT = "uni-mail";
        ACTIVE_TABLE = "registrations";
      } else if (pageId === "personal-mail") {
        ACTIVE_SEGMENT = null;
        ACTIVE_DEPARTMENT = "personal-mail";
        ACTIVE_TABLE = "registrations";
      } else if (pageId === "backup-archive") {
        if (!IS_SUPER_ADMIN) {
          alert("Unauthorized: Access to the immutable backup archive requires Super Admin privileges.");
          switchPage("all");
          return;
        }
        ACTIVE_SEGMENT = null;
        ACTIVE_DEPARTMENT = null;
        ACTIVE_TABLE = "registrations_backup";
      } else if (pageId === "all") {
        ACTIVE_SEGMENT = null;
        ACTIVE_DEPARTMENT = null;
        ACTIVE_TABLE = "registrations";
      }
      
      if (pageId !== "dashboard") {
        searchEl.value = "";
        CURRENT_PAGE = 1;
        updateFilterNote();
        load(true); // Load table according to ACTIVE_TABLE
      }
    }
  });
  
  tl.fromTo(targetDiv,
    { opacity: 0, y: 10 },
    { duration: 0.35, opacity: 1, y: 0, ease: "power2.out" }
  );
  
  ACTIVE_PAGE = pageId;
}

// Table Data Source Switcher Helper
function setTableSource(source) {
  if ((source === "backup" || source === "registrations_backup") && !IS_SUPER_ADMIN) {
    alert("Unauthorized: Access to the immutable backup archive requires Super Admin privileges.");
    return;
  }
  ACTIVE_TABLE = source === "backup" || source === "registrations_backup" ? "registrations_backup" : "registrations";
  const liveBtn = $("#toggleLiveTableBtn");
  const backupBtn = $("#toggleBackupTableBtn");
  const codeBadge = $("#activeTableCode");

  if (liveBtn) liveBtn.classList.toggle("active", ACTIVE_TABLE !== "registrations_backup");
  if (backupBtn) backupBtn.classList.toggle("active", ACTIVE_TABLE === "registrations_backup");
  
  if (codeBadge) {
    if (ACTIVE_TABLE === "registrations_backup") {
      codeBadge.textContent = "public.registrations_backup";
      codeBadge.style.background = "var(--accent-sky-subtle)";
      codeBadge.style.color = "var(--accent-sky)";
    } else {
      codeBadge.textContent = "public.registrations";
      codeBadge.style.background = "var(--accent-emerald-subtle)";
      codeBadge.style.color = "var(--accent-emerald)";
    }
  }

  updateFilterNote();
  load(false, true);
}

// Event Bindings and Bootstrapping
function init() {
  gateBtn.addEventListener("click", tryUnlock);
  gateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });

  logoutBtn.addEventListener("click", logout);
  
  // Direct live sync buttons
  const topbarSyncBtn = $("#topbarSyncBtn");
  if (topbarSyncBtn) topbarSyncBtn.addEventListener("click", () => load(false, true));

  const overviewRefreshBtn = $("#overviewRefreshBtn");
  if (overviewRefreshBtn) overviewRefreshBtn.addEventListener("click", () => load(false, true));

  if (refreshBtn) refreshBtn.addEventListener("click", () => load(false, true));
  exportBtn.addEventListener("click", exportCSV);

  // Table Source Toggle Buttons
  const toggleLiveTableBtn = $("#toggleLiveTableBtn");
  if (toggleLiveTableBtn) toggleLiveTableBtn.addEventListener("click", () => setTableSource("live"));

  const toggleBackupTableBtn = $("#toggleBackupTableBtn");
  if (toggleBackupTableBtn) toggleBackupTableBtn.addEventListener("click", () => setTableSource("backup"));

  const backupBtn = $("#backupBtn");
  if (backupBtn) backupBtn.addEventListener("click", backupJSON);

  // Supabase Backup Snapshot Modal triggers
  const supabaseSnapshotBtn = $("#supabaseSnapshotBtn");
  if (supabaseSnapshotBtn) supabaseSnapshotBtn.addEventListener("click", showSupabaseBackupModal);

  const backupModalCloseBtn = $("#backupModalCloseBtn");
  if (backupModalCloseBtn) backupModalCloseBtn.addEventListener("click", closeSupabaseBackupModal);

  const downloadBackupJsonBtn = $("#downloadBackupJsonBtn");
  if (downloadBackupJsonBtn) downloadBackupJsonBtn.addEventListener("click", () => downloadSupabaseBackup("json"));

  const downloadBackupCsvBtn = $("#downloadBackupCsvBtn");
  if (downloadBackupCsvBtn) downloadBackupCsvBtn.addEventListener("click", () => downloadSupabaseBackup("csv"));

  const viewBackupArchiveBtn = $("#viewBackupArchiveBtn");
  if (viewBackupArchiveBtn) {
    viewBackupArchiveBtn.addEventListener("click", () => {
      closeSupabaseBackupModal();
      setTableSource("backup");
      switchPage("all");
    });
  }

  const supabaseBackupModal = $("#supabaseBackupModal");
  if (supabaseBackupModal) {
    supabaseBackupModal.addEventListener("click", (e) => {
      if (e.target === supabaseBackupModal) closeSupabaseBackupModal();
    });
  }

  const deleteAllBtn = $("#deleteAllBtn");
  if (deleteAllBtn) deleteAllBtn.addEventListener("click", showDeleteModal);

  const deleteCancelBtn = $("#deleteCancelBtn");
  if (deleteCancelBtn) deleteCancelBtn.addEventListener("click", closeDeleteModal);

  const deleteConfirmBtn = $("#deleteConfirmBtn");
  const deleteConfirmInput = $("#deleteConfirmInput");
  const deletePasswordInput = $("#deletePasswordInput");
  const deleteStep2 = $("#deleteStep2");
  const deleteStepLine = $("#deleteStepLine");
  const deleteStep2Dot = $("#deleteStep2Dot");

  if (deleteConfirmInput) {
    deleteConfirmInput.addEventListener("input", () => {
      const isDeleteTyped = deleteConfirmInput.value.trim() === "DELETE";
      $("#deleteConfirmError").style.display = "none";

      if (isDeleteTyped) {
        deleteStepLine.style.width = "100%";
        deleteStep2Dot.style.background = "#ef4444";
        deleteStep2Dot.style.border = "none";
        deleteStep2Dot.style.color = "#fff";
        deleteStep2.style.display = "block";
        gsap.fromTo(deleteStep2,
          { opacity: 0, y: 8 },
          { duration: 0.3, opacity: 1, y: 0, ease: "power2.out",
            onComplete: () => { if (deletePasswordInput) deletePasswordInput.focus(); }
          }
        );
      } else {
        deleteStepLine.style.width = "0%";
        deleteStep2Dot.style.background = "rgba(239,68,68,0.15)";
        deleteStep2Dot.style.border = "2px solid rgba(239,68,68,0.3)";
        deleteStep2Dot.style.color = "#ef4444";
        deleteStep2.style.display = "none";
        deleteConfirmBtn.disabled = true;
        deleteConfirmBtn.style.opacity = "0.5";
        deleteConfirmBtn.style.cursor = "not-allowed";
        if (deletePasswordInput) deletePasswordInput.value = "";
      }
    });
    deleteConfirmInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDeleteModal();
    });
  }

  if (deletePasswordInput) {
    deletePasswordInput.addEventListener("input", () => {
      const isDeleteTyped = deleteConfirmInput.value.trim() === "DELETE";
      const isPwCorrect = deletePasswordInput.value === getKey();
      const ready = isDeleteTyped && isPwCorrect;
      deleteConfirmBtn.disabled = !ready;
      deleteConfirmBtn.style.opacity = ready ? "1" : "0.5";
      deleteConfirmBtn.style.cursor = ready ? "pointer" : "not-allowed";
      $("#deleteConfirmError").style.display = "none";
    });
    deletePasswordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !deleteConfirmBtn.disabled) confirmDeleteAll();
      if (e.key === "Escape") closeDeleteModal();
    });
  }

  if (deleteConfirmBtn) deleteConfirmBtn.addEventListener("click", confirmDeleteAll);

  $("#deleteModal").addEventListener("click", (e) => {
    if (e.target === $("#deleteModal")) closeDeleteModal();
  });

  // Mobile Sidebar Drawer Controls
  const mobileMenuBtn = $("#mobileMenuBtn");
  const adminSidebar = $("#adminSidebar");
  const sidebarOverlay = $("#sidebarOverlay");

  function openMobileSidebar() {
    if (adminSidebar) adminSidebar.classList.add("open");
    if (sidebarOverlay) sidebarOverlay.classList.add("active");
  }

  function closeMobileSidebar() {
    if (adminSidebar) adminSidebar.classList.remove("open");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", () => {
      if (adminSidebar && adminSidebar.classList.contains("open")) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeMobileSidebar);
  }

  $$(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const page = tab.getAttribute("data-page");
      closeMobileSidebar();
      switchPage(page);
    });
  });

  $$(".dept-link-card").forEach((card) => {
    card.addEventListener("click", () => {
      const targetDept = card.getAttribute("data-target-dept");
      closeMobileSidebar();
      switchPage(targetDept);
    });
  });

  // Debounced search for instant, lag-free typing across thousands of records
  const debouncedSearch = debounce((val) => {
    CURRENT_PAGE = 1;
    renderTable(val);
  }, 120);

  searchEl.addEventListener("input", (e) => debouncedSearch(e.target.value));

  startDispatchBtn.addEventListener("click", startDispatch);

  // Check sessionStorage on page mount
  const activeKey = getKey();
  if (activeKey) {
    gate.classList.add("hidden");
    app.classList.remove("hidden");
    load();
  } else {
    showGate("");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
