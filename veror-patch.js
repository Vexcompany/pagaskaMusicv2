// ─────────────────────────────────────────────────────────────────
//  veror-patch.js
//  Override fungsi streaming spotif: Apple Music + R2 → veroR + YouTube
//  Cara pakai: <script src="veror-patch.js"></script>
//  letakkan SETELAH semua script lain di index.html (sebelum </body>)
// ─────────────────────────────────────────────────────────────────

// ── 1. URL backend baru ──────────────────────────────────────────
// Ganti nilai ini setelah deploy veroR ke Vercel
const VEROR_URL = 'vero-r.vercel.app';

// Override variabel lama agar semua referensi BACKEND_URL ikut berubah
window.BACKEND_URL = VEROR_URL;

// ── 2. Cache directUrl in-memory ─────────────────────────────────
// Simpan {directUrl, proxyUrl, expiresAt} per videoId supaya
// lagu yang sama tidak resolve ulang dalam 5 menit.
const _urlCache = new Map();

function _cacheGet(videoId) {
  const e = _urlCache.get(videoId);
  if (!e) return null;
  if (e.expiresAt - Date.now() < 5 * 60 * 1000) { _urlCache.delete(videoId); return null; }
  return e;
}
function _cacheSet(videoId, data) {
  _urlCache.set(videoId, { ...data, cachedAt: Date.now() });
}

// ── 3. Resolve stream via veroR ──────────────────────────────────
async function _resolveStream({ videoId, title, artist, thumbnail, duration }) {
  if (videoId && _cacheGet(videoId)) return _cacheGet(videoId);

  const body = videoId
    ? { id: videoId }
    : { title, artist, thumbnail, duration };

  const res  = await fetch(`${VEROR_URL}/api/stream`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || 'Resolve gagal');

  const r = data.result;
  _cacheSet(r.videoId, r);
  return r;
}

// ── 4. doSearch — YouTube Music, bukan Apple Music ───────────────
window.doSearch = async function () {
  const q = document.getElementById('sInput')?.value?.trim();
  if (!q) { toast('Masukkan kata kunci pencarian'); return; }

  if (typeof navigate === 'function' && window.currentPage !== 'beranda') navigate('beranda');
  if (typeof setBtnLoad === 'function') setBtnLoad(true);
  if (typeof setState  === 'function') setState('load');
  if (typeof setStLoad === 'function') setStLoad(`Mencari "${q}"`, '🎵 YouTube Music...');

  try {
    const res = await fetch(`${VEROR_URL}/api/search?q=${encodeURIComponent(q)}`);
    const d   = await res.json();
    if (!d.ok) throw new Error(d.message || 'Pencarian gagal');
    const results = d.result || [];
    if (!results.length) throw new Error('Tidak ada hasil');
    _renderYTResults(results, q);
    if (typeof saveSug === 'function') saveSug(q);
  } catch (err) {
    console.error(err);
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

// ── 5. Render hasil search YouTube ───────────────────────────────
function _renderYTResults(results, query) {
  const wrap = document.getElementById('searchResultsWrap');
  const grid = document.getElementById('srGrid');
  const lbl  = document.getElementById('searchResultsLabel');
  if (!wrap || !grid) return;

  wrap.style.display = 'block';
  if (lbl) lbl.textContent = `Hasil pencarian: ${results.length} lagu`;
  grid.innerHTML = '';

  results.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'sr-item';

    const td  = document.createElement('div');  td.className = 'sr-thumb';
    const img = document.createElement('img');
    img.src = r.thumbnail || '';
    img.onerror = function () { this.src = (typeof PH !== 'undefined' ? PH : ''); };
    td.appendChild(img);

    const info = document.createElement('div'); info.className = 'sr-info';
    const te   = document.createElement('div'); te.className   = 'sr-title'; te.textContent = r.title;
    const meta = document.createElement('div'); meta.className = 'sr-meta';
    const badge = document.createElement('span'); badge.className = 'sr-badge'; badge.textContent = 'YT';
    meta.appendChild(badge);
    meta.appendChild(document.createTextNode(' ' + (r.artist || '')));
    info.appendChild(te);
    info.appendChild(meta);

    const dur = document.createElement('div');
    dur.className = 'ti-dur';
    dur.style.cssText = 'font-size:.7rem;color:var(--t2,#888);margin-left:auto;padding-right:4px';
    dur.textContent = r.duration || '';

    item.appendChild(td);
    item.appendChild(info);
    item.appendChild(dur);

    item.addEventListener('click', () => playYouTube(r));
    grid.appendChild(item);
  });

  if (typeof setState === 'function') setState('none');
}

