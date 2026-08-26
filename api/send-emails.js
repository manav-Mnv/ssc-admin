const { createClient } = require("@supabase/supabase-js");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (ADMIN_KEY && req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Fetch 5 unsent registrations
    const { data: students, error } = await supabase
      .from("registrations")
      .select("id, email, full_name")
      .eq("email_sent", false)
      .limit(5);
    if (error) return res.status(500).json({ error: error.message });
    if (!students || students.length === 0) {
      return res.status(200).json({ processed: 0, message: "Queue is empty!" });
    }
    // Configure Nodemailer
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    let sentCount = 0;
    for (const student of students) {
      const first = student.full_name.trim().split(" ")[0];
      const uniqueHash = crypto.randomBytes(4).toString("hex").toUpperCase();
      
      const html = `
        <body style="font-family:sans-serif;padding:24px;">
          <h3>Hi ${first},</h3>
          <p>Your registration for the Swift Student Challenge 2027 at Parul University is recorded.</p>
          <p>Our team is now reviewing your idea. We will contact you soon regarding the next stages.</p>
          <hr/>
          <small style="color:gray;">REF: #${uniqueHash}</small>
        </body>
      `;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"AATCe Parul University" <${process.env.SMTP_USER}>`,
        to: student.email,
        subject: "Application Recorded — AATCe Parul University",
        html: html,
      });
      await supabase
        .from("registrations")
        .update({ email_sent: true })
        .eq("id", student.id);
      sentCount++;
      // Small delay between sends to bypass spam filters
      await new Promise(r => setTimeout(r, 1000));
    }
    res.status(200).json({ processed: sentCount, remaining: students.length - sentCount });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
