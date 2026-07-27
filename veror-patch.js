// ─────────────────────────────────────────────────────────────────
//  veror-patch.js  —  veroR backend + YouTube IFrame Player
//  Pasang SETELAH semua script lain, sebelum </body>
// ─────────────────────────────────────────────────────────────────

const VEROR_URL = 'https://vero-r.vercel.app'; // ← ganti jika URL berubah

window.BACKEND_URL = VEROR_URL;

// ══════════════════════════════════════════════════════════════════
//  1. YOUTUBE IFRAME ENGINE
// ══════════════════════════════════════════════════════════════════

// Inject YouTube IFrame API script sekali saja
(function () {
  if (document.getElementById('yt-iframe-api')) return;
  const s = document.createElement('script');
  s.id  = 'yt-iframe-api';
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
})();

// Container tersembunyi untuk IFrame player
const _ytContainer = document.createElement('div');
_ytContainer.id = 'yt-hidden-player';
_ytContainer.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;opacity:0;';
document.body.appendChild(_ytContainer);

let _ytPlayer     = null;   // instance YT.Player
let _ytReady      = false;  // API sudah load?
let _ytPending    = null;   // videoId yang mau diputar sebelum player siap
let _ytTrack      = null;   // track object yang sedang aktif
let _ytProgressId = null;   // setInterval untuk progress bar
let _ytAudioCtx   = null;   // AudioContext untuk visualizer
let _ytAnalyser   = null;
let _ytGainNode   = null;
let _ytVolume     = 1.0;
let _ytQueue      = [];     // antrian videoId + track objects
let _ytQueueIdx   = -1;

// Callback dari YouTube IFrame API saat siap
window.onYouTubeIframeAPIReady = function () {
  _ytPlayer = new YT.Player('yt-hidden-player', {
    height: '1', width: '1',
    playerVars: {
      autoplay: 0, controls: 0, disablekb: 1,
      enablejsapi: 1, fs: 0, iv_load_policy: 3,
      modestbranding: 1, playsinline: 1, rel: 0,
    },
    events: {
      onReady:       _onYTReady,
      onStateChange: _onYTStateChange,
      onError:       _onYTError,
    },
  });
};

function _onYTReady() {
  _ytReady = true;
  // Set volume awal dari slider yang sudah ada
  const vol = typeof currentVolume !== 'undefined' ? currentVolume : 1;
  _ytVolume = vol;
  _ytPlayer.setVolume(Math.round(vol * 100));
  if (_ytPending) { _ytLoadAndPlay(_ytPending); _ytPending = null; }
}

function _onYTStateChange(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) {
    _ytStartProgress();
    _ytUpdateUI('play');
    _ytInitVisualizer();
  } else if (e.data === S.PAUSED) {
    _ytStopProgress();
    _ytUpdateUI('pause');
  } else if (e.data === S.ENDED) {
    _ytStopProgress();
    _ytUpdateUI('pause');
    _ytPlayNext();
  } else if (e.data === S.BUFFERING) {
    // opsional: tampilkan loading
  }
}

function _onYTError(e) {
  console.warn('[YT IFrame] error code:', e.data);
  toast('⚠️ Lagu tidak tersedia di YouTube (' + e.data + ')');
  _ytStopProgress();
  _ytPlayNext();
}

// ── Load + play videoId ───────────────────────────────────────────
function _ytLoadAndPlay(videoId) {
  if (!_ytReady || !_ytPlayer) { _ytPending = videoId; return; }
  _ytPlayer.loadVideoById(videoId);
  _ytPlayer.setVolume(Math.round(_ytVolume * 100));
}

// ── Progress bar ─────────────────────────────────────────────────
function _ytStartProgress() {
  _ytStopProgress();
  _ytProgressId = setInterval(() => {
    if (!_ytPlayer || !_ytReady) return;
    try {
      const cur = _ytPlayer.getCurrentTime() || 0;
      const dur = _ytPlayer.getDuration()    || 0;
      _ytSyncUI(cur, dur);
    } catch (_) {}
  }, 500);
}

function _ytStopProgress() {
  if (_ytProgressId) { clearInterval(_ytProgressId); _ytProgressId = null; }
}

// ── Seek (dipanggil dari progress bar lama) ───────────────────────
const _origSeek = window.seekTo;
window.seekTo = function (pct) {
  if (!_ytPlayer || !_ytReady) { if (_origSeek) _origSeek(pct); return; }
  try {
    const dur = _ytPlayer.getDuration() || 0;
    if (dur) _ytPlayer.seekTo(dur * pct, true);
  } catch (_) {}
};

