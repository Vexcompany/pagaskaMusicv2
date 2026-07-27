// ─────────────────────────────────────────────────────────────────
//  veror-patch.js  —  YouTube IFrame engine + veroR search
//  Pasang SETELAH semua script lain, sebelum </body>
// ─────────────────────────────────────────────────────────────────
const VEROR_URL = 'https://vero-r.vercel.app';
window.BACKEND_URL = VEROR_URL;

// ══════════════════════════════════════════════════════════════════
//  1. IFRAME ENGINE
// ══════════════════════════════════════════════════════════════════
(function () {
  if (document.getElementById('yt-iframe-api')) return;
  const s = document.createElement('script');
  s.id = 'yt-iframe-api';
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
})();

// Container IFrame — di luar semua .page agar tidak ikut di-hide
const _ytWrap = document.createElement('div');
_ytWrap.id = 'yt-player-wrap';
_ytWrap.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;left:0;opacity:0;pointer-events:none;z-index:-1';
document.body.appendChild(_ytWrap);

let _ytPlayer  = null;
let _ytReady   = false;
let _ytPending = null;   // videoId yang antri sebelum player siap
let _ytProgId  = null;

// ── Init player ───────────────────────────────────────────────────
window.onYouTubeIframeAPIReady = function () {
  _ytPlayer = new YT.Player('yt-player-wrap', {
    height: '1', width: '1',
    playerVars: { autoplay:0, controls:0, disablekb:1, enablejsapi:1,
                  fs:0, iv_load_policy:3, modestbranding:1, playsinline:1, rel:0 },
    events: {
      onReady:       _ytOnReady,
      onStateChange: _ytOnState,
      onError:       _ytOnError,
    },
  });
};

function _ytOnReady() {
  _ytReady = true;
  _ytSetVol(typeof vol !== 'undefined' ? vol : 0.7);
  if (_ytPending) { _ytLoad(_ytPending); _ytPending = null; }
}

function _ytOnState(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) {
    isPlaying = true;
    _ytStartProg();
    updAll();
    _ytVizStart();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  } else if (e.data === S.PAUSED) {
    isPlaying = false;
    _ytStopProg();
    updAll();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  } else if (e.data === S.ENDED) {
    isPlaying = false;
    _ytStopProg();
    updAll();
    // Pakai sistem next lama
    if (typeof playNextTrack === 'function') playNextTrack();
    else if (typeof playNext === 'function') playNext();
  }
}

function _ytOnError(e) {
  console.warn('[YT]', e.data);
  toast('⚠️ Lagu tidak tersedia (' + e.data + ')');
  isPlaying = false;
  _ytStopProg();
  updAll();
  if (typeof playNextTrack === 'function') playNextTrack();
}

// ── Load videoId ke player ────────────────────────────────────────
function _ytLoad(videoId) {
  if (!_ytReady || !_ytPlayer) { _ytPending = videoId; return; }
  _ytPlayer.loadVideoById(videoId);
}

// ── Volume ────────────────────────────────────────────────────────
function _ytSetVol(v) {
  if (_ytPlayer && _ytReady) _ytPlayer.setVolume(Math.round(v * 100));
}

// ── Progress bar — sync ke elemen lama ───────────────────────────
function _ytStartProg() {
  _ytStopProg();
  _ytProgId = setInterval(() => {
    if (!_ytPlayer || !_ytReady) return;
    try {
      const cur = _ytPlayer.getCurrentTime() || 0;
      const dur = _ytPlayer.getDuration()    || 0;
      if (!dur) return;
      const pct = (cur / dur) * 100;
      // progress bar utama
      const prfill = document.getElementById('prfill');
      if (prfill) prfill.style.width = pct + '%';
      const ptCur = document.getElementById('ptCur');
      if (ptCur) ptCur.textContent = fmt(cur);
      const ptTot = document.getElementById('ptTot');
      if (ptTot) ptTot.textContent = fmt(dur);
      // now playing panel
      const npPrfill = document.getElementById('npPrfill');
      if (npPrfill) npPrfill.style.width = pct + '%';
      const npCur = document.getElementById('npCur');
      if (npCur) npCur.textContent = fmt(cur);
      const npTot = document.getElementById('npTot');
      if (npTot) npTot.textContent = fmt(dur);
      // mini player
      const plPrfill = document.getElementById('plPrfill');
      if (plPrfill) plPrfill.style.width = pct + '%';
      // mediaSession
      if ('mediaSession' in navigator && typeof _updPos === 'function') _updPos();
    } catch (_) {}
  }, 400);
}

