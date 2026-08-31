const { createClient } = require("@supabase/supabase-js");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY || "sscpu";
const SUPER_ADMIN_KEY = process.env.SUPER_ADMIN_KEY || "applessc";

function isAuthorized(reqAdminKey, configuredKey) {
  if (!configuredKey || typeof reqAdminKey !== "string" || !reqAdminKey) return false;
  const hashReq = crypto.createHash("sha256").update(String(reqAdminKey)).digest();
  const hashConf = crypto.createHash("sha256").update(String(configuredKey)).digest();
  return crypto.timingSafeEqual(hashReq, hashConf);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = async function handler(req, res) {
  // CORS Headers for cross-origin kiosk and registration form submissions
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const clientKey = req.headers["x-admin-key"] || (req.body && req.body.key);
  if (!clientKey) {
    res.status(401).json({ error: "Unauthorized: Missing authentication passcode" });
    return;
  }

  // If standard admin key is passed, reject with 403 Forbidden
  if (isAuthorized(clientKey, ADMIN_KEY) && !isAuthorized(clientKey, SUPER_ADMIN_KEY)) {
    res.status(403).json({ error: "Forbidden: Automated email dispatch requires Super Admin privileges." });
    return;
  }

  // Super Admin validation
  if (!isAuthorized(clientKey, SUPER_ADMIN_KEY)) {
    res.status(401).json({ error: "Unauthorized: Invalid Super Admin passcode." });
    return;
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: "Server error: Supabase credentials not configured." });
    return;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    res.status(500).json({ error: "Server error: SMTP credentials not configured in environment." });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    const targetId = req.body && req.body.id;
    const targetEmail = req.body && req.body.email;
    const batchSize = Math.min(Math.max(parseInt(req.body && req.body.batchSize, 10) || 5, 1), 25);

    let query = supabase
      .from("registrations")
      .select("id, email, full_name, enrollment_number, faculty_institute");

    if (targetId) {
      query = query.eq("id", targetId).limit(1);
    } else if (targetEmail) {
      query = query.eq("email", targetEmail).limit(1);
    } else {
      query = query.eq("email_sent", false).order("created_at", { ascending: true }).limit(batchSize);
    }

    const { data: students, error: fetchErr } = await query;

    if (fetchErr) {
      return res.status(500).json({ error: fetchErr.message });
    }

    if (!students || students.length === 0) {
      return res.status(200).json({
        processed: 0,
        sent: 0,
        failed: 0,
        message: targetId || targetEmail ? "No matching registration record found." : "Email queue is empty. All registrations processed!"
      });
    }

    // Configure Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT, 10) || 465,
      secure: process.env.SMTP_SECURE !== "false",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const student of students) {
      const rawName = (student.full_name || "Applicant").trim();
      const first = escapeHtml(rawName.split(" ")[0]);
      const fullNameEsc = escapeHtml(rawName);
      const uniqueHash = (student.id ? student.id.replace(/-/g, "").slice(0, 8) : crypto.randomBytes(4).toString("hex")).toUpperCase();
      const studentEmail = (student.email || "").trim();

      if (!studentEmail || !studentEmail.includes("@")) {
        failedCount++;
        errors.push({ id: student.id, email: studentEmail, error: "Invalid email address format" });
        continue;
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f7fb; margin: 0; padding: 24px; color: #1d1d1f;">
          <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #f05138;">Swift Student Challenge 2027</h2>
              <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">Swift Coding Club · Parul University</p>
            </div>
            
            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 16px;">Dear <strong>${fullNameEsc}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; color: #374151;">Your application for the <strong>Swift Student Challenge 2027</strong> at Parul University has been recorded successfully.</p>
            <p style="font-size: 15px; line-height: 1.6; color: #374151;">Our club technical leads and mentors are reviewing your submitted details and app idea. We will reach out to you with workshop schedules, mentoring sessions, and resources.</p>
            
            <div style="margin: 28px 0; padding: 16px 20px; background: #fafafa; border-radius: 8px; border-left: 4px solid #f05138;">
              <p style="margin: 0; font-size: 13px; color: #6b7280; font-weight: 600;">APPLICATION REFERENCE</p>
              <p style="margin: 4px 0 0; font-family: monospace; font-size: 16px; font-weight: 700; color: #111827;">#SSC27-${uniqueHash}</p>
            </div>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">Apple Authorized Training Center for Education (AATCe) · Parul University</p>
          </div>
        </body>
        </html>
      `;

      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"AATCe Parul University" <${process.env.SMTP_USER}>`,
          to: studentEmail,
          subject: "Application Recorded — Swift Student Challenge 2027 (AATCe PU)",
          html: html,
        });

        // Atomically update database status
        const { error: updateErr } = await supabase
          .from("registrations")
          .update({ email_sent: true })
          .eq("id", student.id);

        if (updateErr) {
          console.error(`Failed to update status for ${student.id}:`, updateErr.message);
        }

        sentCount++;
      } catch (sendErr) {
        failedCount++;
        errors.push({ id: student.id, email: studentEmail, error: sendErr.message });
      }

      // Small delay between sends to bypass spam filters / rate limits
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    res.status(200).json({
      processed: sentCount + failedCount,
      sent: sentCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
