const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;

function isAuthorized(reqAdminKey, configuredKey) {
  if (!configuredKey || typeof reqAdminKey !== "string" || !reqAdminKey) return false;
  const hashReq = crypto.createHash("sha256").update(String(reqAdminKey)).digest();
  const hashConf = crypto.createHash("sha256").update(String(configuredKey)).digest();
  return crypto.timingSafeEqual(hashReq, hashConf);
}

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const clientKey = req.headers["x-admin-key"] || req.query.key;
  if (!ADMIN_KEY || !isAuthorized(clientKey, ADMIN_KEY)) {
    res.status(401).json({ error: "Unauthorized: Invalid or missing admin key" });
    return;
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: "Server error: Supabase credentials not configured." });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Delete all rows — Supabase requires a filter; use neq on id (matches all rows)
    const { error, count } = await supabase
      .from("registrations")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ success: true, deleted: count ?? "all" });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
