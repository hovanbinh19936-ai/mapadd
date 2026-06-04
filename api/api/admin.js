const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function generateKey() {
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `NF-${part()}${part()}-${part()}${part()}-${part()}${part()}-${part()}${part()}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const action = req.query.action;

  // TẠO KEY
  if (req.method === 'POST' && action === 'create') {
    const { name, days, plan } = req.body || {};
    if (!days) return res.status(400).json({ error: 'Thiếu số ngày' });
    const key = generateKey();
    const expires_at = new Date(Date.now() + days * 86400000).toISOString();
    const { data, error } = await supabase.from('license_keys').insert({
      key, name: name || 'Chưa đặt tên', expires_at,
      plan: plan || 'basic', active: true,
      created_at: new Date().toISOString(), bound_ip: null, use_count: 0
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, key: data.key, expires_at, days });
  }

  // DANH SÁCH
  if (req.method === 'GET' && action === 'list') {
    const { data, error } = await supabase.from('license_keys').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ keys: data });
  }

  // KHOÁ KEY
  if (req.method === 'POST' && action === 'deactivate') {
    const { key } = req.body || {};
    const { error } = await supabase.from('license_keys').update({ active: false }).eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  // RESET IP
  if (req.method === 'POST' && action === 'reset-ip') {
    const { key } = req.body || {};
    const { error } = await supabase.from('license_keys').update({ bound_ip: null }).eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  // GIA HẠN
  if (req.method === 'POST' && action === 'extend') {
    const { key, days } = req.body || {};
    const { data: kd } = await supabase.from('license_keys').select('expires_at').eq('key', key).single();
    const base = new Date(kd.expires_at) > new Date() ? new Date(kd.expires_at) : new Date();
    const new_expiry = new Date(base.getTime() + days * 86400000).toISOString();
    const { error } = await supabase.from('license_keys').update({ expires_at: new_expiry, active: true }).eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, new_expiry });
  }

  return res.status(400).json({ error: 'Invalid action' });
};
