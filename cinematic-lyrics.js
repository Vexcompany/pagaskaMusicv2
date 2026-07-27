// ══════════════════════════════════════════════════════════════
//  CINEMATIC LYRICS MODE v3 — Pagaska Music
//  Fix: AudioContext lazy-init SYNCHRONOUS on user tap
//  Cara pakai: <script src="cinematic-lyrics-v3.js"></script>
//  Taruh sebelum </body> di index.html, SETELAH semua script lain
// ══════════════════════════════════════════════════════════════

(function () {
'use strict';

// ── STATE ────────────────────────────────────────────────────
let clmActive     = false;
let clmLrcLines   = [];
let clmCurIdx     = -1;
let clmInterval   = null;
let clmBeatFrame  = null;
let clmBeatEnergy = 0;
let clmLastBeat   = 0;

// Web Audio — singleton, dibuat SEKALI saat tombol CC pertama kali ditekan
let _ctx      = null;   // AudioContext
let _src      = null;   // MediaElementSource
let _analyser = null;   // AnalyserNode
let _graphOK  = false;  // sudah terhubung ke destination?

// ── CSS ──────────────────────────────────────────────────────
const CSS = `
/* ── CC Button ── */
#clm-btn {
  position:fixed; bottom:148px; right:16px; z-index:9000;
  width:52px; height:52px; border-radius:50%;
  border:1.5px solid rgba(167,139,250,.5);
  background:rgba(13,7,30,.88); backdrop-filter:blur(12px);
  color:#a78bfa; font-size:1.1rem; font-weight:900;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  transition:all .3s cubic-bezier(.16,1,.3,1);
  font-family:'DM Sans',sans-serif; letter-spacing:-.5px;
  box-shadow:0 4px 20px rgba(0,0,0,.4);
  -webkit-tap-highlight-color:transparent;
}
#clm-btn:hover { transform:scale(1.1); border-color:rgba(167,139,250,.9); box-shadow:0 0 22px rgba(167,139,250,.45); }
#clm-btn.active {
  background:rgba(109,40,217,.75); border-color:#a78bfa; color:#fff;
  box-shadow:0 0 28px rgba(167,139,250,.6),0 0 60px rgba(109,40,217,.25);
  animation:clm-btn-pulse 2.5s ease-in-out infinite;
}
@keyframes clm-btn-pulse {
  0%,100% { box-shadow:0 0 18px rgba(167,139,250,.5),0 0 50px rgba(109,40,217,.2); }
  50%      { box-shadow:0 0 34px rgba(167,139,250,.8),0 0 80px rgba(109,40,217,.4); }
}
#clm-tooltip {
  position:absolute; right:58px; top:50%; transform:translateY(-50%);
  background:rgba(13,7,30,.92); border:1px solid rgba(167,139,250,.3);
  color:#c4b5fd; font-size:.68rem; font-weight:700; white-space:nowrap;
  padding:5px 10px; border-radius:8px; pointer-events:none;
  opacity:0; transition:opacity .2s; font-family:'DM Sans',sans-serif;
}
#clm-btn:hover #clm-tooltip { opacity:1; }

/* ── Overlay ── */
#clm-overlay {
  position:fixed; inset:0; z-index:7500;
  pointer-events:none; opacity:0;
  transition:opacity .7s ease;
  isolation:isolate;
  overflow:hidden;
}
#clm-overlay.active { opacity:1; }

/* Background album art blur */
#clm-bg-art {
  position:absolute; inset:-60px;
  background-size:cover; background-position:center;
  filter:blur(80px) brightness(.16) saturate(2);
  opacity:0; transition:opacity 1.8s ease;
  transform:scale(1.05);
}
#clm-bg-art.loaded { opacity:1; }

/* Aurora shimmer layer */
#clm-aurora {
  position:absolute; inset:0; pointer-events:none; z-index:1;
  background:
    radial-gradient(ellipse 120% 60% at 20% 80%, rgba(109,40,217,.18) 0%, transparent 55%),
    radial-gradient(ellipse 80% 80% at 80% 20%, rgba(59,130,246,.12) 0%, transparent 55%),
    radial-gradient(ellipse 100% 50% at 50% 50%, rgba(167,139,250,.06) 0%, transparent 70%);
  animation:clm-aurora-shift 12s ease-in-out infinite;
}
@keyframes clm-aurora-shift {
  0%,100% { opacity:.7; transform:translate(0,0) scale(1); }
  33%      { opacity:1;  transform:translate(20px,-15px) scale(1.04); }
  66%      { opacity:.8; transform:translate(-15px,10px) scale(.97); }
}

/* Vignette */
#clm-vignette {
  position:absolute; inset:0; z-index:2;
  background:
    radial-gradient(ellipse 90% 90% at 50% 50%, transparent 30%, rgba(5,5,20,.92) 100%),
    linear-gradient(to bottom, rgba(5,5,20,.7) 0%, transparent 25%, transparent 60%, rgba(5,5,20,.97) 100%);
}

/* Scanlines — subtle cinematic texture */
#clm-scanlines {
  position:absolute; inset:0; z-index:3; pointer-events:none;
  background:repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent 2px,
    rgba(0,0,0,.04) 2px, rgba(0,0,0,.04) 4px
  );
  opacity:.6;
}

/* Glow orb */
#clm-glow {
  position:absolute; width:600px; height:280px; border-radius:50%;
  background:radial-gradient(ellipse,rgba(139,92,246,.3) 0%,transparent 70%);
  left:50%; bottom:110px; transform:translateX(-50%);
  filter:blur(50px); z-index:2;
  animation:clm-glow-breathe 3s ease-in-out infinite;
  pointer-events:none;
}
@keyframes clm-glow-breathe {
  0%,100% { opacity:.6; transform:translateX(-50%) scale(1); }
  50%      { opacity:1;  transform:translateX(-50%) scale(1.2); }
}

/* Track pill */
#clm-pill {
  position:absolute; top:env(safe-area-inset-top,18px); margin-top:18px;
  left:50%; transform:translateX(-50%);
  display:flex; align-items:center; gap:8px;
  background:rgba(13,7,30,.6); backdrop-filter:blur(16px);
  border:1px solid rgba(139,92,246,.3); border-radius:30px;
  padding:5px 14px 5px 6px; white-space:nowrap; z-index:10;
  box-shadow:0 4px 24px rgba(0,0,0,.5), 0 0 0 1px rgba(139,92,246,.1);
}
#clm-pill-thumb {
  width:30px; height:30px; border-radius:50%; object-fit:cover;
  border:1.5px solid rgba(139,92,246,.5);
  animation:clm-spin 8s linear infinite; animation-play-state:paused;
}
#clm-pill-thumb.spin { animation-play-state:running; }
@keyframes clm-spin { to { transform:rotate(360deg); } }
#clm-pill-title  { font-size:.68rem; font-weight:700; color:#e9d5ff; display:block; }
#clm-pill-artist { font-size:.58rem; color:rgba(196,181,253,.55); display:block; }

/* ── Lyrics container — mobile default (portrait) ── */
#clm-lrc-wrap {
  position:absolute; left:0; right:0;
  bottom:0; top:0;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  gap:clamp(10px,3vw,18px);
  padding:90px 8% 120px;
  z-index:9;
  pointer-events:none;
}

/* Top + bottom fade mask pada lyric wrap */
#clm-lrc-wrap::before,
#clm-lrc-wrap::after {
  content:''; position:absolute; left:0; right:0; height:80px; z-index:1; pointer-events:none;
}
#clm-lrc-wrap::before {
  top:0;
  background:linear-gradient(to bottom, rgba(5,5,20,.95) 0%, transparent 100%);
}
#clm-lrc-wrap::after {
  bottom:0;
  background:linear-gradient(to top, rgba(5,5,20,.97) 0%, transparent 100%);
}

/* Baris sebelumnya */
.clm-prev {
  font-family:'Syne','DM Sans',sans-serif;
  font-size:clamp(.85rem,4vw,1.05rem);
  font-weight:600; color:rgba(196,181,253,.35); text-align:center;
  opacity:0; transform:translateY(8px) scale(.97);
  transition:opacity .5s ease, transform .5s ease;
  text-shadow:0 0 20px rgba(139,92,246,.2);
  line-height:1.5; letter-spacing:.01em;
  position:relative; z-index:2;
}
.clm-prev.show { opacity:1; transform:translateY(0) scale(1); }

/* Baris aktif */
.clm-main {
  font-family:'Syne','DM Sans',sans-serif;
  font-size:clamp(1.25rem,6.5vw,1.7rem);
  font-weight:800; color:#fff; text-align:center; line-height:1.3;
  opacity:0; transform:translateY(16px) scale(.95);
  transition:none;
  text-shadow:0 0 32px rgba(167,139,250,.9), 0 0 60px rgba(139,92,246,.45), 0 2px 16px rgba(0,0,0,.9);
  letter-spacing:-.01em;
  position:relative; z-index:2;
  will-change:transform,opacity;
  backface-visibility:hidden;
}
.clm-main.show {
  opacity:1; transform:translateY(0) scale(1);
  transition:opacity .38s cubic-bezier(.16,1,.3,1), transform .38s cubic-bezier(.16,1,.3,1);
}
.clm-main.chorus {
  font-size:clamp(1.45rem,7.5vw,1.95rem);
  animation:clm-chorus-glow 1.5s ease-in-out infinite alternate;
}
@keyframes clm-chorus-glow {
  from { text-shadow:0 0 32px rgba(167,139,250,.9), 0 0 60px rgba(139,92,246,.5); }
  to   { text-shadow:0 0 55px rgba(196,181,253,1),  0 0 100px rgba(167,139,250,.8), 0 0 150px rgba(109,40,217,.5); }
}
.clm-main.sad {
  color:rgba(196,181,253,.9);
  filter:blur(.2px);
  text-shadow:0 0 24px rgba(139,92,246,.4), 0 0 60px rgba(59,130,246,.2);
}
.clm-main.hype { animation:clm-hype .35s ease-in-out infinite alternate; }
@keyframes clm-hype {
  from { transform:translateY(0) scale(1); }
  to   { transform:translateY(-1px) scale(1.006); }
}
.clm-main.beat-hit { animation:clm-beat .28s ease-out !important; }
@keyframes clm-beat {
  0%   { transform:scale(1.03); }
  60%  { transform:scale(.998); }
  100% { transform:scale(1); }
}

/* Baris berikutnya */
.clm-next {
  font-family:'Syne','DM Sans',sans-serif;
  font-size:clamp(.72rem,3.5vw,.9rem);
  font-weight:500; color:rgba(196,181,253,.2); text-align:center;
  opacity:0; transform:translateY(-8px) scale(.97);
  transition:opacity .5s ease, transform .5s ease;
  line-height:1.5; letter-spacing:.01em;
  position:relative; z-index:2;
}
.clm-next.show { opacity:1; transform:translateY(0) scale(1); }

/* Waveform bar indicator */
#clm-wave {
  position:absolute; bottom:105px; left:50%; transform:translateX(-50%);
  display:flex; align-items:flex-end; gap:3px; height:22px; z-index:10;
  opacity:0; transition:opacity .4s;
}
#clm-wave.show { opacity:1; }
#clm-wave span {
  display:block; width:3px; border-radius:2px;
  background:rgba(167,139,250,.7);
  min-height:3px;
  transition:height .1s ease;
}

/* Progress */
#clm-prog {
  position:absolute; bottom:82px; left:10%; right:10%;
  height:2px; background:rgba(139,92,246,.18); border-radius:2px; z-index:10;
}
#clm-prog-fill {
  height:100%;
  background:linear-gradient(90deg, rgba(109,40,217,.8), rgba(196,181,253,.95));
  border-radius:2px; width:0%;
  box-shadow:0 0 8px rgba(167,139,250,.6);
  transition:width .4s linear;
}
/* Progress time labels */
#clm-time-cur, #clm-time-tot {
  position:absolute; bottom:64px; font-size:.58rem;
  color:rgba(196,181,253,.4); font-family:'DM Sans',sans-serif;
  font-weight:600; letter-spacing:.5px; z-index:10;
}
#clm-time-cur { left:10%; }
#clm-time-tot { right:10%; }

/* No lyric */
#clm-no-lrc {
  position:absolute; bottom:145px; left:50%; transform:translateX(-50%);
  font-size:.7rem; color:rgba(196,181,253,.3);
  letter-spacing:2.5px; text-transform:uppercase;
  opacity:0; transition:opacity .5s; white-space:nowrap; z-index:10;
  font-family:'DM Sans',sans-serif;
}
#clm-no-lrc.show { opacity:1; }

/* Particles */
.clm-pt {
  position:absolute; border-radius:50%; pointer-events:none;
  animation:clm-float linear forwards; z-index:5;
}
@keyframes clm-float {
  0%   { transform:translateY(0) scale(1) rotate(0deg);   opacity:.8; }
  100% { transform:translateY(-200px) scale(0) rotate(180deg); opacity:0; }
}

/* Dim UI saat CLM aktif */
body.clm-active .app,
body.clm-active .pbar        { opacity:.12; transition:opacity .7s ease; pointer-events:none; }
body.clm-active .np-screen   { opacity:.06 !important; transition:opacity .7s ease; pointer-events:none; }
body:not(.clm-active) .app,
body:not(.clm-active) .pbar,
body:not(.clm-active) .np-screen { opacity:1; transition:opacity .6s ease; pointer-events:auto; }

/* ── Mobile ≤480px ── */
@media (max-width:480px) {
  #clm-lrc-wrap { padding:90px 6% 130px; gap:12px; }
  #clm-prog     { left:6%; right:6%; bottom:88px; }
  #clm-time-cur { left:6%; }
  #clm-time-tot { right:6%; }
  #clm-wave     { bottom:112px; }
  #clm-btn      { bottom:148px; right:12px; width:46px; height:46px; font-size:1rem; }
  .clm-main     { font-size:clamp(1.2rem,6vw,1.55rem); }
  .clm-main.chorus { font-size:clamp(1.35rem,7vw,1.75rem); }
}

/* ── Desktop ≥768px — split layout ── */
@media (min-width:768px) {
  #clm-btn { bottom:32px; right:32px; width:48px; height:48px; font-size:.95rem; }

  /* Lirik di sisi kanan, vertikal center */
  #clm-lrc-wrap {
    left:40vw; right:0;
    top:0; bottom:0;
    justify-content:center;
    align-items:flex-start;
    padding:80px 5vw 100px 4vw;
    gap:clamp(14px,2vw,24px);
  }
  #clm-lrc-wrap::before { background:linear-gradient(to bottom, rgba(5,5,20,.98) 0%, transparent 100%); }
  #clm-lrc-wrap::after  { background:linear-gradient(to top, rgba(5,5,20,.98) 0%, transparent 100%); }

  .clm-prev  { font-size:clamp(.95rem,1.6vw,1.15rem); text-align:left; }
  .clm-main  { font-size:clamp(1.5rem,2.8vw,2.4rem); text-align:left; line-height:1.25; }
  .clm-main.chorus { font-size:clamp(1.7rem,3.2vw,2.75rem); }
  .clm-next  { font-size:clamp(.82rem,1.4vw,1.05rem); text-align:left; }

  #clm-prog  { left:40vw; right:4vw; bottom:44px; }
  #clm-time-cur { left:40vw; bottom:28px; }
  #clm-time-tot { right:4vw; bottom:28px; }
  #clm-wave  { left:auto; right:5vw; bottom:auto; top:auto; transform:none; bottom:52px; }

  #clm-pill  { left:40vw; transform:none; top:28px; }
  #clm-no-lrc { left:40vw; transform:none; bottom:160px; }

  /* Glow di sisi kanan */
  #clm-glow  { left:40vw; width:55vw; height:60vh; bottom:-10vh; }

  /* Aurora lebih dramatis di desktop */
  #clm-aurora {
    background:
      radial-gradient(ellipse 80% 100% at 15% 90%, rgba(109,40,217,.22) 0%, transparent 55%),
      radial-gradient(ellipse 60% 80% at 85% 10%, rgba(59,130,246,.15) 0%, transparent 50%),
      radial-gradient(ellipse 70% 60% at 60% 50%, rgba(167,139,250,.08) 0%, transparent 65%);
  }
}
`;

// ── INJECT CSS & HTML ────────────────────────────────────────
function inject() {
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);

  const ov = document.createElement('div');
  ov.id = 'clm-overlay';
  ov.innerHTML = `
    <div id="clm-bg-art"></div>
    <div id="clm-aurora"></div>
    <div id="clm-vignette"></div>
    <div id="clm-scanlines"></div>
    <div id="clm-glow"></div>
    <div id="clm-pill">
      <img id="clm-pill-thumb" src="" alt="">
      <div><span id="clm-pill-title">–</span><span id="clm-pill-artist">–</span></div>
    </div>
    <div id="clm-lrc-wrap">
      <div class="clm-prev" id="clm-prev"></div>
      <div class="clm-main" id="clm-main"></div>
      <div class="clm-next" id="clm-next"></div>
    </div>
    <div id="clm-no-lrc">♪ instrumental ♪</div>
    <div id="clm-wave"></div>
    <div id="clm-prog"><div id="clm-prog-fill"></div></div>
    <div id="clm-time-cur">0:00</div>
    <div id="clm-time-tot">0:00</div>
  `;
  document.body.appendChild(ov);

  // Buat 7 bar waveform
  const wave = document.getElementById('clm-wave');
  if (wave) {
    for (let i = 0; i < 7; i++) {
      const bar = document.createElement('span');
      bar.style.height = '3px';
      wave.appendChild(bar);
    }
  }

  // Button
  const btn = document.createElement('button');
  btn.id = 'clm-btn';
  btn.setAttribute('aria-label', 'Cinematic Lyrics');
  btn.innerHTML = `CC<span id="clm-tooltip">Cinematic Lyrics</span>`;
  document.body.appendChild(btn);

  // ── DRAGGABLE CC BUTTON ──────────────────────────────────────
  // Simpan posisi terakhir di localStorage supaya persisten
  (function makeDraggable(el) {
    const STORE_KEY = 'pgsk_clm_btn_pos';
    let dragging = false, startX, startY, origLeft, origBottom, hasMoved = false;

    // Restore posisi tersimpan
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved) {
        el.style.right  = 'auto';
        el.style.bottom = 'auto';
        el.style.left   = saved.left + 'px';
        el.style.top    = saved.top  + 'px';
      }
    } catch {}

    function savePos() {
      try {
        const r = el.getBoundingClientRect();
        localStorage.setItem(STORE_KEY, JSON.stringify({ left: r.left, top: r.top }));
      } catch {}
    }

    // Touch drag
    el.addEventListener('touchstart', e => {
      dragging = true; hasMoved = false;
      const t = e.touches[0];
      const r = el.getBoundingClientRect();
      startX = t.clientX - r.left;
      startY = t.clientY - r.top;
      el.style.transition = 'none';
      el.style.right  = 'auto';
      el.style.bottom = 'auto';
      el.style.left   = r.left + 'px';
      el.style.top    = r.top  + 'px';
    }, { passive: true });

    el.addEventListener('touchmove', e => {
      if (!dragging) return;
      hasMoved = true;
      e.preventDefault();
      const t = e.touches[0];
      const btnW = el.offsetWidth, btnH = el.offsetHeight;
      const maxX = window.innerWidth  - btnW;
      const maxY = window.innerHeight - btnH;
      el.style.left = Math.max(0, Math.min(maxX, t.clientX - startX)) + 'px';
      el.style.top  = Math.max(0, Math.min(maxY, t.clientY - startY)) + 'px';
    }, { passive: false });

    el.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      el.style.transition = '';
      savePos();
      // Kalau cuma tap (tidak gerak), biarkan click handler jalan
      if (hasMoved) el.dataset.wasDragged = '1';
      else delete el.dataset.wasDragged;
    });

    // Mouse drag (desktop)
    el.addEventListener('mousedown', e => {
      dragging = true; hasMoved = false;
      const r = el.getBoundingClientRect();
      startX = e.clientX - r.left;
      startY = e.clientY - r.top;
      el.style.transition = 'none';
      el.style.right  = 'auto';
      el.style.bottom = 'auto';
      el.style.left   = r.left + 'px';
      el.style.top    = r.top  + 'px';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup',   onMouseUp);
    });

    function onMouseMove(e) {
      if (!dragging) return;
      hasMoved = true;
      const btnW = el.offsetWidth, btnH = el.offsetHeight;
      const maxX = window.innerWidth  - btnW;
      const maxY = window.innerHeight - btnH;
      el.style.left = Math.max(0, Math.min(maxX, e.clientX - startX)) + 'px';
      el.style.top  = Math.max(0, Math.min(maxY, e.clientY - startY)) + 'px';
    }
    function onMouseUp() {
      dragging = false;
      el.style.transition = '';
      savePos();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
      if (hasMoved) el.dataset.wasDragged = '1';
      else delete el.dataset.wasDragged;
    }
  })(btn);

  // Tombol ditekan — AudioContext HARUS dibuat di sini (synchronous user gesture)
  btn.addEventListener('click', function () {
    // Kalau selesai drag, jangan toggle
    if (btn.dataset.wasDragged) { delete btn.dataset.wasDragged; return; }
    // Init audio graph synchronously saat gesture ini — browser policy mengharuskan ini
    initAudioGraph();
    // Lalu toggle mode
    toggleCLM();
  });
}