// ── Volume ────────────────────────────────────────────────────────
const _origSetVol = window.setVolume;
window.setVolume = function (v) {
  _ytVolume = v;
  if (_ytPlayer && _ytReady) _ytPlayer.setVolume(Math.round(v * 100));
  if (_origSetVol) _origSetVol(v);
};

// ── Play / Pause toggle ───────────────────────────────────────────
const _origToggle = window.togglePlay;
window.togglePlay = function () {
  if (!_ytPlayer || !_ytReady) { if (_origToggle) _origToggle(); return; }
  try {
    const state = _ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) _ytPlayer.pauseVideo();
    else _ytPlayer.playVideo();
  } catch (_) {}
};

// ── Queue & next/prev ─────────────────────────────────────────────
function _ytPlayNext() {
  if (_ytQueue.length && _ytQueueIdx < _ytQueue.length - 1) {
    _ytQueueIdx++;
    const t = _ytQueue[_ytQueueIdx];
    _ytTrack = t;
    _ytShowHero(t);
    _ytLoadAndPlay(t.videoId);
    _saveTrackYT(t);
  } else if (typeof playNext === 'function') {
    playNext();
  }
}

const _origNext = window.playNext;
window.playNext = function () {
  if (_ytQueue.length && _ytQueueIdx < _ytQueue.length - 1) { _ytPlayNext(); return; }
  if (_origNext) _origNext();
};

const _origPrev = window.playPrev;
window.playPrev = function () {
  if (_ytPlayer && _ytReady) {
    try {
      if ((_ytPlayer.getCurrentTime() || 0) > 3) { _ytPlayer.seekTo(0, true); return; }
    } catch (_) {}
  }
  if (_ytQueue.length && _ytQueueIdx > 0) {
    _ytQueueIdx--;
    const t = _ytQueue[_ytQueueIdx];
    _ytTrack = t;
    _ytShowHero(t);
    _ytLoadAndPlay(t.videoId);
  } else if (_origPrev) {
    _origPrev();
  }
};

