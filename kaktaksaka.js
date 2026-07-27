// ════════════════════════════════════════════════════════════════
//  kaktaksaka.js — Kak Taksaka AI Persona
//  Bagian dari Grup Taksaka (Pagaska Music)
//  Persona: santai, friendly, kayak kakak yang asik
// ════════════════════════════════════════════════════════════════

const KakTaksaka = (() => {

  // ── Identitas ──────────────────────────────────────────────
  const PERSONA = {
    id:       'kak',
    name:     'Kak Taksaka',
    initials: 'KT',
    color:    '#1DB954',
    colorAlt: '#17a348',
    gradient: 'linear-gradient(135deg,#1DB954,#17a348)',
    icon:     'fas fa-user-friends',
    placeholder: 'Ngobrol atau tanya ke Kak Taksaka...',
    emptyEmoji: '😊'
  };

  // ── System prompt (dibangun saat runtime agar ada waktu WIB) ─
  function buildSystemPrompt() {
    const now = new Date();
    const tgl = now.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Jakarta'
    });
    const jam = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });

    return `Kamu adalah Kak Taksaka, asisten AI santai dan friendly milik Paskibra Gala Taksaka SMKN 5 Kota Madiun (Pagaska).

IDENTITAS:
- Nama: Kak Taksaka
- Organisasi: Pagaska — Paskibra Gala Taksaka SMKN 5 Kota Madiun, Jawa Timur
- Waktu sekarang: ${tgl}, pukul ${jam} WIB

KEPRIBADIAN:
- Santai, ramah, dan fleksibel seperti kakak yang asik
- Bisa bantu berbagai topik: ngobrol, pelajaran, tugas, ide, curhat ringan
- Bahasa casual dan gaul secukupnya, tidak kaku
- Tetap semangat dan positif
- Bangga jadi bagian Pagaska tapi tidak memaksakan topik

KEMAMPUAN KHUSUS — KIRIM LAGU:
- Jika user curhat tentang perasaan atau kamu merasa ada mood tertentu, kamu BISA mengirim lagu
- Cara kirim lagu: sertakan tag khusus di akhir pesanmu:
  [SEND_SONG:mood=happy] atau [SEND_SONG:mood=sad] atau [SEND_SONG:mood=stress] atau [SEND_SONG:mood=excited] atau [SEND_SONG:mood=lonely]
- Gunakan tag ini kalau kamu mau nemenin user dengan musik, jangan dipaksakan tiap pesan
- Contoh: "Wah seru banget! Nih dengerin lagu ini biar makin semangat ya~ [SEND_SONG:mood=happy]"

ATURAN:
1. Jawab dalam Bahasa Indonesia yang santai
2. Kalau ada yang tanya soal Pagaska, jawab dengan bangga
3. Kamu BUKAN ChatGPT, Claude, atau AI lain — kamu Kak Taksaka, AI-nya Pagaska
4. Jangan terlalu panjang, jawab natural seperti chat`;
  }

  // ── Deteksi mood dari teks ──────────────────────────────────
  function detectMood(text) {
    const t = text.toLowerCase();
    if (/senang|bahagia|happy|yeay|asik|seru|gembira|excited|hore|yey/.test(t)) return 'happy';
    if (/sedih|nangis|galau|patah hati|sakit hati|kecewa|down|nangis/.test(t)) return 'sad';
    if (/stress|capek|lelah|bosen|gabut|jenuh|penat|overwhelmed|pusing/.test(t)) return 'stress';
    if (/semangat|bangkit|kuat|bisa|yok|hype|gaspol|gas/.test(t)) return 'excited';
    if (/sendiri|sepi|lonely|ga ada|gak ada|ditinggal/.test(t)) return 'lonely';
    return null;
  }

  // ── Extract tag [SEND_SONG:mood=xxx] dari reply AI ──────────
  function extractSongTag(text) {
    const match = text.match(/\[SEND_SONG:mood=(\w+)\]/);
    if (match) {
      return {
        cleanText: text.replace(/\[SEND_SONG:mood=\w+\]/, '').trim(),
        mood: match[1]
      };
    }
    return { cleanText: text, mood: null };
  }

  // ── Panggil AI backend (ey-ay /api/chat/gemini) ─────────────
  async function callAI(message, token, backendUrl) {
    const res = await fetch(`${backendUrl}/api/chat/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message,
        persona: 'taksaka',
        _systemOverride: buildSystemPrompt() // hint ke backend, diabaikan kalau backend punya sendiri
      })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Kak Taksaka error');
    return d.reply || d.message || 'Maaf ya, aku lagi gabisa jawab nih.';
  }

  // ── Render avatar Kak Taksaka ───────────────────────────────
  function renderAvatar(size = 24) {
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${PERSONA.gradient};display:flex;align-items:center;justify-content:center;font-size:${size * 0.3}px;font-weight:800;color:#fff;flex-shrink:0">${PERSONA.initials}</div>`;
  }

  // ── Render bubble pesan dari Kak Taksaka ────────────────────
  function renderBubble(msg) {
    let contentHtml = '';
    if (msg.song) contentHtml += TaksakaGroup.renderSongCard(msg.song);
    contentHtml += `<span style="white-space:pre-wrap">${msg.content}</span>`;

    return `<div class="msg-wrap them" data-msg-id="${msg.id || ''}">
      <div style="display:flex;align-items:flex-end;gap:6px">
        ${renderAvatar(24)}
        <div>
          <div style="font-size:.6rem;color:${PERSONA.color};font-weight:700;margin-bottom:3px">${PERSONA.name}</div>
          <div class="msg-bubble" style="border-left:2px solid ${PERSONA.color}40">${contentHtml}</div>
        </div>
      </div>
      <div class="msg-time" style="margin-left:30px">${TaksakaGroup.fmtTime(msg.ts)}</div>
    </div>`;
  }

  // ── Tab button HTML ─────────────────────────────────────────
  function renderTabBtn(isActive) {
    const activeStyle = `border-color:rgba(29,185,84,.5);background:rgba(29,185,84,.15);color:#1DB954`;
    const inactiveStyle = `border-color:var(--bd);background:var(--s2);color:var(--mt)`;
    return `<button id="tabKakTaksaka" onclick="TaksakaGroup.setMode('kak')" style="flex:1;padding:5px 8px;border-radius:8px;border:1px solid;font-size:.65rem;font-weight:700;cursor:pointer;transition:all .2s;${isActive ? activeStyle : inactiveStyle}">
      <i class="${PERSONA.icon}" style="margin-right:4px"></i>${PERSONA.name}
    </button>`;
  }

  // ── Pesan sambutan kosong ───────────────────────────────────
  function renderWelcome() {
    return `<div style="text-align:center;padding:32px 16px 16px">
      <div style="width:52px;height:52px;border-radius:50%;background:${PERSONA.gradient};display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:800;color:#fff;margin:0 auto 10px">${PERSONA.initials}</div>
      <div style="font-family:'Syne',sans-serif;font-size:.95rem;font-weight:700;margin-bottom:6px">${PERSONA.name} ${PERSONA.emptyEmoji}</div>
      <div style="font-size:.75rem;color:var(--mt);line-height:1.7">Hai! Aku Kak Taksaka, AI-nya Pagaska.<br>Mau ngobrol, nanya, atau butuh bantuan apa?<br><span style="font-size:.68rem;opacity:.7">Aku juga bisa kirim lagu sesuai suasana hatimu 🎵</span></div>
    </div>`;
  }

  // ── Public API ──────────────────────────────────────────────
  return {
    PERSONA,
    detectMood,
    extractSongTag,
    callAI,
    renderAvatar,
    renderBubble,
    renderTabBtn,
    renderWelcome,
    buildSystemPrompt
  };

})();

// Expose globally
window.KakTaksaka = KakTaksaka;
