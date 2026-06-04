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
    const { data, status } = await supabase('P
