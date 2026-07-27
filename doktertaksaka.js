// ════════════════════════════════════════════════════════════════
//  doktertaksaka.js — Dokter Taksaka AI Persona
//  Bagian dari Grup Taksaka (Pagaska Music)
//  Persona: empatik, tenang, support emosional
// ════════════════════════════════════════════════════════════════

const DokterTaksaka = (() => {

  // ── Identitas ──────────────────────────────────────────────
  const PERSONA = {
    id:       'dokter',
    name:     'Dokter Taksaka',
    initials: 'DT',
    color:    '#a78bfa',
    colorAlt: '#7c5cbf',
    gradient: 'linear-gradient(135deg,#7c5cbf,#5a3fa0)',
    icon:     'fas fa-user-md',
    placeholder: 'Cerita ke Dokter Taksaka, aku dengerin...',
    emptyEmoji: '🩺'
  };

  // ── System prompt ───────────────────────────────────────────
  function buildSystemPrompt() {
    const now = new Date();
    const tgl = now.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Jakarta'
    });
    const jam = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });

    return `Kamu adalah Dokter Taksaka, asisten AI empatik dan tenang milik Paskibra Gala Taksaka SMKN 5 Kota Madiun (Pagaska).

IDENTITAS:
- Nama: Dokter Taksaka
- Organisasi: Pagaska — Paskibra Gala Taksaka SMKN 5 Kota Madiun, Jawa Timur
- Waktu sekarang: ${tgl}, pukul ${jam} WIB

KEPRIBADIAN:
- Empatik, sabar, dan penuh perhatian
- Fokus pada dukungan emosional dan kesehatan mental anggota
- Berbicara dengan hangat, tidak menghakimi
- Mendengarkan dengan tulus sebelum memberi saran
- Tenang dan menenangkan dalam situasi apapun

KEMAMPUAN KHUSUS — KIRIM LAGU:
- Jika user sedang dalam kondisi emosional tertentu, kamu BISA mengirim lagu yang menenangkan atau menyemangati
- Cara kirim lagu: sertakan tag khusus di akhir pesanmu:
  [SEND_SONG:mood=sad] atau [SEND_SONG:mood=stress] atau [SEND_SONG:mood=lonely] atau [SEND_SONG:mood=happy] atau [SEND_SONG:mood=healing]
- Gunakan tag ini dengan tepat saat dirasa perlu, tidak harus setiap pesan
- Contoh: "Aku mengerti kamu sedang lelah. Coba dengerin lagu ini sambil istirahat ya~ [SEND_SONG:mood=stress]"
- Untuk mood 'healing' pilihkan lagu yang menenangkan jiwa

ATURAN KETAT:
1. JANGAN pernah memberikan diagnosis medis apapun
2. JANGAN meresepkan obat atau tindakan medis apapun
3. Selalu sarankan konsultasi ke profesional atau guru BK jika kondisi serius
4. Fokus pada validasi perasaan dan dukungan emosional
5. Jawab dalam Bahasa Indonesia yang hangat dan lembut
6. Kamu BUKAN dokter sungguhan — kamu Dokter Taksaka, AI support emosional Pagaska
7. Tidak perlu terlalu panjang, tapi pastikan user merasa didengar`;
  }

  // ── Deteksi mood khusus versi Dokter (lebih sensitif) ───────
  function detectMood(text) {
    const t = text.toLowerCase();
    // Dokter lebih sensitif terhadap tanda-tanda emosional
    if (/tidak tahu|bingung|hilang arah|ga tau|gak tau|lost/.test(t)) return 'stress';
    if (/sedih|nangis|nangis|galau|patah hati|sakit hati|kecewa|down|menangis|mewek/.test(t)) return 'sad';
    if (/stress|capek|lelah|kelelahan|bosen|jenuh|penat|overwhelmed|pusing|tekanan/.test(t)) return 'stress';
    if (/sendiri|sepi|lonely|ga ada yang|gak ada yang|ditinggal|merasa sendiri/.test(t)) return 'lonely';
    if (/takut|cemas|anxiety|panik|khawatir|was-was|gelisah/.test(t)) return 'stress';
    if (/senang|bahagia|lega|happy|syukur|alhamdulillah|gembira/.test(t)) return 'happy';
    if (/sembuh|baikan|pulih|lebih baik|mendingan/.test(t)) return 'healing';
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
        persona: 'dokter',
        _systemOverride: buildSystemPrompt()
      })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Dokter Taksaka error');
    return d.reply || d.message || 'Maaf ya, aku lagi tidak bisa merespons saat ini.';
  }

  // ── Render avatar Dokter Taksaka ────────────────────────────
  function renderAvatar(size = 24) {
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${PERSONA.gradient};display:flex;align-items:center;justify-content:center;font-size:${size * 0.3}px;font-weight:800;color:#fff;flex-shrink:0">${PERSONA.initials}</div>`;
  }

  // ── Render bubble pesan dari Dokter Taksaka ─────────────────
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
    const activeStyle = `border-color:rgba(167,139,250,.5);background:rgba(124,92,191,.15);color:#a78bfa`;
    const inactiveStyle = `border-color:var(--bd);background:var(--s2);color:var(--mt)`;
    return `<button id="tabDokterTaksaka" onclick="TaksakaGroup.setMode('dokter')" style="flex:1;padding:5px 8px;border-radius:8px;border:1px solid;font-size:.65rem;font-weight:700;cursor:pointer;transition:all .2s;${isActive ? activeStyle : inactiveStyle}">
      <i class="${PERSONA.icon}" style="margin-right:4px"></i>${PERSONA.name}
    </button>`;
  }

  // ── Pesan sambutan kosong ───────────────────────────────────
  function renderWelcome() {
    return `<div style="text-align:center;padding:32px 16px 16px">
      <div style="width:52px;height:52px;border-radius:50%;background:${PERSONA.gradient};display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:800;color:#fff;margin:0 auto 10px">${PERSONA.initials}</div>
      <div style="font-family:'Syne',sans-serif;font-size:.95rem;font-weight:700;margin-bottom:6px">${PERSONA.name} ${PERSONA.emptyEmoji}</div>
      <div style="font-size:.75rem;color:var(--mt);line-height:1.7">Hei, aku Dokter Taksaka.<br>Cerita aja apa yang kamu rasakan, aku siap dengerin.<br><span style="font-size:.68rem;opacity:.7">Aku juga bisa kirim lagu yang sesuai suasana hatimu 🎵</span></div>
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
window.DokterTaksaka = DokterTaksaka;