function _ytStopProg() {
  if (_ytProgId) { clearInterval(_ytProgId); _ytProgId = null; }
}

// ── Visualizer (fake — IFrame cross-origin tidak bisa AudioContext) ─
let _ytVizId = null;
function _ytVizStart() {
  if (_ytVizId) return;
  const canvas = document.getElementById('visualizerCanvas') || document.getElementById('waveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  function draw() {
    _ytVizId = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 48, w = canvas.width / bars;
    for (let i = 0; i < bars; i++) {
      const h = (Math.sin(Date.now() / 300 + i * 0.4) * 0.5 + 0.5)
              * (Math.random() * 0.3 + 0.7) * canvas.height * 0.75;
      ctx.fillStyle = `hsla(${140 + i * 2},70%,55%,.85)`;
      ctx.fillRect(i * w + 1, canvas.height - h, w - 2, h);
    }
  }
  draw();
}
function _ytVizStop() {
  if (_ytVizId) { cancelAnimationFrame(_ytVizId); _ytVizId = null; }
}

// ══════════════════════════════════════════════════════════════════
//  2. OVERRIDE KONTROL — sambungkan ke IFrame
// ══════════════════════════════════════════════════════════════════

// togglePlay
const _origToggle = window.togglePlay;
window.togglePlay = function () {
  if (!_ytPlayer || !_ytReady) { if (_origToggle) _origToggle(); return; }
  try {
    const state = _ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) _ytPlayer.pauseVideo();
    else _ytPlayer.playVideo();
  } catch (_) {}
};

// seek — progress bar lama pakai prbar onclick → npSeek / seekClick
const _origNpSeek = window.npSeek;
window.npSeek = function (e) {
  if (!_ytPlayer || !_ytReady) { if (_origNpSeek) _origNpSeek(e); return; }
  const bar = document.getElementById('npPrbar');
  if (!bar) return;
  const pct = e.offsetX / bar.offsetWidth;
  try { _ytPlayer.seekTo(_ytPlayer.getDuration() * pct, true); } catch (_) {}
};

// progress bar utama
const prbar = document.getElementById('prbar');
if (prbar) {
  prbar.addEventListener('click', function (e) {
    if (!_ytPlayer || !_ytReady) return;
    const pct = e.offsetX / prbar.offsetWidth;
    try { _ytPlayer.seekTo(_ytPlayer.getDuration() * pct, true); } catch (_) {}
  });
}

// volume
const _origSetVol = window.setVolume;
window.setVolume = function (v) {
  _ytSetVol(v);
  // jangan panggil origSetVol karena dia set audio.volume yang tidak dipakai
};
// slider volume lama
const volSlider = document.getElementById('volSlider') || document.getElementById('volRange');
if (volSlider) {
  volSlider.addEventListener('input', function () {
    const v = parseFloat(this.value);
    vol = v;
    _ytSetVol(v);
  });
}

// mute
const _origToggleMute = window.toggleMute;
window.toggleMute = function () {
  if (!_ytPlayer || !_ytReady) { if (_origToggleMute) _origToggleMute(); return; }
  try {
    if (_ytPlayer.isMuted()) { _ytPlayer.unMute(); isMuted = false; }
    else { _ytPlayer.mute(); isMuted = true; }
    updAll();
  } catch (_) {}
};

// ══════════════════════════════════════════════════════════════════
//  3. PLAY TRACK — entry point utama
// ══════════════════════════════════════════════════════════════════

