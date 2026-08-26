const KEY_STORE = "ssc_admin_key";
const COLS = [
  { key: "full_name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "faculty_institute", label: "Faculty" },
  { key: "programme_course", label: "Programme" },
  { key: "current_semester_year", label: "Semester" }
];

const $ = (s) => document.querySelector(s);
const gate = $("#gate");
const app = $("#app");
const gateInput = $("#gateInput");
const gateBtn = $("#gateBtn");
const gateErr = $("#gateErr");
const tableWrap = $("#tableWrap");
const countEl = $("#count");
const searchEl = $("#search");
const refreshBtn = $("#refresh");
const statTotal = $("#statTotal");
const statPiet = $("#statPiet");
const statPit = $("#statPit");
const statOther = $("#statOther");
const facultyBars = $("#facultyBars");
const statusBars = $("#statusBars");
const linkBars = $("#linkBars");
const segmentChips = $("#segmentChips");
const activeFilterNote = $("#activeFilterNote");

let ALL_ROWS = [];
let ACTIVE_SEGMENT = null;

const LINK_COLS = {
  linkedin: "linkedin_profile",
  web: "portfolio_website",
  github: "github_profile"
};
function hasLink(r, col) {
  return r[col] && String(r[col]).trim() !== "";
}
const SEGMENTS = [
  { key: "linkedin", label: "Has LinkedIn", test: (r) => hasLink(r, LINK_COLS.linkedin) },
  { key: "web", label: "Has Personal Web", test: (r) => hasLink(r, LINK_COLS.web) },
  { key: "github", label: "Has GitHub", test: (r) => hasLink(r, LINK_COLS.github) },
  {
    key: "all",
    label: "Has All Three",
    test: (r) =>
      hasLink(r, LINK_COLS.linkedin) &&
      hasLink(r, LINK_COLS.web) &&
      hasLink(r, LINK_COLS.github)
  },
  {
    key: "none",
    label: "Has No Links",
    test: (r) =>
      !hasLink(r, LINK_COLS.linkedin) &&
      !hasLink(r, LINK_COLS.web) &&
      !hasLink(r, LINK_COLS.github)
  }
];

function getKey() {
  return localStorage.getItem(KEY_STORE) || "";
}

async function load() {
  tableWrap.innerHTML = '<div class="loading">Loading submissions…</div>';
  try {
    const r = await fetch("/api/entries", {
      headers: { "x-admin-key": getKey() }
    });
    if (r.status === 401) {
      showGate("Incorrect passcode.");
      return;
    }
    const data = await r.json();
    if (!data.rows) throw new Error(data.error || "bad response");
    ALL_ROWS = data.rows;
    countEl.textContent = data.count;
    renderStats(data.rows);
    render("");
  } catch (e) {
    tableWrap.innerHTML =
      '<div class="loading">Failed to load: ' + String(e.message || e) + "</div>";
  }
}

function fmtDate(s) {
  if (!s) return "";
  return String(s).replace(/\.\d+/, "").replace("T", " ");
}

function renderStats(rows) {
  const total = rows.length;
  const facultyCounts = { PIET: 0, PIT: 0, Other: 0 };
  const statusCounts = { Fresher: 0, "D2D": 0, Other: 0 };

  rows.forEach(r => {
    const fac = (r.faculty_institute || "").trim();
    if (fac === "PIET") facultyCounts.PIET++;
    else if (fac === "PIT") facultyCounts.PIT++;
    else facultyCounts.Other++;

    const st = (r.student_status || "").trim();
    if (st === "Fresher") statusCounts.Fresher++;
    else if (st === "D2D") statusCounts["D2D"]++;
    else statusCounts.Other++;
  });

  statTotal.textContent = total;
  statPiet.textContent = facultyCounts.PIET;
  statPit.textContent = facultyCounts.PIT;
  statOther.textContent = facultyCounts.Other;

  renderBars(facultyBars, facultyCounts, total);
  renderBars(statusBars, statusCounts, total);

  const linkCounts = {
    LinkedIn: rows.filter((r) => hasLink(r, LINK_COLS.linkedin)).length,
    "Personal Web": rows.filter((r) => hasLink(r, LINK_COLS.web)).length,
    GitHub: rows.filter((r) => hasLink(r, LINK_COLS.github)).length
  };
  renderBars(linkBars, linkCounts, total);

  renderSegments(rows);
}

function renderBars(container, counts, total) {
  const entries = Object.entries(counts).filter(([,v]) => v > 0);
  if (!entries.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px">No data</div>';
    return;
  }
  const max = Math.max(...Object.values(counts));
  container.innerHTML = entries.map(([label, val]) => {
    const pct = total ? (val / total) * 100 : 0;
    return `<div class="bar-row">
      <span class="bar-label">${esc(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${val}</span>
    </div>`;
  }).join("");
}

function renderSegments(rows) {
  const counts = {};
  SEGMENTS.forEach((s) => {
    counts[s.key] = rows.filter(s.test).length;
  });
  segmentChips.innerHTML = SEGMENTS.map((s) => {
    const active = ACTIVE_SEGMENT === s.key ? " active" : "";
    return (
      '<button class="chip' + active + '" data-seg="' + s.key + '">' +
      '<span class="chip-label">' + esc(s.label) + "</span>" +
      '<span class="chip-count">' + counts[s.key] + "</span>" +
      "</button>"
    );
  }).join("");

  segmentChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.getAttribute("data-seg");
      ACTIVE_SEGMENT = ACTIVE_SEGMENT === key ? null : key;
      updateFilterNote();
      render(searchEl.value);
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
  activeFilterNote.innerHTML =
    "Filtering by <strong>" + esc(seg.label) + "</strong> · " +
    '<button class="link-btn" id="clearSeg">clear</button>';
  activeFilterNote.classList.remove("hidden");
  const clearBtn = $("#clearSeg");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      ACTIVE_SEGMENT = null;
      updateFilterNote();
      render(searchEl.value);
    });
  }
}

