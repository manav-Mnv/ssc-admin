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
const statPIET = $("#statPIET");
const statPIT = $("#statPIT");

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
let activeRowData = null;
let currentTab = "all";
// Chart instances removed
let isDispatching = false;
let stopDispatchFlag = false;

// Links columns
const LINK_COLS = {
  linkedin: "linkedin_profile",
  web: "portfolio_website",
  github: "github_profile"
};

function hasLink(r, col) {
  return r[col] && String(r[col]).trim() !== "" && String(r[col]).toLowerCase() !== "null";
}

// Segmentation Filters Config
const SEGMENTS = [
  { key: "unsent", label: "Email Pending", test: (r) => !r.email_sent },
  { key: "sent", label: "Email Sent", test: (r) => r.email_sent },
  { key: "linkedin", label: "Has LinkedIn", test: (r) => hasLink(r, LINK_COLS.linkedin) },
  { key: "github", label: "Has GitHub", test: (r) => hasLink(r, LINK_COLS.github) },
  { key: "web", label: "Has Portfolio", test: (r) => hasLink(r, LINK_COLS.web) }
];

// Tab Categorization Schema
const CATEGORIES = {
  personal: [
    "full_name", "first_name", "last_name", "email", "phone", "phone_number", 
    "gender", "age", "date_of_birth", "dob", "enrollment_id", "enrollment_no", 
    "faculty_institute", "programme_course", "current_semester_year", "semester", "cgpa", "gpa"
  ],
  swift: [
    "coding_experience", "swift_experience", "app_playground_idea", "idea_description", 
    "playground_idea", "commitment", "hours_per_week", "github_profile", "linkedin_profile", 
    "portfolio_website", "email_sent", "created_at"
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
      
      // Premium GSAP Out/In Transition
      const tl = gsap.timeline();
      tl.to(".gate-card", {
        duration: 0.4,
        scale: 0.9,
        opacity: 0,
        y: -30,
        ease: "power2.in"
      });
      tl.call(() => {
        gate.classList.add("hidden");
        app.classList.remove("hidden");
        // Reset gate-card styles for next logout
        gsap.set(".gate-card", { scale: 1, opacity: 1, y: 0 });
      });
      tl.fromTo("#app", 
        { opacity: 0, y: 40 },
        { duration: 0.6, opacity: 1, y: 0, ease: "power3.out" }
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
        { duration: 0.4, x: 0, ease: "rough({strength: 2, points: 8, template: linear})" }
      );
    }
  } catch (e) {
    gateErr.textContent = "Connection failed: " + e.message;
  }
}

