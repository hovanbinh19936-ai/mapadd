const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;

async function supabase(method, table, body, filter) {
  let url = `${SUPA_URL}/rest/v1/${table}`;
  if (filter) url += `?${filter}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  try { return { data: JSON.parse(text), status: res.status }; }
  catch(e) { return { data: text, status: res.status }; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key } = req.body || {};
  if (!key) return res.status(400).json({ valid: false, error: 'Thieu key' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    const { data } = await supabase('GET', 'license_keys', null,
      `key=eq.${key.trim().toUpperCase()}&limit=1`);

    const record = Array.isArray(data) ? data[0] : null;
    if (!record) return res.json({ valid: false, error: 'Key khong ton tai' });
    if (!record.active) return res.json({ valid: false, error: 'Key da bi vo hieu hoa' });

    const now = new Date();
    const expiry = new Date(record.expires_at);
    if (now > expiry) return res.json({ valid: false, error: 'Key het han' });
    if (record.bound_ip && record.bound_ip !== ip) {
      return res.json({ valid: false, error: 'Key da dung boi IP khac' });
    }

    if (!record.bound_ip) {
      await supabase('PATCH', 'license_keys',
        { bound_ip: ip, first_used_at: now.toISOString(), use_count: 1 },
        `key=eq.${key.trim().toUpperCase()}`);
    } else {
      await supabase('PATCH', 'license_keys',
        { use_count: (record.use_count || 0) + 1, last_used_at: now.toISOString() },
        `key=eq.${key.trim().toUpperCase()}`);
    }

    const daysLeft = Math.ceil((expiry - now) / 86400000);
    return res.json({
      valid: true,
      name: record.name || 'Nguoi dung',
      expires_at: record.expires_at,
      days_left: daysLeft,
      plan: record.plan || 'basic'
    });
  } catch(err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
};
