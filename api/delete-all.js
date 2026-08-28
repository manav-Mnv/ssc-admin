const { createClient } = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: "Server error: Supabase credentials not configured." });
    return;
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete all rows — Supabase requires a filter; use neq on id (matches all rows)
    const { error, count } = await supabase
      .from("registrations")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // always true filter

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ success: true, deleted: count ?? "all" });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