function logout() {
  sessionStorage.removeItem(KEY_STORE);
  
  // Premium logout GSAP transition
  const tl = gsap.timeline();
  tl.to("#app", {
    duration: 0.4,
    opacity: 0,
    y: 40,
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
    { duration: 0.5, scale: 1, opacity: 1, ease: "power3.out" }
  );
}

// Fetch Registrations Data
async function load(isSilent = false) {
  if (!isSilent) {
    tableWrap.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Syncing submissions from Supabase...</p>
      </div>
    `;
  }
  
  try {
    const r = await fetch("/api/entries", {
      headers: { "x-admin-key": getKey() }
    });
    
    if (r.status === 401) {
      showGate("Session expired. Please re-authenticate.");
      return;
    }
    
    const data = await r.json();
    if (!data.rows) throw new Error(data.error || "Malformed API response");
    
    ALL_ROWS = data.rows;
    countEl.textContent = data.count;
    
    calculateMetrics(data.rows);
    updateFacultyBreakdown(data.rows);
    renderTable(searchEl.value);
  } catch (e) {
    tableWrap.innerHTML = `
      <div class="loading-state">
        <span style="color:var(--swift-orange);font-size:24px;">⚠</span>
        <p>Failed to sync database: ${e.message}</p>
        <button onclick="load()" class="btn btn-secondary btn-sm" style="margin-top:10px;">Retry Connect</button>
      </div>
    `;
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
  if (isDispatching) {
    // Keep progress bar in dispatch state
  } else {
    queueProgressFill.style.width = `${pct}%`;
    queueProgressPct.textContent = `${pct}% dispatched`;
    queueProgressCount.textContent = `${sentCount} / ${total} emails sent`;
    
    if (unsentCount > 0) {
      queueStatusText.textContent = `Queue holds ${unsentCount} pending email${unsentCount > 1 ? 's' : ''}.`;
      startDispatchBtn.removeAttribute("disabled");
      startDispatchBtn.innerHTML = `
        <span>Start Dispatch</span>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      `;
    } else {
      queueStatusText.textContent = "Email queue is completely empty!";
      startDispatchBtn.setAttribute("disabled", "true");
      startDispatchBtn.innerHTML = `
        <span>All Sent</span>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
      `;
    }
  }

  // 2. PIET & PIT metrics
  let pietCount = 0;
  let pitCount = 0;
  let otherCount = 0;
  
  rows.forEach(r => {
    const fac = String(r.faculty_institute || "").trim().toUpperCase();
    if (fac.includes("PIET")) {
      pietCount++;
    } else if (fac.includes("PIT")) {
      pitCount++;
    } else {
      otherCount++;
    }
  });

  if (statPIET) statPIET.textContent = pietCount;
  if (statPIT) statPIT.textContent = `${pitCount} PIT / ${otherCount} other`;

  // 4. Render Segments Filters
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
      <button class="chip${activeClass}" data-seg="${s.key}">
        <span class="chip-label">${esc(s.label)}</span>
        <span class="chip-count">${counts[s.key]}</span>
      </button>
    `;
  }).join("");

  segmentChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.getAttribute("data-seg");
      ACTIVE_SEGMENT = ACTIVE_SEGMENT === key ? null : key;
      updateFilterNote();
      renderTable(searchEl.value);
    });
  });
}

function updateFilterNote() {
  if (!ACTIVE_SEGMENT) {
    activeFilterNote.textContent = "";
    activeFilterNote.classList.add("hidden");
    return;
  }
  const seg = SEGMENTS.find((s) => s.key === ACTIVE_SEGMENT);
  activeFilterNote.innerHTML = `
    <span>Active Filter: Segmenting registrations matching <strong>${esc(seg.label)}</strong></span>
    <button class="link-btn" id="clearSegBtn">Reset Filter</button>
  `;
  activeFilterNote.classList.remove("hidden");
  
  const clearBtn = $("#clearSegBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      ACTIVE_SEGMENT = null;
      updateFilterNote();
      renderTable(searchEl.value);
    });
  }
}