// ── Visualizer via AudioContext ───────────────────────────────────
function _ytInitVisualizer() {
  // IFrame audio tidak bisa di-capture AudioContext karena cross-origin.
  // Kita buat visualizer animasi saja (fake waveform) agar UI tetap hidup.
  if (typeof startFakeVisualizer === 'function') { startFakeVisualizer(); return; }
  const canvas = document.getElementById('visualizerCanvas') || document.getElementById('waveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let frame;
  function draw() {
    frame = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 48, w = canvas.width / bars;
    for (let i = 0; i < bars; i++) {
      const h = (Math.sin(Date.now() / 300 + i * 0.4) * 0.5 + 0.5)
              * (Math.random() * 0.3 + 0.7) * canvas.height * 0.8;
      ctx.fillStyle = `hsla(${140 + i * 2}, 70%, 55%, 0.85)`;
      ctx.fillRect(i * w + 1, canvas.height - h, w - 2, h);
    }
  }
  // Hentikan frame lama kalau ada
  if (window._ytVizFrame) cancelAnimationFrame(window._ytVizFrame);
  window._ytVizFrame = frame;
  draw();
}

// ── Sync UI (progress, waktu) ────────────────────────────────────
function _ytSyncUI(cur, dur) {
  // Progress bar
  const bar = document.getElementById('progressBar') || document.getElementById('seekBar');
  if (bar) {
    const pct = dur ? (cur / dur) * 100 : 0;
    bar.style.width = pct + '%';
    if (bar.tagName === 'INPUT') bar.value = pct;
  }
  // Waktu
  const fmt = (s) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const elCur = document.getElementById('currentTime') || document.getElementById('timeNow');
  const elDur = document.getElementById('totalTime')   || document.getElementById('timeDur');
  if (elCur) elCur.textContent = fmt(cur);
  if (elDur) elDur.textContent = fmt(dur);
}

// ── Update tombol play/pause di UI ───────────────────────────────
function _ytUpdateUI(state) {
  const btn = document.getElementById('playBtn') || document.getElementById('playPauseBtn');
  if (!btn) return;
  const icon = btn.querySelector('i') || btn;
  if (state === 'play') {
    icon.className = icon.className?.replace('fa-play','fa-pause') || 'fas fa-pause';
  } else {
    icon.className = icon.className?.replace('fa-pause','fa-play') || 'fas fa-play';
  }
}

// ── Show hero / now playing ───────────────────────────────────────
function _ytShowHero(track) {
  if (typeof showHero === 'function') { showHero(track, 'youtube'); return; }
  // Fallback manual
  const title = document.getElementById('trackTitle') || document.getElementById('nowTitle');
  const artist = document.getElementById('trackArtist') || document.getElementById('nowArtist');
  const thumb  = document.getElementById('trackThumb')  || document.getElementById('nowThumb');
  if (title)  title.textContent  = track.title  || '';
  if (artist) artist.textContent = track.artist || '';
  if (thumb)  thumb.src          = track.thumbnail || '';
}

// ══════════════════════════════════════════════════════════════════
//  2. SEARCH (tetap via veroR)
// ══════════════════════════════════════════════════════════════════

window.doSearch = async function () {
  const q = document.getElementById('sInput')?.value?.trim();
  if (!q) { toast('Masukkan kata kunci pencarian'); return; }
  if (typeof navigate === 'function' && window.currentPage !== 'beranda') navigate('beranda');
  if (typeof setBtnLoad === 'function') setBtnLoad(true);
  if (typeof setState  === 'function') setState('load');
  if (typeof setStLoad === 'function') setStLoad(`Mencari "${q}"`, '🎵 YouTube Music...');
  try {
    const res  = await fetch(`${VEROR_URL}/api/search?q=${encodeURIComponent(q)}`);
    const d    = await res.json();
    if (!d.ok) throw new Error(d.message || 'Pencarian gagal');
    if (!d.result?.length) throw new Error('Tidak ada hasil');
    _renderYTResults(d.result, q);
    if (typeof saveSug === 'function') saveSug(q);
  } catch (err) {
    if (typeof setState === 'function') setState('err');
    const et = document.getElementById('stErrT');
    const em = document.getElementById('stErrM');
    if (et) et.textContent = 'Gagal mencari';
    if (em) em.textContent = err.message;
    toast('⚠️ ' + err.message);
  } finally {
    if (typeof setBtnLoad === 'function') setBtnLoad(false);
  }
};

function _renderYTResults(results, query) {
  const wrap = document.getElementById('searchResultsWrap');
  const grid = document.getElementById('srGrid');
  const lbl  = document.getElementById('searchResultsLabel');
  if (!wrap || !grid) return;
  wrap.style.display = 'block';
  if (lbl) lbl.textContent = `Hasil: ${results.length} lagu`;
  grid.innerHTML = '';
  results.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'sr-item';
    item.addEventListener('click', () => playYouTube(r));
    const td  = document.createElement('div'); td.className = 'sr-thumb';
    const img = document.createElement('img');
    img.src = r.thumbnail || '';
    img.onerror = function () { this.src = typeof PH !== 'undefined' ? PH : ''; };
    td.appendChild(img);
    const info = document.createElement('div'); info.className = 'sr-info';
    const te   = document.createElement('div'); te.className = 'sr-title'; te.textContent = r.title;
    const meta = document.createElement('div'); meta.className = 'sr-meta';
    meta.innerHTML = `<span class="sr-badge">YT</span> ${r.artist || ''}`;
    info.appendChild(te); info.appendChild(meta);
    const dur = document.createElement('div');
    dur.style.cssText = 'font-size:.7rem;color:var(--t2,#888);margin-left:auto;padding-right:4px';
    dur.textContent = r.duration || '';
    item.appendChild(td); item.appendChild(info); item.appendChild(dur);
    grid.appendChild(item);
  });
  if (typeof setState === 'function') setState('none');
}

// ══════════════════════════════════════════════════════════════════
//  3. PLAY TRACK (via IFrame, bukan proxy)
// ══════════════════════════════════════════════════════════════════

window.playYouTube = async function (track) {
  const videoId   = track.videoId || track.video_id || track.id;
  const title     = track.title     || 'Unknown';
  const artist    = track.artist    || 'Unknown';
  const thumbnail = track.thumbnail || (typeof PH !== 'undefined' ? PH : '');
  const duration  = track.duration  || '';

  if (!videoId) { toast('Video ID tidak ditemukan'); return; }

  const trackObj = {
    id: videoId, videoId, video_id: videoId,
    title, artist, thumbnail, duration,
    audio: null, source: 'youtube',
  };

  _ytTrack = trackObj;

  // Tambah ke queue
  if (_ytQueueIdx === -1 || _ytQueue[_ytQueueIdx]?.videoId !== videoId) {
    _ytQueue = _ytQueue.slice(0, _ytQueueIdx + 1);
    _ytQueue.push(trackObj);
    _ytQueueIdx = _ytQueue.length - 1;
  }

  _ytShowHero(trackObj);
  _ytLoadAndPlay(videoId);
  _saveTrackYT(trackObj);

  if (typeof setState  === 'function') setState('none');
  if (typeof addToQueue === 'function') addToQueue(trackObj);
};