// ── WEB AUDIO — LAZY INIT SYNCHRONOUS ───────────────────────
// HARUS dipanggil langsung dari event handler click (synchronous call stack)
// Jika dipanggil setelah await, browser anggap bukan user gesture → suspended forever
function initAudioGraph() {
  if (_graphOK) {
    if (_ctx && _ctx.state === 'suspended') _ctx.resume();
    return;
  }

  const audioEl = document.getElementById('audioEl');
  if (!audioEl) return;

  // WAJIB: set crossOrigin sebelum createMediaElementSource
  // Tanpa ini browser keluarkan "outputs zeroes due to CORS" untuk audio dari domain lain
  // Harus di-set SEBELUM audio.src di-assign — tapi karena kita inject di sini,
  // kita perlu reload src agar crossorigin header dikirim ulang
  const prevSrc     = audioEl.src || '';
  const prevTime    = audioEl.currentTime || 0;
  const wasPlaying  = !audioEl.paused;

  if (!audioEl.crossOrigin) {
    audioEl.crossOrigin = 'anonymous';
    // Reload src agar browser kirim request ulang dengan CORS header
    // Tanpa ini crossorigin attr tidak berlaku untuk request yang sudah berjalan
    if (prevSrc && prevSrc !== window.location.href) {
      audioEl.src = prevSrc;
      audioEl.load();
      audioEl.currentTime = prevTime;
      if (wasPlaying) audioEl.play().catch(function() {});
    }
  }

  try {
    _ctx      = new (window.AudioContext || window.webkitAudioContext)();
    _src      = _ctx.createMediaElementSource(audioEl);
    _analyser = _ctx.createAnalyser();
    _analyser.fftSize = 256;

    _src.connect(_analyser);
    _analyser.connect(_ctx.destination);

    _graphOK = true;
    console.log('[CLM] Audio graph OK:', _ctx.state);
  } catch (e) {
    console.warn('[CLM] Audio graph failed:', e.message);
    _analyser = null;
    _graphOK  = false;
  }
}

