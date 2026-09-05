#!/usr/bin/env node
/**
 * 📧 SSC Batch Confirmation Email Dispatcher (CLI)
 * 
 * Features:
 * - Rate limiting & Gmail SMTP quota shield (default safety cap 450 emails/session)
 * - Atomic `email_sent = true` status updates per recipient
 * - HTML sanitization & XSS injection defense
 * - Support for --dry-run, --batch-size, --delay-ms, --max-quota
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  return defaultValue;
}
const isDryRun = args.includes("--dry-run");
const isForce = args.includes("--force");
const targetId = getArg("--id", null);
const targetEmail = getArg("--email", null);
const batchSize = parseInt(getArg("--batch-size", "10"), 10);
const delayMs = parseInt(getArg("--delay-ms", "1200"), 10);
const maxQuota = parseInt(getArg("--max-quota", "450"), 10);

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function main() {
  console.log("==========================================================");
  console.log("🚀 Swift Student Challenge 2027 — Batch Email Dispatcher");
  console.log("==========================================================");
  console.log(`⚙️ Config: Batch Size = ${batchSize} | Delay = ${delayMs}ms | Safety Quota = ${maxQuota}`);
  if (isDryRun) {
    console.log("🔍 MODE: [DRY-RUN] (No real emails will be sent, no DB updates)");
  }
  console.log("----------------------------------------------------------");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  if (!isDryRun && (!process.env.SMTP_USER || !process.env.SMTP_PASS)) {
    console.error("❌ ERROR: Missing SMTP_USER or SMTP_PASS in environment.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });

  let transporter = null;
  if (!isDryRun) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT, 10) || 465,
      secure: process.env.SMTP_SECURE !== "false",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    try {
      await transporter.verify();
      console.log("✔ SMTP Connection verified successfully.");
    } catch (err) {
      console.error("❌ SMTP Verification failed:", err.message);
      process.exit(1);
    }
  }

  let totalSent = 0;
  let totalFailed = 0;

  while (totalSent < maxQuota) {
    let query = supabase
      .from("registrations")
      .select("id, email, full_name, enrollment_number, faculty_institute");

    const currentLimit = Math.min(batchSize, maxQuota - totalSent);

    if (targetId) {
      query = query.eq("id", targetId).limit(1);
    } else if (targetEmail) {
      query = query.eq("email", targetEmail).limit(1);
    } else if (!isForce) {
      query = query.eq("email_sent", false).order("created_at", { ascending: true }).limit(currentLimit);
    } else {
      query = query.order("created_at", { ascending: true }).limit(currentLimit);
    }

    const { data: students, error: fetchErr } = await query;

    if (fetchErr) {
      console.error("❌ Database query error:", fetchErr.message);
      break;
    }

    if (!students || students.length === 0) {
      if (targetId || targetEmail) {
        console.log(`\n⚠ No registration found matching criteria.`);
      } else {
        console.log("\n🎉 Email queue is completely empty. All pending registrations processed!");
      }
      break;
    }

    console.log(`\n📦 Processing batch of ${students.length} students...`);

    for (const student of students) {
      if (totalSent >= maxQuota) {
        console.log(`\n🛑 Reached session quota shield limit (${maxQuota} emails). Stopping.`);
        break;
      }

      const rawName = (student.full_name || "Applicant").trim();
      const fullNameEsc = escapeHtml(rawName);
      const uniqueHash = (student.id ? student.id.replace(/-/g, "").slice(0, 8) : crypto.randomBytes(4).toString("hex")).toUpperCase();
      const studentEmail = (student.email || "").trim();

      if (!studentEmail || !studentEmail.includes("@")) {
        console.warn(`⚠ Skipping invalid email format: ${studentEmail} (ID: ${student.id})`);
        totalFailed++;
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

      if (isDryRun) {
        console.log(`  [DRY-RUN] Would send to: ${studentEmail} (${rawName})`);
        totalSent++;
      } else {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || `"Swift Coding Club" <${process.env.SMTP_USER}>`,
            to: studentEmail,
            subject: "Registration Confirmed — Swift Student Challenge 2027",
            html: html,
          });

          await supabase
            .from("registrations")
            .update({ email_sent: true })
            .eq("id", student.id);

          totalSent++;
          console.log(`  ✔ [${totalSent}] Sent to: ${studentEmail} (${rawName})`);
        } catch (err) {
          totalFailed++;
          console.error(`  ❌ Failed sending to ${studentEmail}:`, err.message);
        }
      }

      await new Promise(r => setTimeout(r, delayMs));
    }

    if (targetId || targetEmail || isDryRun) {
      break;
    }
  }

  console.log("\n==========================================================");
  console.log("📊 Summary of Dispatch Session");
  console.log("==========================================================");
  console.log(`✔ Total Successfully Processed: ${totalSent}`);
  console.log(`❌ Total Failures / Skipped:   ${totalFailed}`);
  console.log("==========================================================");
}

if (require.main === module) {
  main().catch(err => {
    console.error("Fatal exception:", err);
    process.exit(1);
  });
}
