// api/admin.js - Tạo & quản lý key (chỉ bạn dùng)
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const ADMIN_SECRET = process.env.ADMIN_SECRET; // Mật khẩu admin của bạn

function generateKey() {
  // Format: NF-XXXX-XXXX-XXXX-XXXX
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `NF-${part()}${part()}-${part()}${part()}-${part()}${part()}-${part()}${part()}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Xác thực admin
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── TẠO KEY MỚI ──
  if (req.method === 'POST' && req.query.action === 'create') {
    const { name, days, plan } = req.body;
    if (!days) return res.status(400).json({ error: 'Thiếu số ngày' });

    const key = generateKey();
    const expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('license_keys')
      .insert({
        key,
        name: name || 'Chưa đặt tên',
        expires_at,
        plan: plan || 'basic',
        active: true,
        created_at: new Date().toISOString(),
        bound_ip: null,
        use_count: 0
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, key: data.key, expires_at, days });
  }

  // ── DANH SÁCH KEY ──
  if (req.method === 'GET' && req.query.action === 'list') {
    const { data, error } = await supabase
      .from('license_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ keys: data });
  }

  // ── VÔ HIỆU HOÁ KEY ──
  if (req.method === 'POST' && req.query.action === 'deactivate') {
    const { key } = req.body;
    const { error } = await supabase
      .from('license_keys')
      .update({ active: false })
      .eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // ── XOÁ IP (reset để dùng máy khác) ──
  if (req.method === 'POST' && req.query.action === 'reset-ip') {
    const { key } = req.body;
    const { error } = await supabase
      .from('license_keys')
      .update({ bound_ip: null })
      .eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, message: 'IP đã được reset' });
  }

  // ── GIA HẠN KEY ──
  if (req.method === 'POST' && req.query.action === 'extend') {
    const { key, days } = req.body;
    const { data: keyData } = await supabase
      .from('license_keys')
      .select('expires_at')
      .eq('key', key)
      .single();

    const base = new Date(keyData.expires_at) > new Date()
      ? new Date(keyData.expires_at)
      : new Date();
    const new_expiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('license_keys')
      .update({ expires_at: new_expiry, active: true })
      .eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, new_expiry });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