window.playYouTube = function (track) {
  const videoId   = track.videoId || track.video_id || track.id;
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    toast('⚠️ Video ID tidak valid'); return;
  }
  const trackObj = {
    id:        videoId,
    videoId,
    video_id:  videoId,
    title:     track.title     || 'Unknown',
    artist:    track.artist    || 'Unknown',
    album:     track.album     || '',
    duration:  track.duration  || '0:00',
    year:      track.year      || new Date().getFullYear(),
    thumbnail: track.thumbnail || (typeof PH !== 'undefined' ? PH : ''),
    audio:     null,   // tidak pakai audio element
    audioUrl:  null,
    source:    'youtube',
    playCount: track.playCount || 0,
  };

  // Set currentTrack agar sistem lama (like, queue, dll) tetap jalan
  currentTrack = trackObj;

  // Hentikan audio element lama kalau masih bunyi
  try { if (typeof audio !== 'undefined' && audio) { audio.pause(); audio.src = ''; } } catch (_) {}

  // Tampilkan hero + mini player
  showHero(trackObj, 'youtube');
  _ytShowMiniPlayer(trackObj);

  // Load ke IFrame
  _ytLoad(videoId);

  // Queue lama
  if (typeof queue !== 'undefined') {
    const existing = queue.findIndex(q => q.id === videoId);
    if (existing === -1) { queue.push(trackObj); qi = queue.length - 1; }
    else qi = existing;
    if (typeof LS !== 'undefined') LS.sq(queue);
  }

  // History
  if (typeof histArr !== 'undefined') {
    histArr = histArr.filter(h => h.id !== videoId);
    histArr.unshift(trackObj);
    if (histArr.length > 50) histArr.pop();
    if (typeof LS !== 'undefined') LS.sh(histArr);
  }

  // mediaSession
  _ytMediaSession(trackObj);

  // Simpan ke Supabase
  _saveTrackYT(trackObj);
};

// mini player bar bawah
function _ytShowMiniPlayer(t) {
  const plImg   = document.getElementById('plImg');
  const plTitle = document.getElementById('plTitle');
  const plArt   = document.getElementById('plArt');
  const pbar    = document.getElementById('pbar');
  if (plImg)   plImg.src         = t.thumbnail || '';
  if (plTitle) plTitle.textContent = t.title   || '';
  if (plArt)   plArt.textContent  = t.artist  || '';
  if (pbar)    pbar.classList.add('up');
}

// mediaSession API agar kontrol di notif HP jalan
function _ytMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  t.title  || '',
    artist: t.artist || '',
    album:  t.album  || '',
    artwork: t.thumbnail ? [{ src: t.thumbnail, sizes: '512x512', type: 'image/jpeg' }] : [],
  });
  navigator.mediaSession.setActionHandler('play',           () => { if (_ytPlayer && _ytReady) _ytPlayer.playVideo(); });
  navigator.mediaSession.setActionHandler('pause',          () => { if (_ytPlayer && _ytReady) _ytPlayer.pauseVideo(); });
  navigator.mediaSession.setActionHandler('nexttrack',      () => { if (typeof playNextTrack === 'function') playNextTrack(); else if (typeof playNext === 'function') playNext(); });
  navigator.mediaSession.setActionHandler('previoustrack',  () => { if (typeof playPrevTrack === 'function') playPrevTrack(); else if (typeof playPrev === 'function') playPrev(); });
  navigator.mediaSession.setActionHandler('seekto', (d) => { if (_ytPlayer && _ytReady) _ytPlayer.seekTo(d.seekTime, true); });
}

// Override playTrackObj dan playAppleMusic
window.playTrackObj = async function (t) {
  const vid = t.videoId || t.video_id || t.id;
  if (vid && /^[A-Za-z0-9_-]{11}$/.test(vid)) playYouTube({ ...t, videoId: vid });
  else toast('⚠️ Format track tidak dikenali');
};
window.playAppleMusic = window.playYouTube; // alias aman

// ══════════════════════════════════════════════════════════════════
//  4. SUPABASE
// ══════════════════════════════════════════════════════════════════