function getBeatEnergy() {
  if (!_analyser || !_graphOK) return 0;
  const buf = new Uint8Array(_analyser.frequencyBinCount);
  _analyser.getByteFrequencyData(buf);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += buf[i];
  return sum / 10 / 255;
}

// ── BEAT LOOP ────────────────────────────────────────────────
function beatLoop() {
  if (!clmActive) return;
  clmBeatFrame = requestAnimationFrame(beatLoop);

  const energy = getBeatEnergy();
  clmBeatEnergy = energy;

  const isDesktop = window.innerWidth >= 768;
  const glow = document.getElementById('clm-glow');
  if (glow) {
    const scale = (1 + energy * 0.8).toFixed(3);
    glow.style.transform = isDesktop
      ? `scale(${scale})`
      : `translateX(-50%) scale(${scale})`;
    glow.style.opacity = (0.6 + energy * 0.4).toFixed(3);
  }

  // Waveform bars
  const wave = document.getElementById('clm-wave');
  if (wave && clmActive) {
    wave.classList.add('show');
    const bars = wave.querySelectorAll('span');
    bars.forEach((bar, i) => {
      const phase = Math.sin(performance.now() / 120 + i * 0.9) * 0.5 + 0.5;
      const h = Math.round(3 + (phase + energy) * 9);
      bar.style.height = Math.min(h, 22) + 'px';
      bar.style.opacity = (0.4 + energy * 0.6).toFixed(2);
    });
  }

  // Time labels
  const audioEl = document.getElementById('audioEl');
  if (audioEl) {
    const fmt = s => { const m = Math.floor(s/60); return m+':'+(Math.floor(s%60)+'').padStart(2,'0'); };
    const tc = document.getElementById('clm-time-cur');
    const tt = document.getElementById('clm-time-tot');
    if (tc) tc.textContent = fmt(audioEl.currentTime || 0);
    if (tt) tt.textContent = fmt(audioEl.duration   || 0);

    if (audioEl.duration) {
      const pct = (audioEl.currentTime / audioEl.duration) * 100;
      const fill = document.getElementById('clm-prog-fill');
      if (fill) fill.style.width = pct.toFixed(1) + '%';
    }
  }

  const now = performance.now();
  if (energy > 0.72 && now - clmLastBeat > 500) {
    clmLastBeat = now;
    const main = document.getElementById('clm-main');
    if (main && main.classList.contains('show')) {
      main.classList.remove('beat-hit');
      void main.offsetWidth;
      main.classList.add('beat-hit');
      spawnParticles();
    }
  }
}