// Override playTrackObj agar lagu dari DB juga lewat IFrame
window.playTrackObj = async function (t) {
  const vid = t.videoId || t.video_id || t.id;
  if (vid && /^[A-Za-z0-9_-]{11}$/.test(vid)) {
    playYouTube({ ...t, videoId: vid });
  } else {
    toast('⚠️ Format track tidak dikenali');
  }
};

// ══════════════════════════════════════════════════════════════════
//  4. SUPABASE — simpan video_id bukan audio_url
// ══════════════════════════════════════════════════════════════════

async function _saveTrackYT(track) {
  try {
    const rows = await sb.get('tracks', `id=eq.${encodeURIComponent(track.videoId)}`);
    const pc   = rows?.length ? (rows[0].play_count || 0) + 1 : 1;
    await fetch(`${window.SB_URL}/rest/v1/tracks?on_conflict=id`, {
      method: 'POST',
      headers: { ...sb._h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id:          track.videoId,
        video_id:    track.videoId,
        title:       track.title,
        artist:      track.artist,
        thumbnail:   track.thumbnail || null,
        duration:    track.duration  || null,
        play_count:  pc,
        last_played: new Date().toISOString(),
        searched_by: (typeof session !== 'undefined' ? session?.nama : null) || null,
        source:      'youtube',
      }),
    });
  } catch (e) { console.warn('[saveTrackYT]', e.message); }
}

window.rowToTrack = function (r, src = 'db') {
  return {
    id:        r.id,
    videoId:   r.video_id || r.id,
    video_id:  r.video_id || r.id,
    title:     r.title    || '',
    artist:    r.artist   || '',
    duration:  r.duration || '',
    thumbnail: typeof resizeThumb === 'function'
               ? resizeThumb(r.thumbnail || '', 300)
               : (r.thumbnail || ''),
    audio:     null,
    playCount: r.play_count || 0,
    source:    src,
  };
};

// ══════════════════════════════════════════════════════════════════
//  5. PARTY & CHAT
// ══════════════════════════════════════════════════════════════════

window.playPartyTrack = async function (pi) {
  toast('🎉 Memutar dari Party Queue...');
  const vid = pi.track_id || pi.video_id;
  if (vid && /^[A-Za-z0-9_-]{11}$/.test(vid)) {
    playYouTube({ videoId: vid, title: pi.title, artist: pi.artist, thumbnail: pi.thumbnail });
    if (typeof navigate === 'function') navigate('beranda');
  } else {
    toast('⚠️ Format track tidak valid');
  }
};

window.playFromChat = async function (trackId) {
  if (/^[A-Za-z0-9_-]{11}$/.test(trackId)) {
    playYouTube({ videoId: trackId });
  } else {
    const t = (_ytQueue || []).find(q => q.id === trackId);
    if (t) playYouTube(t);
    else toast('Gagal load lagu');
  }
};

// ══════════════════════════════════════════════════════════════════
//  6. HOME FEED
// ══════════════════════════════════════════════════════════════════

async function _loadHomeFeed() {
  try {
    const res = await fetch(`${VEROR_URL}/api/home`);
    const d   = await res.json();
    if (!d.ok || !d.sections?.length) return null;
    return d.sections;
  } catch { return null; }
}