async function _saveTrackYT(track) {
  if (typeof sb === 'undefined' || !window.SB_URL) return;
  try {
    const rows = await sb.get('tracks', `id=eq.${encodeURIComponent(track.videoId)}`);
    const pc   = rows?.length ? (rows[0].play_count || 0) + 1 : 1;
    await fetch(`${window.SB_URL}/rest/v1/tracks?on_conflict=id`, {
      method: 'POST',
      headers: { ...sb._h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: track.videoId, video_id: track.videoId,
        title: track.title, artist: track.artist,
        thumbnail: track.thumbnail || null,
        duration: track.duration   || null,
        play_count: pc,
        last_played: new Date().toISOString(),
        searched_by: (typeof session !== 'undefined' ? session?.nama : null) || null,
        source: 'youtube',
      }),
    });
  } catch (e) { console.warn('[saveTrackYT]', e.message); }
}

window.rowToTrack = function (r, src = 'db') {
  return {
    id: r.id, videoId: r.video_id || r.id, video_id: r.video_id || r.id,
    title: r.title || '', artist: r.artist || '',
    album: r.album || '', duration: r.duration || '',
    year: r.year || '–',
    thumbnail: typeof resizeThumb === 'function'
               ? resizeThumb(r.thumbnail || '', 300) : (r.thumbnail || ''),
    audio: null, audioUrl: null,
    playCount: r.play_count || 0, source: src,
  };
};

// ══════════════════════════════════════════════════════════════════
//  5. SEARCH
// ══════════════════════════════════════════════════════════════════

