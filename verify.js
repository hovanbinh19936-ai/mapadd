// api/verify.js - Kiểm tra key hợp lệ
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // Cho phép CORS từ extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key } = req.body;
  if (!key) return res.status(400).json({ valid: false, error: 'Thiếu key' });

  // Lấy IP thực của người dùng
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || req.headers['x-real-ip']
           || req.socket?.remoteAddress
           || 'unknown';

  try {
    // Tìm key trong database
    const { data: keyData, error } = await supabase
      .from('license_keys')
      .select('*')
      .eq('key', key.trim().toUpperCase())
      .single();

    if (error || !keyData) {
      return res.status(200).json({ valid: false, error: 'Key không tồn tại' });
    }

    // Kiểm tra đã bị vô hiệu hoá chưa
    if (!keyData.active) {
      return res.status(200).json({ valid: false, error: 'Key đã bị vô hiệu hoá' });
    }

    // Kiểm tra hết hạn
    const now = new Date();
    const expiry = new Date(keyData.expires_at);
    if (now > expiry) {
      return res.status(200).json({ valid: false, error: `Key hết hạn lúc ${expiry.toLocaleDateString('vi-VN')}` });
    }

    // Kiểm tra IP
    if (keyData.bound_ip && keyData.bound_ip !== ip) {
      return res.status(200).json({
        valid: false,
        error: `Key này đã được dùng bởi IP khác`
      });
    }

    // Lần đầu dùng → gắn IP vào key
    if (!keyData.bound_ip) {
      await supabase
        .from('license_keys')
        .update({
          bound_ip: ip,
          first_used_at: now.toISOString(),
          use_count: 1
        })
        .eq('key', key.trim().toUpperCase());
    } else {
      // Cập nhật số lần dùng
      await supabase
        .from('license_keys')
        .update({ use_count: (keyData.use_count || 0) + 1, last_used_at: now.toISOString() })
        .eq('key', key.trim().toUpperCase());
    }

    // Tính số ngày còn lại
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    return res.status(200).json({
      valid: true,
      name: keyData.name || 'Người dùng',
      expires_at: keyData.expires_at,
      days_left: daysLeft,
      plan: keyData.plan || 'basic'
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ valid: false, error: 'Lỗi server' });
  }
}