// ── PARTICLES ────────────────────────────────────────────────
function spawnParticles() {
  const ov = document.getElementById('clm-overlay');
  if (!ov) return;
  const n = Math.floor(3 + clmBeatEnergy * 8);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'clm-pt';
    const x   = 20 + Math.random() * 60;
    const y   = 55 + Math.random() * 30;
    const dur = 1.2 + Math.random() * 1.5;
    const sz  = 2 + Math.random() * 4;
    const col = Math.random() > 0.5 ? '167,139,250' : '216,180,254';
    p.style.cssText = `left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;` +
      `background:rgba(${col},${(0.4 + Math.random() * 0.5).toFixed(2)});` +
      `animation-duration:${dur.toFixed(2)}s;`;
    ov.appendChild(p);
    setTimeout(() => p.remove(), dur * 1000);
  }
}

// ── LRC PARSER ───────────────────────────────────────────────
function parseLRC(lrcText) {
  const lines = [];
  const re = /\[(\d+):(\d+\.\d+)\](.*)/g;
  let m;
  while ((m = re.exec(lrcText)) !== null) {
    const txt = m[3].trim();
    if (txt) lines.push({ time: +m[1] * 60 + +m[2], text: txt });
  }
  lines.sort((a, b) => a.time - b.time);
  lines.forEach((l, i) => { l.mood = detectMood(l.text, i, lines.length); });
  return lines;
}

