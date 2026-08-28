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
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Passcode gate check with timing attack defense
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

    // Determine target table: primary registrations vs immutable registrations_backup
    const isBackup = req.query.source === "backup" || 
                     req.query.table === "backup" || 
                     req.query.table === "registrations_backup";
    const targetTable = isBackup ? "registrations_backup" : "registrations";

    const maxLimit = parseInt(req.query.limit, 10) || 10000;
    const offset = parseInt(req.query.offset, 10) || 0;

    // Fetch registrations sorted by newest first
    const { data: rows, count: totalCount, error } = await supabase
      .from(targetTable)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + maxLimit - 1);

    if (error) {
      res.status(500).json({ error: error.message, table: targetTable });
      return;
    }

    res.status(200).json({
      table: targetTable,
      is_backup: isBackup,
      count: totalCount !== null ? totalCount : rows.length,
      limit: maxLimit,
      offset: offset,
      rows: rows || []
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