window.loadQuickPlay = async function () {
  const el  = document.getElementById('qpGrid');
  const sec = document.getElementById('quickPlaySec');
  if (!el || !sec) return;

  // Coba DB dulu
  try {
    const rows = await sb.get('tracks', 'order=last_played.desc.nullslast&limit=50');
    if (rows?.length) {
      sec.style.display = 'block';
      if (document.getElementById('qpCnt'))
        document.getElementById('qpCnt').textContent = rows.length;
      el.innerHTML = '';
      rows.forEach((r) => {
        const t    = rowToTrack(r, 'db');
        const card = document.createElement('div');
        card.className = 'qp-card sk-loaded';
        card.addEventListener('click', () => playYouTube(t));
        const thumb = document.createElement('div'); thumb.className = 'qp-thumb';
        const img   = document.createElement('img');
        img.src = r.thumbnail || ''; img.loading = 'lazy';
        img.onerror = function () { this.src = typeof PH !== 'undefined' ? PH : ''; };
        const pb = document.createElement('button'); pb.className = 'qp-play-btn';
        pb.innerHTML = '<i class="fas fa-play"></i>';
        pb.addEventListener('click', (e) => { e.stopPropagation(); playYouTube(t); });
        thumb.appendChild(img); thumb.appendChild(pb); card.appendChild(thumb);
        const te = document.createElement('div'); te.className = 'qp-title'; te.textContent = r.title || '';
        const ae = document.createElement('div'); ae.className = 'qp-artist'; ae.textContent = r.artist || '';
        const me = document.createElement('div'); me.className = 'qp-meta';
        me.innerHTML = `<span><i class="fas fa-headphones" style="font-size:.48rem"></i> ${r.play_count||0}×</span>${r.duration?'<span>'+r.duration+'</span>':''}`;
        card.appendChild(te); card.appendChild(ae); card.appendChild(me);
        el.appendChild(card);
      });
      return;
    }
  } catch (e) { console.warn('[loadQuickPlay]', e.message); }

  // DB kosong — pakai home feed YouTube
  const sections = await _loadHomeFeed();
  if (!sections) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  const first = sections[0];
  if (document.getElementById('qpCnt'))
    document.getElementById('qpCnt').textContent = first.items.length;
  el.innerHTML = '';
  first.items.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'qp-card sk-loaded';
    card.addEventListener('click', () => playYouTube(r));
    const thumb = document.createElement('div'); thumb.className = 'qp-thumb';
    const img   = document.createElement('img'); img.src = r.thumbnail || '';
    img.onerror = function () { this.src = typeof PH !== 'undefined' ? PH : ''; };
    const pb = document.createElement('button'); pb.className = 'qp-play-btn';
    pb.innerHTML = '<i class="fas fa-play"></i>';
    pb.addEventListener('click', (e) => { e.stopPropagation(); playYouTube(r); });
    thumb.appendChild(img); thumb.appendChild(pb); card.appendChild(thumb);
    const te = document.createElement('div'); te.className = 'qp-title'; te.textContent = r.title || '';
    const ae = document.createElement('div'); ae.className = 'qp-artist'; ae.textContent = r.artist || '';
    const me = document.createElement('div'); me.className = 'qp-meta';
    me.innerHTML = r.duration ? `<span>${r.duration}</span>` : '';
    card.appendChild(te); card.appendChild(ae); card.appendChild(me);
    el.appendChild(card);
  });

  // Section tambahan
  const extra = document.getElementById('ytExtraSections') || (() => {
    const d = document.createElement('div');
    d.id = 'ytExtraSections'; d.style.marginTop = '16px';
    sec.appendChild(d); return d;
  })();
  extra.innerHTML = '';
  sections.slice(1).forEach((sec2) => {
    const h = document.createElement('h3');
    h.style.cssText = 'font-size:.85rem;font-weight:700;color:var(--tx,#eef);margin:16px 0 8px';
    h.textContent = sec2.label; extra.appendChild(h);
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px';
    sec2.items.slice(0, 8).forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'chart-item'; row.style.cursor = 'pointer';
      row.addEventListener('click', () => playYouTube(r));
      const rank = document.createElement('div'); rank.className = 'chart-rank'; rank.textContent = i + 1;
      const th = document.createElement('div'); th.className = 'chart-th';
      const img = document.createElement('img'); img.src = r.thumbnail || '';
      img.onerror = function () { this.src = ''; };
      th.appendChild(img);
      const inf = document.createElement('div'); inf.className = 'chart-inf';
      const ct  = document.createElement('div'); ct.className = 'chart-t'; ct.textContent = r.title || '';
      const ca  = document.createElement('div'); ca.className = 'chart-a'; ca.textContent = r.artist || '';
      inf.appendChild(ct); inf.appendChild(ca);
      const dur = document.createElement('div');
      dur.style.cssText = 'font-size:.7rem;color:var(--t2,#888);margin-left:auto';
      dur.textContent = r.duration || '';
      row.appendChild(rank); row.appendChild(th); row.appendChild(inf); row.appendChild(dur);
      list.appendChild(row);
    });
    extra.appendChild(list);
  });
};

window.loadTopChartHome = async function () {
  try {
    const rows = await sb.get('tracks', 'order=play_count.desc&limit=5&play_count=gt.0');
    if (rows?.length) {
      const sec = document.getElementById('chartSecHome');
      if (sec) sec.style.display = 'block';
      if (typeof renderChartList === 'function') renderChartList(rows, 'chartListHome');
      return;
    }
  } catch {}
  const sec = document.getElementById('chartSecHome');
  if (sec) sec.style.display = 'none';
};

console.log('[veror-patch] IFrame engine ready →', VEROR_URL);