// Render Table
function renderTable(query) {
  const q = (query || "").trim().toLowerCase();
  
  let rows = ALL_ROWS.filter((r) => {
    if (!q) return true;
    return (
      String(r.full_name || "").toLowerCase().includes(q) ||
      String(r.email || "").toLowerCase().includes(q) ||
      String(r.faculty_institute || "").toLowerCase().includes(q) ||
      String(r.programme_course || "").toLowerCase().includes(q) ||
      String(r.enrollment_id || "").toLowerCase().includes(q)
    );
  });

  if (ACTIVE_DEPARTMENT) {
    rows = rows.filter((r) => {
      const fac = String(r.faculty_institute || "").trim().toUpperCase();
      if (ACTIVE_DEPARTMENT === "PIET") return fac.includes("PIET");
      if (ACTIVE_DEPARTMENT === "PIT") return fac.includes("PIT");
      // For other, exclude both PIET and PIT
      return !fac.includes("PIET") && !fac.includes("PIT");
    });
  }

  if (ACTIVE_SEGMENT) {
    const seg = SEGMENTS.find((s) => s.key === ACTIVE_SEGMENT);
    if (seg) rows = rows.filter(seg.test);
  }

  // Animate the table transition slightly
  gsap.to(tableWrap, { duration: 0.15, opacity: 0, y: 5, onComplete: () => {
    if (!rows.length) {
      tableWrap.innerHTML = `
        <div class="loading-state">
          <span style="font-size:24px;">🔍</span>
          <p>${q || ACTIVE_SEGMENT ? "No registration matches found." : "No records recorded."}</p>
        </div>
      `;
      gsap.to(tableWrap, { duration: 0.25, opacity: 1, y: 0 });
      return;
    }

    let html = `
      <table class="entries">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Faculty</th>
            <th>Student Status</th>
            <th>Enrollment ID</th>
            <th>Submitted</th>
            <th>Email Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach((r, i) => {
      const idx = ALL_ROWS.indexOf(r) + 1;
      const dateStr = fmtDate(r.created_at);
      const isSent = r.email_sent;
      const fac = (r.faculty_institute || "").trim().toUpperCase();
      let facClass = "faculty-pill";
      if (fac.includes("PIET")) facClass += " piet";
      else if (fac.includes("PIT")) facClass += " pit";

      html += `
        <tr class="row" data-id="${r.id || idx}">
          <td>${idx}</td>
          <td class="name-cell">${esc(r.full_name || "N/A")}</td>
          <td class="email-cell">${esc(r.email || "N/A")}</td>
          <td><span class="${facClass}">${esc(r.faculty_institute || "Other")}</span></td>
          <td>${esc(r.student_status || "Fresher")}</td>
          <td class="enrollment-cell">${esc(r.enrollment_id || r.enrollment_no || "N/A")}</td>
          <td style="color:var(--text-secondary);font-size:12.5px;">${esc(dateStr)}</td>
          <td>
            <span class="status-indicator ${isSent ? 'sent' : 'unsent'}">
              <span class="status-dot"></span>
              <span>${isSent ? 'Sent' : 'Pending'}</span>
            </span>
          </td>
          <td><span class="chevy-btn">▶</span></td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;
    tableWrap.innerHTML = html;

    // Attach row detail listener
    tableWrap.querySelectorAll("tr.row").forEach((tr) => {
      tr.addEventListener("click", () => {
        const id = tr.getAttribute("data-id");
        const row = ALL_ROWS.find(r => String(r.id || (ALL_ROWS.indexOf(r) + 1)) === id);
        if (row) toggleDetailRow(tr, row);
      });
    });

    gsap.fromTo(tableWrap, 
      { opacity: 0, y: 10 },
      { duration: 0.4, opacity: 1, y: 0, ease: "power2.out" }
    );
  }});
}

