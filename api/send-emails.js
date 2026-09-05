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
        <html lang="en">
        <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Swift Student Challenge 2027</title>
        </head>
        <body style="margin:0; padding:0; background-color:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:40px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden;">

                  <!-- Header -->
                  <tr>
                    <td style="padding:36px 32px 0 32px;">
                      <p style="margin:0; font-size:12px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:#8b8b93;">
                        Swift Coding Club &middot; Parul University
                      </p>
                      <h1 style="margin:8px 0 0 0; font-size:22px; line-height:1.3; font-weight:700; color:#111114;">
                        You're registered for SSC 2027 🎉
                      </h1>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:20px 32px 0 32px;">
                      <p style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#3a3a3e;">
                        Hi <strong style="color:#111114;">${first}</strong>,
                      </p>
                      <p style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#3a3a3e;">
                        We've received your registration for the <strong>Swift Student Challenge 2027</strong>. Our mentor team is reviewing your app playground idea now.
                      </p>
                      <p style="margin:0; font-size:15px; line-height:1.6; color:#3a3a3e;">
                        You'll hear from us soon with workshop schedules and challenge guidance.
                      </p>
                    </td>
                  </tr>

                  <!-- Status pill -->
                  <tr>
                    <td style="padding:24px 32px 0 32px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#f0f9f1; border-radius:10px; width:100%;">
                        <tr>
                          <td style="padding:14px 16px; font-size:14px; color:#1e7a34; font-weight:600;">
                            ✓ Registration verified &amp; received
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Reference ID -->
                  <tr>
                    <td style="padding:20px 32px 0 32px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#f9f9fb; border-radius:10px; width:100%;">
                        <tr>
                          <td style="padding:14px 16px;">
                            <p style="margin:0; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:#8b8b93;">Application Reference</p>
                            <p style="margin:4px 0 0 0; font-family:monospace; font-size:15px; font-weight:700; color:#111114;">#SSC27-${uniqueHash}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Divider -->
                  <tr>
                    <td style="padding:28px 32px 0 32px;">
                      <hr style="border:none; border-top:1px solid #ececef; margin:0;" />
                    </td>
                  </tr>

                  <!-- Social links -->
                  <tr>
                    <td style="padding:24px 32px 0 32px;">
                      <p style="margin:0 0 12px 0; font-size:13px; font-weight:600; color:#111114;">
                        Stay connected
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="6">
                        <tr>
                          <td>
                            <a href="https://chat.whatsapp.com/FXLcmWvxJbP24jZIn4B3Il" style="display:inline-block; padding:9px 14px; background-color:#111114; color:#ffffff; font-size:13px; font-weight:600; text-decoration:none; border-radius:20px;">WhatsApp Community</a>
                          </td>
                          <td>
                            <a href="https://whatsapp.com/channel/0029VbDO8OGD8SE0NtyZbN3h" style="display:inline-block; padding:9px 14px; background-color:#111114; color:#ffffff; font-size:13px; font-weight:600; text-decoration:none; border-radius:20px;">WhatsApp Channel</a>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <a href="https://www.instagram.com/swiftcodingclub_pu/" style="display:inline-block; padding:9px 14px; background-color:#111114; color:#ffffff; font-size:13px; font-weight:600; text-decoration:none; border-radius:20px;">Instagram</a>
                          </td>
                          <td>
                            <a href="https://www.linkedin.com/company/scc-pu/" style="display:inline-block; padding:9px 14px; background-color:#111114; color:#ffffff; font-size:13px; font-weight:600; text-decoration:none; border-radius:20px;">LinkedIn</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:28px 32px 32px 32px;">
                      <p style="margin:0; font-size:12px; color:#a9a9b0;">
                        Ref ID: #${uniqueHash} &middot; Swift Coding Club, Parul University
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"Swift Coding Club" <${process.env.SMTP_USER}>`,
          to: studentEmail,
          subject: "Registration Confirmed — Swift Student Challenge 2027",
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
