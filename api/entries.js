const { createClient } = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  // Passcode gate check
  if (ADMIN_KEY && req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: "Server error: Supabase credentials not configured." });
    return;
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch registrations sorted by newest first (limit 500)
    const { data: rows, error } = await supabase
      .from("registrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ count: rows.length, rows });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
