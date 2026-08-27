require("dotenv").config();
const express = require("express");
const path = require("path");

const entriesHandler = require("./api/entries");
const sendEmailsHandler = require("./api/send-emails");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // Listen on all network interfaces (IP addresses)

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "./")));

// API Routes
app.get("/api/entries", (req, res) => entriesHandler(req, res));
app.post("/api/send-emails", (req, res) => sendEmailsHandler(req, res));

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`🚀 SSC Admin Portal Server is Live!`);
  console.log(`----------------------------------------------------`);
  console.log(`👉 Local Access URL:   http://localhost:${PORT}`);
  console.log(`👉 Loopback IP URL:    http://127.0.0.1:${PORT}`);
  console.log(`👉 Network IP URL:     http://10.64.17.53:${PORT}`);
  console.log(`====================================================`);
});
