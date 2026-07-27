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

// ── 13. Home Feed — ganti loadQuickPlay & loadTopChartHome ───────
// Kalau DB kosong, langsung ambil dari YouTube Music.

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
      // Ada data di DB — render normal seperti sebelumnya
      sec.style.display = 'block';
      document.getElementById('qpCnt') && (document.getElementById('qpCnt').textContent = rows.length);
      el.innerHTML = '';
      rows.forEach((r) => {
        const t = rowToTrack(r, 'db');
        const card = document.createElement('div');
        card.className = 'qp-card';
        card.addEventListener('click', () => playTrackObj(t));
        const thumb = document.createElement('div'); thumb.className = 'qp-thumb';
        const img   = document.createElement('img');
        img.src = r.thumbnail || (typeof PH !== 'undefined' ? PH : '');
        img.onerror = function () { this.src = (typeof PH !== 'undefined' ? PH : ''); };
        img.loading = 'lazy';
        const pb = document.createElement('button'); pb.className = 'qp-play-btn';
        pb.innerHTML = '<i class="fas fa-play"></i>';
        pb.addEventListener('click', (e) => { e.stopPropagation(); playTrackObj(t); });
        thumb.appendChild(img); thumb.appendChild(pb); card.appendChild(thumb);
        const te = document.createElement('div'); te.className = 'qp-title'; te.textContent = r.title || '';
        const ae = document.createElement('div'); ae.className = 'qp-artist'; ae.textContent = r.artist || '';
        const me = document.createElement('div'); me.className = 'qp-meta';
        me.innerHTML = `<span><i class="fas fa-headphones" style="font-size:.48rem"></i> ${r.play_count || 0}×</span>${r.duration ? '<span>' + r.duration + '</span>' : ''}`;
        card.appendChild(te); card.appendChild(ae); card.appendChild(me);
        card.classList.add('sk-loaded');
        el.appendChild(card);
      });
      return;
    }
  } catch (e) { console.warn('[loadQuickPlay]', e.message); }

  // DB kosong — ambil dari YouTube Music
  const sections = await _loadHomeFeed();
  if (!sections) { sec.style.display = 'none'; return; }

  sec.style.display = 'block';

  // Tampilkan section pertama di qpGrid (gaya kartu horizontal)
  const first = sections[0];
  if (document.getElementById('qpCnt'))
    document.getElementById('qpCnt').textContent = first.items.length;

  el.innerHTML = '';
  first.items.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'qp-card sk-loaded';
    card.addEventListener('click', () => playYouTube(r));

    const thumb = document.createElement('div'); thumb.className = 'qp-thumb';
    const img   = document.createElement('img');
    img.src = r.thumbnail || '';
    img.onerror = function () { this.src = (typeof PH !== 'undefined' ? PH : ''); };
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

  // Section ke-2 dan ke-3: render sebagai chart list di bawah qpGrid
  const extra = document.getElementById('ytExtraSections');
  const container = extra || (() => {
    const d = document.createElement('div');
    d.id = 'ytExtraSections';
    d.style.cssText = 'margin-top:16px';
    sec.appendChild(d);
    return d;
  })();
  container.innerHTML = '';

  sections.slice(1).forEach((sec2) => {
    const h = document.createElement('h3');
    h.style.cssText = 'font-size:.85rem;font-weight:700;color:var(--tx,#eef);margin:16px 0 8px';
    h.textContent = sec2.label;
    container.appendChild(h);

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px';
    sec2.items.slice(0, 8).forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'chart-item';
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => playYouTube(r));

      const rank = document.createElement('div'); rank.className = 'chart-rank';
      rank.textContent = i + 1;
      const th = document.createElement('div'); th.className = 'chart-th';
      const img = document.createElement('img');
      img.src = r.thumbnail || '';
      img.onerror = function () { this.src = ''; };
      th.appendChild(img);
      const inf = document.createElement('div'); inf.className = 'chart-inf';
      const ct = document.createElement('div'); ct.className = 'chart-t'; ct.textContent = r.title || '';
      const ca = document.createElement('div'); ca.className = 'chart-a'; ca.textContent = r.artist || '';
      inf.appendChild(ct); inf.appendChild(ca);
      const dur = document.createElement('div');
      dur.style.cssText = 'font-size:.7rem;color:var(--t2,#888);margin-left:auto';
      dur.textContent = r.duration || '';

      row.appendChild(rank); row.appendChild(th); row.appendChild(inf); row.appendChild(dur);
      list.appendChild(row);
    });
    container.appendChild(list);
  });
};

window.loadTopChartHome = async function () {
  // Kalau DB ada data, render normal
  try {
    const rows = await sb.get('tracks', 'order=play_count.desc&limit=5&play_count=gt.0');
    if (rows?.length) {
      const sec = document.getElementById('chartSecHome');
      if (sec) sec.style.display = 'block';
      if (typeof renderChartList === 'function') renderChartList(rows, 'chartListHome');
      return;
    }
  } catch {}
  // DB kosong — sembunyikan saja, sudah ada home feed di Quick Play
  const sec = document.getElementById('chartSecHome');
  if (sec) sec.style.display = 'none';
};

console.log('[veror-patch] home feed ready');
