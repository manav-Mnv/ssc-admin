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

      if (isDryRun) {
        console.log(`  [DRY-RUN] Would send to: ${studentEmail} (${rawName})`);
        totalSent++;
      } else {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || `"AATCe Parul University" <${process.env.SMTP_USER}>`,
            to: studentEmail,
            subject: "Application Recorded — Swift Student Challenge 2027 (AATCe PU)",
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