// Dynamic Collapsible Detail Row System (Inline Expansion)
function toggleDetailRow(tr, row) {
  const existing = tr.nextElementSibling;
  if (existing && existing.classList.contains("detail-row")) {
    const wrapper = existing.querySelector(".detail-content-wrapper");
    // Close with GSAP
    gsap.to(wrapper, {
      duration: 0.3,
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
  
  // Close any other open detail rows (accordion style)
  $$("tr.detail-row").forEach((openRow) => {
    const prev = openRow.previousElementSibling;
    if (prev) {
      prev.classList.remove("open");
    }
    openRow.remove();
  });
  
  const detailRow = document.createElement("tr");
  detailRow.className = "detail-row";
  
  detailRow.innerHTML = `
    <td colspan="9">
      <div class="detail-content-wrapper" style="height: 0; opacity: 0;">
        <div class="detail-inner glass-card">
          <div class="detail-tabs">
            <button class="detail-tab-btn active" data-tab="all">All Fields</button>
            <button class="detail-tab-btn" data-tab="personal">Personal & Academic</button>
            <button class="detail-tab-btn" data-tab="swift">Developer & Challenge Idea</button>
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
  
  const wrapper = detailRow.querySelector(".detail-content-wrapper");
  const container = detailRow.querySelector(".detail-body-container");
  const tabBtns = detailRow.querySelectorAll(".detail-tab-btn");
  
  let inlineTab = "all";
  
  function renderInlineData() {
    let html = "";
    
    if (inlineTab === "swift") {
      const ideaVal = row.app_playground_idea || row.idea_description || row.playground_idea || "";
      const experienceVal = row.coding_experience || row.swift_experience || "";
      const commitmentVal = row.commitment || row.hours_per_week || "";
      
      // Mac and iPad variables removed
      
      const github = row.github_profile || "";
      const linkedin = row.linkedin_profile || "";
      const portfolio = row.portfolio_website || "";
      
      html = `
        <div class="inline-data-grid">
          <div class="idea-showcase span-2">
            <div class="idea-banner">
              <div class="idea-badge">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> APP PLAYGROUND IDEA
              </div>
              <h3>Proposed Project Description</h3>
            </div>
            <div class="idea-text-box">
              <p>${ideaVal ? esc(ideaVal) : 'The student did not submit or describe their app playground idea in this registration.'}</p>
            </div>
          </div>
          
          <div class="idea-meta-card">
            <span class="modal-label"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="display:inline;vertical-align:middle;margin-right:4px;"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> Coding Experience</span>
            <div class="experience-badge">${experienceVal ? esc(experienceVal) : 'Not specified'}</div>
          </div>
          
          <div class="idea-meta-card">
            <span class="modal-label"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" style="display:inline;vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Commitment Details</span>
            <div class="commitment-info">${commitmentVal ? esc(commitmentVal) : 'Not specified'}</div>
          </div>
          
          <!-- Device access section removed -->

          <div class="links-panel span-2">
            <h4 class="section-subtitle">Developer Portfolio & Links</h4>
            <div class="links-grid">
              ${github ? `
                <a href="${esc(github)}" target="_blank" rel="noopener noreferrer" class="link-card github">
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                  <span>GitHub Profile ↗</span>
                </a>
              ` : ''}
              ${linkedin ? `
                <a href="${esc(linkedin)}" target="_blank" rel="noopener noreferrer" class="link-card linkedin">
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                  <span>LinkedIn Profile ↗</span>
                </a>
              ` : ''}
              ${portfolio ? `
                <a href="${esc(portfolio)}" target="_blank" rel="noopener noreferrer" class="link-card portfolio">
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
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
        if (inlineTab === "personal" && !CATEGORIES.personal.includes(key)) return;
        
        const value = row[key];
        let displayVal = "";
        
        if (value === null || value === undefined || value === "") {
          displayVal = `<span class="empty">N/A (Not Provided)</span>`;
        } else if (typeof value === "boolean") {
          const isTrue = value === true;
          displayVal = `<span class="status-indicator ${isTrue ? 'sent' : 'unsent'}"><span class="status-dot"></span><span>${isTrue ? 'Yes / True' : 'No / False'}</span></span>`;
        } else {
          const valStr = String(value);
          if (valStr.startsWith("http://") || valStr.startsWith("https://")) {
            displayVal = `<a href="${esc(valStr)}" target="_blank" rel="noopener noreferrer">${esc(valStr)} ↗</a>`;
          } else {
            displayVal = esc(valStr);
          }
        }
        
        const isLongText = key.toLowerCase().includes('idea') || key.toLowerCase().includes('description') || key.toLowerCase().includes('experience') || key.toLowerCase().includes('detail') || key.toLowerCase().includes('reason');
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
  
  // Animate Open
  gsap.to(wrapper, {
    duration: 0.4,
    height: "auto",
    opacity: 1,
    ease: "power2.out"
  });
  
  // Set up click handlers for tabs
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // prevent closing row
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      inlineTab = btn.getAttribute("data-tab");
      renderInlineData();
    });
  });
}

// Calculate and update the Faculty & Department breakdown cards
function updateFacultyBreakdown(rows) {
  const total = rows.length;
  let pietCount = 0;
  let pitCount = 0;
  let otherCount = 0;
  
  rows.forEach(r => {
    const fac = String(r.faculty_institute || "").trim().toUpperCase();
    if (fac.includes("PIET")) {
      pietCount++;
    } else if (fac.includes("PIT")) {
      pitCount++;
    } else {
      otherCount++;
    }
  });
  
  // Calculate percentages
  const pietPct = total ? Math.round((pietCount / total) * 100) : 0;
  const pitPct = total ? Math.round((pitCount / total) * 100) : 0;
  const otherPct = total ? Math.round((otherCount / total) * 100) : 0;
  
  // Update HTML elements
  const deptPietCount = $("#deptPietCount");
  const deptPietProgress = $("#deptPietProgress");
  const deptPietPct = $("#deptPietPct");
  
  const deptPitCount = $("#deptPitCount");
  const deptPitProgress = $("#deptPitProgress");
  const deptPitPct = $("#deptPitPct");
  
  const deptOtherCount = $("#deptOtherCount");
  const deptOtherProgress = $("#deptOtherProgress");
  const deptOtherPct = $("#deptOtherPct");
  
  if (deptPietCount) deptPietCount.textContent = pietCount;
  if (deptPietProgress) deptPietProgress.style.width = `${pietPct}%`;
  if (deptPietPct) deptPietPct.textContent = `${pietPct}% of total registrations`;
  
  if (deptPitCount) deptPitCount.textContent = pitCount;
  if (deptPitProgress) deptPitProgress.style.width = `${pitPct}%`;
  if (deptPitPct) deptPitPct.textContent = `${pitPct}% of total registrations`;
  
  if (deptOtherCount) deptOtherCount.textContent = otherCount;
  if (deptOtherProgress) deptOtherProgress.style.width = `${otherPct}%`;
  if (deptOtherPct) deptOtherPct.textContent = `${otherPct}% of total registrations`;
}

// Automated Batch Email Dispatch Loop
async function startDispatch() {
  if (isDispatching) {
    // If clicking while running, act as a Stop/Pause trigger
    stopDispatchFlag = true;
    startDispatchBtn.setAttribute("disabled", "true");
    queueStatusText.textContent = "Pausing dispatch queue after current batch...";
    return;
  }

  const unsentCount = ALL_ROWS.filter(r => !r.email_sent).length;
  if (unsentCount === 0) return;

  isDispatching = true;
  stopDispatchFlag = false;
  
  // Transition UI into Running State
  startDispatchBtn.innerHTML = `
    <span>Pause Queue</span>
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
  `;
  startDispatchBtn.classList.remove("btn-primary");
  startDispatchBtn.classList.add("btn-secondary");
  
  let processed = 0;
  const initialUnsent = unsentCount;
  const totalCount = ALL_ROWS.length;

  queueStatusText.textContent = `Processing batch sends... Keep dashboard window open.`;

  while (isDispatching && !stopDispatchFlag) {
    try {
      const response = await fetch("/api/send-emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": getKey()
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const resData = await response.json();
      processed += resData.processed;

      // Silently sync database to update local cache
      await load(true);

      // Re-calculate local pending count
      const currentUnsent = ALL_ROWS.filter(r => !r.email_sent).length;
      const sentCount = totalCount - currentUnsent;
      const localPct = totalCount ? Math.round((sentCount / totalCount) * 100) : 0;

      // Update dispatcher progress bar dynamically
      queueProgressFill.style.width = `${localPct}%`;
      queueProgressPct.textContent = `${localPct}% processed`;
      queueProgressCount.textContent = `${sentCount} / ${totalCount} emails sent`;
      queueStatusText.textContent = `Dispatched batch successfully. Remaining unsent queue: ${currentUnsent}`;

      // Break condition from backend empty queue
      if (resData.processed === 0 || currentUnsent === 0) {
        queueStatusText.textContent = "All email queue jobs completed successfully!";
        
        // Show success splash animation
        gsap.fromTo(".queue-manager", 
          { boxShadow: "0 0 0 rgba(48, 209, 88, 0)" },
          { duration: 0.6, boxShadow: "0 0 20px rgba(48, 209, 88, 0.4)", yoyo: true, repeat: 1 }
        );
        break;
      }

      // Small pause before requesting next batch to prevent client-side exhaustion
      await new Promise(resolve => setTimeout(resolve, 800));

    } catch (e) {
      queueStatusText.textContent = `Queue Error: ${e.message}`;
      startDispatchBtn.classList.remove("btn-secondary");
      startDispatchBtn.classList.add("btn-primary");
      break;
    }
  }

  // Restore State on termination
  isDispatching = false;
  stopDispatchFlag = false;
  startDispatchBtn.removeAttribute("disabled");
  
  // Re-run standard metric calculation to reset buttons
  calculateMetrics(ALL_ROWS);
}

// Export Filtered Table as CSV
function exportCSV() {
  const q = searchEl.value.trim().toLowerCase();
  
  let rows = ALL_ROWS.filter((r) => {
    if (!q) return true;
    return (
      String(r.full_name || "").toLowerCase().includes(q) ||
      String(r.email || "").toLowerCase().includes(q) ||
      String(r.faculty_institute || "").toLowerCase().includes(q) ||
      String(r.programme_course || "").toLowerCase().includes(q) ||
      String(r.enrollment_id || "").toLowerCase().includes(q)
    );
  });

  if (ACTIVE_SEGMENT) {
    const seg = SEGMENTS.find((s) => s.key === ACTIVE_SEGMENT);
    if (seg) rows = rows.filter(seg.test);
  }

  if (rows.length === 0) {
    alert("There are no rows to export matching current filter.");
    return;
  }

  // Extract all keys dynamically
  const headers = Object.keys(rows[0]);
  
  // Build CSV strings
  let csvContent = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
  
  rows.forEach((row) => {
    const rowValues = headers.map((header) => {
      const val = row[header];
      if (val === null || val === undefined) return '""';
      const cleanVal = String(val).replace(/"/g, '""');
      return `"${cleanVal}"`;
    });
    csvContent += rowValues.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  const timestamp = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `ssc_registrations_export_${timestamp}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Helper Utilities
function fmtDate(dateVal) {
  if (!dateVal) return "N/A";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    
    // Format: DD-MM-YYYY HH:MM
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

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Single Page Application View Switcher
function switchPage(pageId) {
  if (pageId === ACTIVE_PAGE) return;
  
  // Highlight active nav tab
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
    duration: 0.25,
    opacity: 0,
    y: 15,
    ease: "power2.in",
    onComplete: () => {
      currentDiv.classList.add("hidden");
      targetDiv.classList.remove("hidden");
      
      // Update department state filters
      if (pageId === "piet") {
        ACTIVE_SEGMENT = null;
        ACTIVE_DEPARTMENT = "PIET";
      } else if (pageId === "pit") {
        ACTIVE_SEGMENT = null;
        ACTIVE_DEPARTMENT = "PIT";
      } else if (pageId === "all") {
        ACTIVE_SEGMENT = null;
        ACTIVE_DEPARTMENT = null;
      }
      
      // Force table refresh
      if (pageId !== "dashboard") {
        searchEl.value = ""; // reset search box
        updateFilterNote();
        renderTable("");
        renderSegments(ALL_ROWS);
      }
    }
  });
  
  tl.fromTo(targetDiv,
    { opacity: 0, y: 15 },
    { duration: 0.4, opacity: 1, y: 0, ease: "power2.out" }
  );
  
  ACTIVE_PAGE = pageId;
}

// Event Bindings and Bootstrapping
function init() {
  // Gate authentication trigger
  gateBtn.addEventListener("click", tryUnlock);
  gateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });

  // Topbar Controls
  logoutBtn.addEventListener("click", logout);
  refreshBtn.addEventListener("click", () => load());
  exportBtn.addEventListener("click", exportCSV);

  // Navigation Links Click Events
  $$(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const page = tab.getAttribute("data-page");
      switchPage(page);
    });
  });

  // Dashboard Department Cards Click Events
  $$(".dept-link-card").forEach((card) => {
    card.addEventListener("click", () => {
      const targetDept = card.getAttribute("data-target-dept");
      switchPage(targetDept);
    });
  });

  // Search Engine input
  searchEl.addEventListener("input", (e) => renderTable(e.target.value));

  // Email Queue dispatch trigger
  startDispatchBtn.addEventListener("click", startDispatch);

  // Modal actions (Disabled, using inline collapsible rows)

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

// DOM Ready initialization
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