function detectMood(text, idx, total) {
  const t = text.toLowerCase();
  if (/[A-Z]{3,}/.test(text) || /yeah|hey|woah|let'?s go|fire|bang|hype/.test(t)) return 'hype';
  if (/cry|tear|alone|miss|hurt|broken|lost|pain|goodbye|never|empty/.test(t))      return 'sad';
  if (idx > total * 0.2 && idx < total * 0.85 && text.length < 55)                   return 'chorus';
  return 'verse';
}

// ── FETCH LYRICS ─────────────────────────────────────────────
async function fetchLRC(title, artist) {
  try {
    const r = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(title + ' ' + artist)}&limit=1`
    );
    const d = await r.json();
    if (d?.length && d[0].syncedLyrics) return parseLRC(d[0].syncedLyrics);
  } catch (e) {}
  return [];
}

// ── LYRIC SYNC INTERVAL ──────────────────────────────────────
function startSync() {
  if (clmInterval) clearInterval(clmInterval);
  let lastIdx = -1;

  clmInterval = setInterval(function () {
    if (!clmActive) return;
    const audio = document.getElementById('audioEl');
    if (!audio || !clmLrcLines.length) { showNoLrc(true); return; }

    const cur = audio.currentTime;
    let idx = 0;
    for (let i = 0; i < clmLrcLines.length; i++) {
      if (cur >= clmLrcLines[i].time) idx = i;
    }

    if (idx === lastIdx) return;
    lastIdx = idx;

    const line = clmLrcLines[idx];
    const prev = idx > 0                       ? clmLrcLines[idx - 1] : null;
    const next = idx < clmLrcLines.length - 1  ? clmLrcLines[idx + 1] : null;

    showNoLrc(false);
    showLines(prev ? prev.text : '', line.text, next ? next.text : '', line.mood);
  }, 350);
}

function showLines(prev, main, next, mood) {
  const ep = document.getElementById('clm-prev');
  const em = document.getElementById('clm-main');
  const en = document.getElementById('clm-next');
  if (!ep || !em || !en) return;

  em.classList.remove('show');
  setTimeout(function () {
    ep.textContent = prev; em.textContent = main; en.textContent = next;
    ep.classList.toggle('show', !!prev);
    en.classList.toggle('show', !!next);
    em.classList.remove('chorus', 'sad', 'hype', 'verse', 'beat-hit');
    void em.offsetWidth;
    em.classList.add('show', mood || 'verse');
    updateGlowMood(mood);
  }, 90);
}

function showNoLrc(on) {
  const el = document.getElementById('clm-no-lrc');
  const wr = document.getElementById('clm-lrc-wrap');
  if (el) el.classList.toggle('show', on);
  if (wr) wr.style.opacity = on ? '0' : '1';
}

function updateGlowMood(mood) {
  const bg = document.getElementById('clm-bg-art');
  if (!bg) return;
  const sat = { chorus: '2.4', sad: '1.1', hype: '2.8', verse: '1.8' };
  const bri = { chorus: '.22', sad: '.12', hype: '.28', verse: '.16' };
  bg.style.filter = `blur(80px) brightness(${bri[mood]||'.16'}) saturate(${sat[mood]||'1.8'})`;

  // Warna glow sesuai mood
  const glow = document.getElementById('clm-glow');
  if (!glow) return;
  const glowColor = {
    chorus: 'rgba(167,139,250,.35)',
    sad:    'rgba(96,165,250,.25)',
    hype:   'rgba(251,113,133,.3)',
    verse:  'rgba(139,92,246,.28)',
  };
  glow.style.background = `radial-gradient(ellipse,${glowColor[mood]||glowColor.verse} 0%,transparent 70%)`;
}

// ── TRACK INFO (with retry + DOM fallback) ───────────────────
function updateTrackInfo(retry) {
  retry = retry || 0;
  let t = window.currentTrack;

  if (!t) {
    const ti = document.getElementById('plTitle');
    const ai = document.getElementById('plArt');
    const ii = document.getElementById('plImg');
    if (ti && ti.textContent && ti.textContent !== '–') {
      t = { title: ti.textContent, artist: ai ? ai.textContent : '', thumbnail: ii ? ii.src : '' };
    }
  }

  if (!t && retry < 25) { setTimeout(function () { updateTrackInfo(retry + 1); }, 300); return; }
  if (!t) return;

  const thumb = document.getElementById('clm-pill-thumb');
  const tit   = document.getElementById('clm-pill-title');
  const art   = document.getElementById('clm-pill-artist');
  const bg    = document.getElementById('clm-bg-art');

  if (thumb && t.thumbnail && t.thumbnail !== window.location.href) {
    thumb.src = t.thumbnail;
    thumb.onerror = function () { thumb.src = ''; };
  }
  if (tit)  tit.textContent  = t.title  || '–';
  if (art)  art.textContent  = t.artist || '–';
  if (bg && t.thumbnail && t.thumbnail !== window.location.href) {
    bg.style.backgroundImage = "url('" + t.thumbnail + "')";
    bg.classList.add('loaded');
  }
}

function setThumbSpin(on) {
  const el = document.getElementById('clm-pill-thumb');
  if (el) el.classList.toggle('spin', on);
}

// ── HOOK: detect track change & play/pause ───────────────────
function hookPlayer() {
  const audio = document.getElementById('audioEl');
  if (!audio) return;

  let lastSrc = '';
  let fetching = false;

  setInterval(function () {
    if (!clmActive) return;

    const src = audio.src || '';
    if (src && src !== lastSrc && src !== window.location.href) {
      lastSrc  = src;
      fetching = false;

      updateTrackInfo(0);

      clmLrcLines = [];
      const em = document.getElementById('clm-main');
      if (em) { em.classList.remove('show','chorus','sad','hype','verse','beat-hit'); void em.offsetWidth; em.textContent = '♪'; em.classList.add('show','verse'); }
      showNoLrc(false);

      // Fetch lyrics dengan retry untuk tunggu currentTrack ready
      var tryFetch = function (n) {
        if (fetching) return;
        var t = window.currentTrack;
        if (!t) {
          var ti = document.getElementById('plTitle');
          var ai = document.getElementById('plArt');
          if (ti && ti.textContent && ti.textContent !== '–') t = { title: ti.textContent, artist: ai ? ai.textContent : '' };
        }
        if (!t && n < 20) { setTimeout(function () { tryFetch(n + 1); }, 300); return; }
        if (!t) { showNoLrc(true); return; }
        fetching = true;
        fetchLRC(t.title, t.artist).then(function (lines) {
          clmLrcLines = lines; fetching = false;
          if (!lines.length) showNoLrc(true);
        }).catch(function () { fetching = false; showNoLrc(true); });
      };
      setTimeout(function () { tryFetch(0); }, 400);
    }

    setThumbSpin(!audio.paused);
  }, 600);
}

// ── TOGGLE CLM ───────────────────────────────────────────────
// NOTE: initAudioGraph() dipanggil SEBELUM fungsi ini dari event listener
// sehingga tetap synchronous dalam user gesture call stack
async function toggleCLM() {
  clmActive = !clmActive;
  const btn = document.getElementById('clm-btn');
  const ov  = document.getElementById('clm-overlay');

  if (clmActive) {
    btn.classList.add('active');
    document.body.classList.add('clm-active');
    ov.classList.add('active');

    // Resume jika suspended (double safety)
    if (_ctx && _ctx.state === 'suspended') _ctx.resume();

    updateTrackInfo(0);

    const audio = document.getElementById('audioEl');
    if (audio) setThumbSpin(!audio.paused);

    beatLoop();

    // Fetch lyrics
    const em = document.getElementById('clm-main');
    if (em) { em.classList.remove('show','chorus','sad','hype','verse'); void em.offsetWidth; em.textContent = '♪'; em.classList.add('show','verse'); }
    showNoLrc(false);

    const t = window.currentTrack || null;
    if (t) {
      clmLrcLines = await fetchLRC(t.title, t.artist);
      if (!clmLrcLines.length) showNoLrc(true);
    } else {
      // Tunggu track dengan DOM fallback
      updateTrackInfo(0);
    }

    startSync();

  } else {
    btn.classList.remove('active');
    document.body.classList.remove('clm-active');
    ov.classList.remove('active');
    setThumbSpin(false);

    if (clmInterval)  { clearInterval(clmInterval);          clmInterval  = null; }
    if (clmBeatFrame) { cancelAnimationFrame(clmBeatFrame);  clmBeatFrame = null; }

    const glow = document.getElementById('clm-glow');
    if (glow) { glow.style.transform = ''; glow.style.opacity = '.5'; }

    const wave = document.getElementById('clm-wave');
    if (wave) {
      wave.classList.remove('show');
      wave.querySelectorAll('span').forEach(b => { b.style.height = '3px'; });
    }

    ['clm-prev','clm-main','clm-next'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('show','chorus','sad','hype','verse','beat-hit'); el.textContent = ''; }
    });
    showNoLrc(false);
  }
}

// ── KEYBOARD SHORTCUT ────────────────────────────────────────
document.addEventListener('keydown', function (e) {
  if (e.key !== 'c' && e.key !== 'C') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (document.activeElement || {}).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  initAudioGraph();
  toggleCLM();
});

// ── INIT ─────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { inject(); hookPlayer(); });
} else {
  inject();
  hookPlayer();
}

})();