function render(q) {
  const query = (q || "").trim().toLowerCase();
  let rows = ALL_ROWS.filter((r) => {
    if (!query) return true;
    return COLS.some((c) =>
      String(r[c.key] || "").toLowerCase().includes(query)
    );
  });

  if (ACTIVE_SEGMENT) {
    const seg = SEGMENTS.find((s) => s.key === ACTIVE_SEGMENT);
    if (seg) rows = rows.filter(seg.test);
  }

  if (!rows.length) {
    tableWrap.innerHTML =
      '<div class="loading">' +
      (query ? "No matches." : "No submissions yet.") +
      "</div>";
    return;
  }

  let html =
    '<table class="entries"><thead><tr><th>#</th><th>Name</th><th>Email</th><th>Faculty</th><th>Programme</th><th>Semester</th><th>Submitted</th><th></th></tr></thead><tbody>';

  rows.forEach((r, i) => {
    const idx = ALL_ROWS.indexOf(r) + 1;
    html +=
      '<tr class="row" data-id="' +
      encodeURIComponent(r.id || idx) +
      '">' +
      "<td>" + idx + "</td>" +
      '<td class="name-cell">' + esc(r.full_name || "—") + "</td>" +
      '<td class="email-cell">' + esc(r.email || "—") + "</td>" +
      "<td>" + (r.faculty_institute ? '<span class="pill">' + esc(r.faculty_institute) + "</span>" : "—") + "</td>" +
      "<td>" + esc(r.programme_course || "—") + "</td>" +
      "<td>" + esc(r.current_semester_year || "—") + "</td>" +
      "<td>" + esc(fmtDate(r.created_at)) + "</td>" +
      '<td><span class="chevy">▶</span></td>' +
      "</tr>";
  });

  html += "</tbody></table>";
  tableWrap.innerHTML = html;

  tableWrap.querySelectorAll("tr.row").forEach((tr) => {
    tr.addEventListener("click", () => toggleDetail(tr));
  });
}

function toggleDetail(tr) {
  const id = tr.getAttribute("data-id");
  const existing = tr.nextElementSibling;
  if (existing && existing.classList.contains("detail")) {
    existing.remove();
    tr.classList.remove("open");
    return;
  }
  const row = ALL_ROWS.find((r) => encodeURIComponent(r.id || ALL_ROWS.indexOf(r) + 1) === id);
  if (!row) return;

  const items = Object.keys(row)
    .filter((k) => k !== "id")
    .map((k) => {
      const v = row[k];
      const val = v === null || v === "" || v === undefined
        ? '<span class="empty">empty</span>'
        : esc(String(v));
      return '<div class="detail-item"><span class="k">' + esc(k) + "</span><span class=\"v\">" + val + "</span></div>";
    })
    .join("");

  const detail = document.createElement("tr");
  detail.className = "detail";
  detail.innerHTML = '<td colspan="8"><div class="detail-grid">' + items + "</div></td>";
  tr.parentNode.insertBefore(detail, tr.nextSibling);
  tr.classList.add("open");
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&", "<": "<", ">": ">", '"': "\"", "'": "'" }[c])
  );
}

function showGate(msg) {
  const gate = $("#gate");
  const app = $("#app");
  const gateInput = $("#gateInput");
  const gateErr = $("#gateErr");
  app.classList.add("hidden");
  gate.classList.remove("hidden");
  if (msg) gateErr.textContent = msg;
  gateInput.focus();
}

function tryUnlock() {
  const gate = $("#gate");
  const app = $("#app");
  const gateInput = $("#gateInput");
  const gateErr = $("#gateErr");
  gateErr.textContent = "Trying…";
  const v = gateInput.value.trim();
  if (!v) {
    gateErr.textContent = "Enter the passcode.";
    return;
  }
  localStorage.setItem(KEY_STORE, v);
  gate.classList.add("hidden");
  app.classList.remove("hidden");
  load();
}

function init() {
  gateBtn.addEventListener("click", tryUnlock);
  gateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });
  searchEl.addEventListener("input", (e) => render(e.target.value));
  refreshBtn.addEventListener("click", load);

  if (getKey()) {
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