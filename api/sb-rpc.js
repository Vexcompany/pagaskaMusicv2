// api/sb-rpc.js — Vercel Serverless: Supabase RPC Proxy

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://music.pagaska.my.id');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_KEY;

  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Server config missing' });

  const { fn, args } = req.body || {};
  if (!fn) return res.status(400).json({ error: 'fn required' });

  try {
    const upstream = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify(args || {}),
    });

    const data = await upstream.json().catch(() => ({}));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
