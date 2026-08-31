const { createClient } = require("@supabase/supabase-js");
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

function verifyAuth(reqAdminKey) {
  if (!reqAdminKey || typeof reqAdminKey !== "string") {
    return { isAuthorized: false, isSuperAdmin: false, role: null };
  }
  const isSuper = isAuthorized(reqAdminKey, SUPER_ADMIN_KEY);
  if (isSuper) {
    return { isAuthorized: true, isSuperAdmin: true, role: "super_admin" };
  }
  const isStandard = isAuthorized(reqAdminKey, ADMIN_KEY);
  if (isStandard) {
    return { isAuthorized: true, isSuperAdmin: false, role: "admin" };
  }
  return { isAuthorized: false, isSuperAdmin: false, role: null };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Passcode gate check with timing attack defense (Super Admin or Reviewer Admin)
  const clientKey = req.headers["x-admin-key"] || req.query.key;
  const auth = verifyAuth(clientKey);
  if (!auth.isAuthorized) {
    res.status(401).json({ error: "Unauthorized: Invalid or missing passcode" });
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

    // Enforce Super Admin on backup archive queries
    if (isBackup && !auth.isSuperAdmin) {
      res.status(403).json({ error: "Forbidden: Access to the immutable backup archive requires Super Admin privileges." });
      return;
    }

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
      is_super_admin: auth.isSuperAdmin,
      role: auth.role,
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