window.doSearch = async function () {
  const q = document.getElementById('sInput')?.value?.trim();
  if (!q) { toast('Masukkan kata kunci'); return; }
  if (typeof navigate === 'function' && window.currentPage !== 'beranda') navigate('beranda');
  if (typeof setBtnLoad === 'function') setBtnLoad(true);
  if (typeof setState  === 'function') setState('load');
  if (typeof setStLoad === 'function') setStLoad(`Mencari "${q}"`, '🎵 YouTube Music...');
  try {
    const res = await fetch(`${VEROR_URL}/api/search?q=${encodeURIComponent(q)}`);
    const d   = await res.json();
    if (!d.ok) throw new Error(d.message || 'Gagal');
    if (!d.result?.length) throw new Error('Tidak ada hasil');
    _renderResults(d.result);
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

function _renderResults(results) {
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
//  6. PARTY & CHAT
// ══════════════════════════════════════════════════════════════════

window.playPartyTrack = async function (pi) {
  const vid = pi.track_id || pi.video_id;
  if (vid && /^[A-Za-z0-9_-]{11}$/.test(vid)) {
    playYouTube({ videoId: vid, title: pi.title, artist: pi.artist, thumbnail: pi.thumbnail });
    if (typeof navigate === 'function') navigate('beranda');
  } else toast('⚠️ Format track tidak valid');
};

window.playFromChat = async function (trackId) {
  if (/^[A-Za-z0-9_-]{11}$/.test(trackId)) {
    playYouTube({ videoId: trackId });
  } else {
    const t = (typeof queue !== 'undefined' ? queue : []).find(q => q.id === trackId);
    if (t) playYouTube(t); else toast('Gagal load lagu');
  }
};

// ══════════════════════════════════════════════════════════════════
//  7. HOME FEED
// ══════════════════════════════════════════════════════════════════

async function _loadHomeFeed() {
  try {
    const res = await fetch(`${VEROR_URL}/api/home`);
    const d   = await res.json();
    return (d.ok && d.sections?.length) ? d.sections : null;
  } catch { return null; }
}

function _makeQpCard(r, onClick) {
  const card = document.createElement('div');
  card.className = 'qp-card sk-loaded';
  card.addEventListener('click', onClick);
  const thumb = document.createElement('div'); thumb.className = 'qp-thumb';
  const img   = document.createElement('img');
  img.src = r.thumbnail || ''; img.loading = 'lazy';
  img.onerror = function () { this.src = typeof PH !== 'undefined' ? PH : ''; };
  const pb = document.createElement('button'); pb.className = 'qp-play-btn';
  pb.innerHTML = '<i class="fas fa-play"></i>';
  pb.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  thumb.appendChild(img); thumb.appendChild(pb); card.appendChild(thumb);
  const te = document.createElement('div'); te.className = 'qp-title'; te.textContent = r.title || '';
  const ae = document.createElement('div'); ae.className = 'qp-artist'; ae.textContent = r.artist || '';
  const me = document.createElement('div'); me.className = 'qp-meta';
  me.innerHTML = (r.play_count ? `<span><i class="fas fa-headphones" style="font-size:.48rem"></i> ${r.play_count}×</span>` : '')
               + (r.duration ? `<span>${r.duration}</span>` : '');
  card.appendChild(te); card.appendChild(ae); card.appendChild(me);
  return card;
}

window.loadQuickPlay = async function () {
  const el  = document.getElementById('qpGrid');
  const sec = document.getElementById('quickPlaySec');
  if (!el || !sec) return;

  try {
    const rows = await sb.get('tracks', 'order=last_played.desc.nullslast&limit=50');
    if (rows?.length) {
      sec.style.display = 'block';
      const cnt = document.getElementById('qpCnt');
      if (cnt) cnt.textContent = rows.length;
      el.innerHTML = '';
      rows.forEach(r => {
        const t = rowToTrack(r, 'db');
        el.appendChild(_makeQpCard({ ...r }, () => playYouTube(t)));
      });
      return;
    }
  } catch (e) { console.warn('[loadQuickPlay]', e.message); }

  const sections = await _loadHomeFeed();
  if (!sections) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  const cnt = document.getElementById('qpCnt');
  if (cnt) cnt.textContent = sections[0].items.length;
  el.innerHTML = '';
  sections[0].items.forEach(r => el.appendChild(_makeQpCard(r, () => playYouTube(r))));

  // Section tambahan
  let extra = document.getElementById('ytExtraSections');
  if (!extra) {
    extra = document.createElement('div');
    extra.id = 'ytExtraSections'; extra.style.marginTop = '16px';
    sec.appendChild(extra);
  }
  extra.innerHTML = '';
  sections.slice(1).forEach(sec2 => {
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

console.log('[veror-patch] ready →', VEROR_URL);

// ══════════════════════════════════════════════════════════════════
//  8. FIX: override startProg & updAll agar sync ke IFrame
// ══════════════════════════════════════════════════════════════════

// Override startProg lama — lama ngandalin audio.duration yang = 0
const _origStartProg = window.startProg;
window.startProg = function () {
  // Kalau IFrame aktif, biarkan _ytStartProg yang handle
  if (_ytPlayer && _ytReady) return;
  if (_origStartProg) _origStartProg();
};

// Override updHeroPlayBtn agar pakai isPlaying dari IFrame
const _origUpdHeroPlayBtn = window.updHeroPlayBtn;
window.updHeroPlayBtn = function () {
  if (_origUpdHeroPlayBtn) _origUpdHeroPlayBtn();
  // Sync tombol play di hero section
  const hPlayIco = document.getElementById('hPlayIco');
  if (hPlayIco) hPlayIco.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
};

// Force updAll setiap kali state IFrame berubah sudah dilakukan di _ytOnState.
// Tambah: sync cbIco (tombol play di player bar bawah) secara eksplisit
const _origUpdAll = window.updAll;
window.updAll = function () {
  if (_origUpdAll) _origUpdAll();
  // Pastikan icon play/pause di control bar sync
  const cbIco = document.getElementById('cbIco');
  if (cbIco) cbIco.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
  // Mini player bar
  const plEq = document.getElementById('plEq');
  if (plEq) plEq.classList.toggle('show', isPlaying);
  // NP panel
  if (typeof npOpen !== 'undefined' && npOpen) {
    const npPlayIco = document.getElementById('npPlayIco');
    if (npPlayIco) npPlayIco.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
    const npVinyl = document.getElementById('npVinyl');
    if (npVinyl) npVinyl.classList.toggle('playing', isPlaying);
  }
};

console.log('[veror-patch] UI sync patch applied');