// ── 6. playYouTube — pengganti playAppleMusic ────────────────────
window.playYouTube = async function (track) {
  // track bisa dari hasil search (punya videoId) atau dari DB (punya video_id)
  const videoId   = track.videoId || track.video_id || null;
  const title     = track.title     || 'Unknown';
  const artist    = track.artist    || 'Unknown';
  const thumbnail = track.thumbnail || (typeof PH !== 'undefined' ? PH : '');
  const duration  = track.duration  || track.durationSec || null;

  if (typeof setState  === 'function') setState('load');
  if (typeof setStLoad === 'function') setStLoad(title, '⏳ Memuat audio...');

  try {
    const s = await _resolveStream({ videoId, title, artist, thumbnail, duration });

    // Pilih sumber: coba directUrl dulu (hemat bandwidth), fallback proxy
    const directUrl = s.directUrl || null;
    const proxyUrl  = s.proxyUrl  || `${VEROR_URL}/api/audio/${s.videoId}`;

    const trackObj = {
      id:        s.videoId,
      videoId:   s.videoId,
      video_id:  s.videoId,
      title:     s.title    || title,
      artist:    s.artist   || artist,
      album:     '',
      duration:  s.duration || (typeof duration === 'string' ? duration : '0:00'),
      year:      new Date().getFullYear(),
      thumbnail: typeof resizeThumb === 'function'
                   ? resizeThumb(s.thumbnail || thumbnail, 300)
                   : (s.thumbnail || thumbnail),
      // audio: directUrl akan dicoba dulu, jika gagal fallback ke proxy
      audio:     directUrl || proxyUrl,
      directUrl,
      proxyUrl,
      expiresAt: s.expiresAt || 0,
      source:    'youtube',
    };

    if (typeof showHero    === 'function') showHero(trackObj, 'youtube');
    if (typeof addToQueue  === 'function') addToQueue(trackObj);
    if (typeof setState    === 'function') setState('none');

    await playTrackObj(trackObj);
    _saveTrackYT(trackObj);

  } catch (e) {
    console.error('[playYouTube]', e);
    toast('❌ Gagal: ' + e.message);
    if (typeof setState === 'function') setState('err');
    const et = document.getElementById('stErrT');
    const em = document.getElementById('stErrM');
    if (et) et.textContent = 'Stream Gagal';
    if (em) em.textContent = e.message;
  }
};

