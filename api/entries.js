/* Vercel serverless function — reads registrations server-side.
   The Supabase PAT stays server-side (process.env.SUPABASE_PAT); the
   browser never sees it. Optional passcode gate via ADMIN_KEY. */
const PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "ffizrzdifznulnzbgpjy";
const ADMIN_KEY = process.env.ADMIN_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (ADMIN_KEY && req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!PAT) {
    res.status(500).json({ error: "SUPABASE_PAT not configured" });
    return;
  }
  try {
    const r = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + PAT,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query:
            "SELECT * FROM registrations ORDER BY created_at DESC LIMIT 500"
        })
      }
    );
    const rows = await r.json();
    if (!Array.isArray(rows)) {
      res.status(502).json({ error: "unexpected response", detail: rows });
      return;
    }
    res.status(200).json({ count: rows.length, rows });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
