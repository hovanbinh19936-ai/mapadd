const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ valid: false, error: 'Thiếu key' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    const { data, error } = await supabase
      .from('license_keys')
      .select('*')
      .eq('key', key.trim().toUpperCase())
      .single();

    if (error || !data) return res.json({ valid: false, error: 'Key không tồn tại' });
    if (!data.active) return res.json({ valid: false, error: 'Key đã bị vô hiệu hoá' });

    const now = new Date();
    const expiry = new Date(data.expires_at);
    if (now > expiry) return res.json({ valid: false, error: `Key hết hạn lúc ${expiry.toLocaleDateString('vi-VN')}` });

    if (data.bound_ip && data.bound_ip !== ip) {
      return res.json({ valid: false, error: 'Key này đã được dùng bởi IP khác' });
    }

    if (!data.bound_ip) {
      await supabase.from('license_keys').update({
        bound_ip: ip,
        first_used_at: now.toISOString(),
        use_count: 1
      }).eq('key', key.trim().toUpperCase());
    } else {
      await supabase.from('license_keys').update({
        use_count: (data.use_count || 0) + 1,
        last_used_at: now.toISOString()
      }).eq('key', key.trim().toUpperCase());
    }

    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return res.json({ valid: true, name: data.name || 'Người dùng', expires_at: data.expires_at, days_left: daysLeft, plan: data.plan || 'basic' });

  } catch (err) {
    return res.status(500).json({ valid: false, error: 'Lỗi server: ' + err.message });
  }
};
