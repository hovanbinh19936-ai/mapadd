const crypto = require('crypto');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;

function generateKey() {
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `NF-${part()}${part()}-${part()}${part()}-${part()}${part()}-${part()}${part()}`;
}

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers.authorization !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query.action;

  if (req.method === 'POST' && action === 'create') {
    const { name, days, plan } = req.body || {};
    if (!days) return res.status(400).json({ error: 'Thiếu số ngày' });
    const key = generateKey();
    const expires_at = new Date(Date.now() + days * 86400000).toISOString();
    const { data, status } = await supabase('POST', 'license_keys', {
      key, name: name || 'Chua dat ten', expires_at,
      plan: plan || 'basic', active: true,
      created_at: new Date().toISOString(), bound_ip: null, use_count: 0
    });
    if (status !== 201) return res.status(500).json({ error: JSON.stringify(data) });
    const record = Array.isArray(data) ? data[0] : data;
    return res.json({ success: true, key: record.key, expires_at, days });
  }

  if (req.method === 'GET' && action === 'list') {
    const { data, status } = await supabase('GET', 'license_keys', null, 'order=created_at.desc');
    if (status !== 200) return res.status(500).json({ error: JSON.stringify(data) });
    return res.json({ keys: data });
  }

  if (req.method === 'POST' && action === 'deactivate') {
    const { key } = req.body || {};
    await supabase('PATCH', 'license_keys', { active: false }, `key=eq.${key}`);
    return res.json({ success: true });
  }

  if (req.method === 'POST' && action === 'reset-ip') {
    const { key } = req.body || {};
    await supabase('PATCH', 'license_keys', { bound_ip: null }, `key=eq.${key}`);
    return res.json({ success: true });
  }

  if (req.method === 'POST' && action === 'extend') {
    const { key, days } = req.body || {};
    const { data } = await supabase('GET', 'license_keys', null, `key=eq.${key}&select=expires_at`);
    const base = Array.isArray(data) && data[0]
      ? (new Date(data[0].expires_at) > new Date() ? new Date(data[0].expires_at) : new Date())
      : new Date();
    const new_expiry = new Date(base.getTime() + days * 86400000).toISOString();
    await supabase('PATCH', 'license_keys', { expires_at: new_expiry, active: true }, `key=eq.${key}`);
    return res.json({ success: true, new_expiry });
  }

  return res.status(400).json({ error: 'Invalid action' });
};
