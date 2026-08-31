require("dotenv").config();
const express = require("express");
const path = require("path");

const entriesHandler = require("./api/entries");
const sendEmailsHandler = require("./api/send-emails");
const deleteAllHandler = require("./api/delete-all");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // Listen on all network interfaces (IP addresses)

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Protect Sensitive Backend Files & Directories from Direct HTTP Access
const BLOCKED_PATHS = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.vercel/i,
  /^\/server\.js$/i,
  /^\/api(\/.*)?$/i,
  /^\/package\.json$/i,
  /^\/package-lock\.json$/i,
  /^\/node_modules(\/.*)?$/i,
  /^\/test(\/.*)?$/i,
  /^\/scripts(\/.*)?$/i
];

app.use((req, res, next) => {
  const reqPath = req.path;
  // Allow API routes to be handled by express router
  if (reqPath.startsWith("/api/")) {
    return next();
  }
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(reqPath)) {
      return res.status(403).json({ error: "Access forbidden" });
    }
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// API Routes
app.get("/api/entries", (req, res) => entriesHandler(req, res));
app.post("/api/send-emails", (req, res) => sendEmailsHandler(req, res));
app.delete("/api/delete-all", (req, res) => deleteAllHandler(req, res));

// Serve static frontend files safely (deny dotfiles)
app.use(express.static(path.join(__dirname, "./"), {
  dotfiles: "deny",
  index: "index.html"
}));

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

if (require.main === module) {
  const os = require("os");
  app.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(`🚀 SSC Admin Portal Server is Live!`);
    console.log(`----------------------------------------------------`);
    console.log(`👉 Local (This PC):    http://localhost:${PORT}`);
    console.log(`👉 Local Loopback:     http://127.0.0.1:${PORT}`);
    
    // Auto-discover Wi-Fi and LAN IPs for easy device access
    const ifaces = os.networkInterfaces();
    for (const name in ifaces) {
      for (const net of ifaces[name]) {
        if (net.family === "IPv4" && !net.internal) {
          console.log(`📱 Network (${name}): http://${net.address}:${PORT}`);
        }
      }
    }
    console.log(`====================================================`);
  });
}

module.exports = app;