// ── 7. _saveTrackYT — simpan video_id bukan audio_url ────────────
async function _saveTrackYT(track) {
  try {
    const ex = await sb.get('tracks', `id=eq.${encodeURIComponent(track.id)}`);
    const pc = ex?.length ? (ex[0].play_count || 0) + 1 : 1;
    await fetch(`${SB_URL}/rest/v1/tracks?on_conflict=id`, {
      method:  'POST',
      headers: { ...sb._h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify({
        id:          track.id,
        video_id:    track.videoId,
        title:       track.title,
        artist:      track.artist,
        thumbnail:   track.thumbnail || null,
        duration:    track.duration  || null,
        play_count:  pc,
        last_played: new Date().toISOString(),
        searched_by: (typeof session !== 'undefined' ? session?.nama : null) || null,
        source:      'youtube',
        // TIDAK ada audio_url — URL di-resolve ulang setiap putar
      }),
    });
  } catch (e) {
    console.warn('[saveTrackYT]', e.message);
  }
}

// ── 8. rowToTrack — baca video_id bukan audio_url ────────────────
// Override fungsi asli agar lagu dari DB di-resolve saat diklik
window.rowToTrack = function (r, src = 'db') {
  return {
    id:        r.id,
    videoId:   r.video_id || r.id,
    video_id:  r.video_id || r.id,
    title:     r.title,
    artist:    r.artist,
    album:     r.album  || '',
    duration:  r.duration || '0:00',
    year:      r.year   || '–',
    thumbnail: typeof resizeThumb === 'function'
                 ? resizeThumb(r.thumbnail || (typeof PH !== 'undefined' ? PH : ''), 300)
                 : (r.thumbnail || ''),
    // audio: null → playTrackObj akan cek dan trigger resolve
    audio:     null,
    audioUrl:  null,
    playCount: r.play_count || 0,
    source:    src,
  };
};

// ── 9. Override playTrackObj agar resolve otomatis jika audio null ─
const _origPlayTrackObj = window.playTrackObj;
window.playTrackObj = async function (t) {
  // Jika audio kosong tapi punya videoId → resolve dulu
  if (!t.audio && (t.videoId || t.video_id)) {
    return playYouTube(t);
  }
  // Jika directUrl ada tapi sudah kedaluwarsa → resolve ulang
  if (t.directUrl && t.expiresAt && t.expiresAt - Date.now() < 2 * 60 * 1000) {
    return playYouTube(t);
  }
  return _origPlayTrackObj.call(this, t);
};

// ── 10. Error handler audio — fallback ke proxyUrl ───────────────
// Override listener error lama dengan yang baru
(function () {
  const _origAddEventListener = audio?.addEventListener?.bind(audio);
  if (!_origAddEventListener) return;

  // Tambah listener baru; listener lama di index.html tetap ada
  // tapi tidak berbahaya karena kondisi appleUrl tidak akan match
  if (typeof audio !== 'undefined') {
    audio.addEventListener('error', async () => {
      if (!audio.src || audio.src === location.href) return;
      const t = typeof currentTrack !== 'undefined' ? currentTrack : null;
      if (!t || audio._verorRetried) return;

      // Coba proxyUrl sebagai fallback
      const proxy = t.proxyUrl || (t.videoId ? `${VEROR_URL}/api/audio/${t.videoId}` : null);
      if (!proxy || audio.src === proxy) return;

      audio._verorRetried = true;
      try {
        audio.src = proxy;
        await audio.play();
        toast('⚠️ Beralih ke proxy...');
      } catch (fe) {
        console.warn('[audio fallback]', fe.message);
        toast('❌ Audio tidak dapat diputar');
        if (typeof updAll === 'function') updAll();
      }
    });

    // Reset flag saat track baru mulai
    audio.addEventListener('loadstart', () => { audio._verorRetried = false; });
  }
})();

// ── 11. playPartyTrack — resolve via veroR jika audio_url kosong ─
window.playPartyTrack = async function (pi) {
  toast('🎉 Memutar dari Party Queue...');

  // Coba dari DB dulu
  try {
    const rows = await sb.get('tracks', `id=eq.${encodeURIComponent(pi.track_id)}`);
    if (rows?.length) {
      const t = rowToTrack(rows[0], 'db');
      // rowToTrack baru mengembalikan audio:null → playTrackObj akan resolve
      await playTrackObj(t);
      if (typeof navigate === 'function') navigate('beranda');
      return;
    }
  } catch (e) {}

  // Coba dari queue/history lokal
  const local = (typeof queue !== 'undefined' ? queue : []).find(q => q.id === pi.track_id)
              || (typeof histArr !== 'undefined' ? histArr : []).find(h => h.id === pi.track_id);
  if (local) {
    await playTrackObj(local);
    if (typeof navigate === 'function') navigate('beranda');
    return;
  }

  // Fallback: search by title
  if (pi.title) {
    await playYouTube({ videoId: pi.track_id, title: pi.title, artist: pi.artist || '', thumbnail: pi.thumbnail || '' });
    if (typeof navigate === 'function') navigate('beranda');
  } else {
    toast('⚠️ Tidak bisa memutar dari party queue');
  }
};

// ── 12. playFromChat — resolve jika perlu ────────────────────────
window.playFromChat = async function (trackId) {
  const t = (typeof queue !== 'undefined' ? queue : []).find(q => q.id === trackId)
          || (typeof histArr !== 'undefined' ? histArr : []).find(h => h.id === trackId);
  if (t) { playTrackObj(t); return; }

  try {
    const rows = await sb.get('tracks', `id=eq.${encodeURIComponent(trackId)}`);
    if (rows?.length) { playTrackObj(rowToTrack(rows[0], 'db')); return; }
  } catch (e) { toast('Gagal load lagu'); }
};

console.log('[veror-patch] loaded — backend:', VEROR_URL);
