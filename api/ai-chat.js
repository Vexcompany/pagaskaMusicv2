// ════════════════════════════════════════════════════════════════
//  api/ai-chat.js  — Vercel Serverless Endpoint
//  Proxy ke OpenRouter — API key aman di server, tidak ke frontend
//
//  Setup env variable di Vercel Dashboard:
//    OPENROUTER_API_KEY  = sk-or-v1-xxxxxxxxxxxx
//    OPENROUTER_MODEL    = mistralai/mistral-7b-instruct   (opsional)
//    ALLOWED_ORIGIN      = https://music.pagaska.my.id     (opsional, untuk CORS ketat)
// ════════════════════════════════════════════════════════════════

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Persona system prompts — sengaja di server agar tidak bisa dimodif dari frontend
const SYSTEM_PROMPTS = {
  kak: `Kamu adalah Kak Taksaka, AI santai dan ramah dari aplikasi musik Pagaska Music untuk organisasi siswa SMKN 5 Kota Madiun (PAGASKA).
Kamu suka ngobrol santai, bisa bantu pertanyaan apapun, dan kadang rekomendasikan lagu sesuai suasana.
Gunakan bahasa Indonesia yang santai dan friendly. Jangan terlalu formal. Boleh pakai emoji sesekali.
Kalau kamu mau rekomendasikan lagu berdasarkan suasana hati user, tambahkan tag berikut di AKHIR responmu (bukan di tengah):
[SEND_SONG:mood=happy] untuk lagu ceria
[SEND_SONG:mood=sad] untuk lagu sedih/galau
[SEND_SONG:mood=stress] untuk lagu relaksasi
[SEND_SONG:mood=excited] untuk lagu semangat/energik
[SEND_SONG:mood=lonely] untuk lagu saat merasa sepi
[SEND_SONG:mood=healing] untuk lagu healing/menenangkan
Jangan kirim lagu di setiap pesan — hanya saat benar-benar relevan dengan suasana user. Jawaban singkat dan to-the-point.`,

  dokter: `Kamu adalah Dokter Taksaka, AI empatik dari aplikasi musik Pagaska Music untuk organisasi siswa SMKN 5 Kota Madiun (PAGASKA).
Kamu fokus pada support emosional dan kesehatan mental. Dengerin dengan sabar, validasi perasaan user, berikan dukungan tulus.
Gunakan bahasa Indonesia yang hangat dan penuh empati. Jangan menghakimi. Boleh pakai emoji sesekali.
Kalau user terlihat sedih, stress, atau butuh teman — rekomendasikan lagu yang cocok dengan menambahkan tag berikut di AKHIR responmu:
[SEND_SONG:mood=sad] untuk menemani saat galau
[SEND_SONG:mood=stress] untuk menenangkan pikiran
[SEND_SONG:mood=lonely] untuk menemani saat sepi
[SEND_SONG:mood=healing] untuk proses pemulihan
[SEND_SONG:mood=happy] untuk membangkitkan semangat
Jangan kirim lagu di setiap pesan — hanya saat benar-benar relevan. Jawaban singkat, hangat, dan penuh perhatian.`
};

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── VALIDASI ENV ──────────────────────────────────────────────
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY belum diset di Vercel env variables.' });
  }

  // ── PARSE BODY ────────────────────────────────────────────────
  const { persona, history } = req.body || {};

  // Validasi persona — hanya 'kak' atau 'dokter' yang diizinkan
  if (!persona || !SYSTEM_PROMPTS[persona]) {
    return res.status(400).json({ error: 'Persona tidak valid. Gunakan "kak" atau "dokter".' });
  }

  // Validasi history — harus array, max 20 pesan
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: 'History pesan tidak valid.' });
  }

  // Sanitasi history — hanya ambil role & content, buang field lain
  // Batasi max 20 pesan & panjang konten 2000 char per pesan
  const safeHistory = history
    .slice(-20)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role:    m.role,
      content: String(m.content || '').slice(0, 2000)
    }));

  // ── CALL OPENROUTER ───────────────────────────────────────────
  const model = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct';

  try {
    const orRes = await fetch(OR_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer':  'https://music.pagaska.my.id',
        'X-Title':       'Pagaska Music - Taksaka AI'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[persona] },
          ...safeHistory
        ],
        max_tokens:  500,
        temperature: 0.8,
      })
    });

    const data = await orRes.json();

    if (!orRes.ok) {
      const msg = data?.error?.message || `OpenRouter error ${orRes.status}`;
      // Jangan expose detail error internal ke client
      console.error('[ai-chat] OpenRouter error:', msg);
      if (orRes.status === 401) return res.status(502).json({ error: 'Konfigurasi AI bermasalah. Hubungi admin.' });
      if (orRes.status === 429) return res.status(429).json({ error: 'Terlalu banyak request. Coba lagi sebentar ya!' });
      if (orRes.status === 402) return res.status(502).json({ error: 'Kredit AI habis. Hubungi admin Pagaska.' });
      return res.status(502).json({ error: 'AI tidak dapat dihubungi saat ini.' });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) return res.status(502).json({ error: 'AI tidak memberikan respons.' });

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('[ai-chat] fetch error:', err.message);
    return res.status(502).json({ error: 'Gagal menghubungi server AI.' });
  }
}
