/**
 * profil-publik.js — v3
 */

const PublikProfil = (() => {
  let _currentKey = null;
  let _prevPage   = 'beranda', _fromChatRoom = false;
  let _injected   = false;

  function _inject() {
    if (_injected) return;
    _injected = true;

    const page = document.createElement('div');
    // Bukan .page — overlay independen, tidak ikut sistem navigate()
    page.id = 'page-profil-publik';
    page.style.cssText = 'display:none;position:fixed;inset:0;z-index:601;overflow-y:auto;background:var(--bg);-webkit-overflow-scrolling:touch';
    page.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:4px 0">
        <button class="page-back" id="ppBack" style="flex-shrink:0"><i class="fas fa-arrow-left"></i></button>
        <div class="sec-title" style="margin-bottom:0;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" id="ppPageTitle">Profil</div>
      </div>

      <div style="background:var(--s1);border:1px solid var(--bd);border-radius:20px;overflow:hidden;margin-bottom:16px">
        <div id="ppBanner" style="height:80px;background:linear-gradient(135deg,var(--p),var(--dyn1))"></div>
        <div style="padding:0 16px 16px;margin-top:-32px">
          <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px">
            <div id="ppAvWrap" style="width:64px;height:64px;border-radius:50%;border:3px solid var(--bg);overflow:hidden;flex-shrink:0;background:linear-gradient(135deg,var(--p),var(--dyn1));display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:#fff">?</div>
            <button id="ppChatBtn" style="display:none;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;background:var(--dyn1);color:#000;border:none;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit">
              <i class="fas fa-comment-dots"></i> Chat
            </button>
          </div>
          <div id="ppName" style="font-family:'Syne',sans-serif;font-size:1.15rem;font-weight:800;margin-bottom:2px">–</div>
          <div id="ppSub" style="font-size:.72rem;color:var(--mt);margin-bottom:10px">–</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            <div style="background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:10px 8px;text-align:center">
              <div id="ppStatPlays" style="font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800">–</div>
              <div style="font-size:.58rem;color:var(--mt);margin-top:2px">Total Putar</div>
            </div>
            <div style="background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:10px 8px;text-align:center">
              <div id="ppStatMins" style="font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800">–</div>
              <div style="font-size:.58rem;color:var(--mt);margin-top:2px">Menit</div>
            </div>
            <div style="background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:10px 8px;text-align:center">
              <div id="ppStatTracks" style="font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800">–</div>
              <div style="font-size:.58rem;color:var(--mt);margin-top:2px">Lagu Berbeda</div>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:.82rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px">
          <i class="fas fa-thumbtack" style="color:var(--dyn1)"></i> Pin Favorit
        </div>
        <div class="pin-grid" id="ppPinGrid"></div>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:.82rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px">
          <i class="fas fa-trophy" style="color:var(--yw)"></i> Lagu Favorit
        </div>
        <div id="ppTopTracks" class="tlist"></div>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-size:.82rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px">
          <i class="fas fa-microphone" style="color:var(--p2)"></i> Artis Terbanyak
        </div>
        <div id="ppTopArtists" style="display:flex;flex-direction:column;gap:6px"></div>
      </div>

      <div>
        <div style="font-size:.82rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px">
          <i class="fas fa-history" style="color:var(--b2)"></i> Diputar Terakhir
        </div>
        <div id="ppRecentList" class="tlist"></div>
      </div>`;

    document.body.appendChild(page);

    document.getElementById('ppBack').addEventListener('click', close);
    document.getElementById('ppChatBtn').addEventListener('click', () => {
      const name = document.getElementById('ppName').textContent;
      close();
      setTimeout(() => { navigate('chat'); setTimeout(() => openChatRoom(_currentKey, name), 200); }, 150);
    });
  }

  async function open(userKey, displayName) {
    if (!userKey) return;
    _inject();
    _prevPage   = typeof currentPage !== 'undefined' ? currentPage : 'beranda';
    _currentKey = userKey;

    // Catat dari mana dibuka — tidak ganggu halaman/page yang sedang aktif
    _fromChatRoom = document.getElementById('chatRoom')?.classList.contains('open') || false;

    // Tampilkan overlay (independen, tidak ubah .page system sama sekali)
    const ppPage = document.getElementById('page-profil-publik');
    ppPage.style.display = 'block';
    ppPage.scrollTop = 0;

    const name = displayName || userKey.split('_').slice(0,-1).join(' ') || userKey;
    document.getElementById('ppPageTitle').textContent = name;
    document.getElementById('ppName').textContent = name;

    const isSelf = (typeof USER_KEY !== 'undefined') && userKey === USER_KEY;
    document.getElementById('ppChatBtn').style.display = isSelf ? 'none' : 'flex';

    ['ppStatPlays','ppStatMins','ppStatTracks'].forEach(id => {
      document.getElementById(id).textContent = '...';
    });
    ['ppTopTracks','ppTopArtists','ppRecentList'].forEach(id => {
      document.getElementById(id).innerHTML = '<div class="empty-ti"><i class="fas fa-circle-notch spin"></i></div>';
    });
    document.getElementById('ppPinGrid').innerHTML = '';

    await _loadProfile(userKey, isSelf);
  }

  function close() {
    const ppPage = document.getElementById('page-profil-publik');
    if (ppPage) ppPage.style.display = 'none';
    _currentKey = null;

    if (_fromChatRoom) {
      // Chat room masih terbuka di belakang, tidak perlu navigate
      _fromChatRoom = false;
    } else {
      // Kembali ke halaman sebelumnya
      if (typeof navigate === 'function') navigate(_prevPage);
    }
  }

  async function _loadProfile(userKey, isSelf) {
    const PH_ = typeof PH !== 'undefined' ? PH : 'https://placehold.co/200x200/0d0d24/1DB954?text=♪';

    try {
      // ── Info user ──────────────────────────────────────────
      let userData = null;
      if (typeof window.PAGASKA_DB !== 'undefined' && window.PAGASKA_DB.getAllUsers) {
        userData = window.PAGASKA_DB.getAllUsers().find(u => `${u.nama}_${u.generasi}` === userKey);
      }
      const ini = (userData?.nama || userKey).split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      document.getElementById('ppSub').textContent = userData
        ? `${userData.jabatan || 'Anggota'} · Generasi ${userData.generasi}`
        : userKey.split('_').pop();

      // ── Avatar (tabel user_avatars) ────────────────────────
      const avWrap = document.getElementById('ppAvWrap');
      const _renderInitials = () => {
        avWrap.style.background = 'linear-gradient(135deg,var(--p),var(--dyn))';
        avWrap.innerHTML = `<span style="font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:#fff;line-height:1;user-select:none">${ini}</span>`;
      };
      try {
        const avRows = await sb.get('user_avatars', `user_key=eq.${encodeURIComponent(userKey)}&select=avatar_url`);
        const url = avRows?.[0]?.avatar_url;
        if (url) {
          avWrap.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.innerHTML='';this.parentElement.style.background='linear-gradient(135deg,var(--p),var(--dyn))';this.parentElement.innerHTML='<span style=\\'font-family:\\'Syne\\',sans-serif;font-size:1.4rem;font-weight:800;color:#fff;line-height:1\\'>${ini}</span>'">`;
          avWrap.style.background = 'transparent';
        } else {
          _renderInitials();
        }
      } catch { _renderInitials(); }

      // ── Ambil KEDUA sumber data secara paralel ─────────────
      const [playCountRows, historyRows] = await Promise.all([
        sb.get('user_play_counts',
          `user_key=eq.${encodeURIComponent(userKey)}&select=track_id,count`
        ).catch(() => []),
        sb.get('play_history',
          `user_key=eq.${encodeURIComponent(userKey)}&select=track_id,played_at,duration_played&order=played_at.desc&limit=2000`
        ).catch(() => [])
      ]);

      // ── Merge countMap: ambil nilai TERBESAR dari keduanya ──
      const countMap = {};

      // Dari user_play_counts (data akumulasi — sumber utama untuk count)
      playCountRows.forEach(r => {
        if (r.track_id) countMap[r.track_id] = r.count || 0;
      });

      const histCountMap = {};
      historyRows.forEach(h => {
        if (h.track_id) histCountMap[h.track_id] = (histCountMap[h.track_id]||0) + 1;
      });
      Object.entries(histCountMap).forEach(([id, cnt]) => {
        countMap[id] = Math.max(countMap[id] || 0, cnt);
      });

      const totalPlays = Object.values(countMap).reduce((a,b) => a+b, 0);
      const uniqTracks = Object.keys(countMap).length;
      const sortedIds  = Object.keys(countMap).sort((a,b) => countMap[b]-countMap[a]);
      const top10Ids   = sortedIds.slice(0,10);

      // ── Fetch detail track ─────────────────────────────────
      let trackMap = {};
      if (top10Ids.length) {
        const tracks = await sb.get('tracks',
          `id=in.(${top10Ids.map(id=>encodeURIComponent(id)).join(',')})&select=id,title,artist,thumbnail,duration,audio_url`
        );
        tracks.forEach(t => { trackMap[t.id] = t; });
      }

      // ── Total menit ────────────────────────────────────────
      let totalSecs = 0;
      const countedFromHistory = new Set();

      historyRows.forEach(h => {
        if (h.duration_played && Number(h.duration_played) > 0) {
          totalSecs += Number(h.duration_played);
          countedFromHistory.add(h.track_id);
        }
      });

      // estimasi dari count × durasi
      Object.entries(countMap).forEach(([id, cnt]) => {
        const histCnt = histCountMap[id] || 0;
        const extraCnt = cnt - histCnt; 
        if (extraCnt <= 0) return;
        const t = trackMap[id];
        let secPerPlay = 210;
        if (t?.duration && String(t.duration).includes(':')) {
          const [m,s] = t.duration.split(':').map(Number);
          secPerPlay = m*60+(s||0);
        }
        totalSecs += extraCnt * secPerPlay;
      });

      historyRows.forEach(h => {
        if (!h.duration_played || Number(h.duration_played) <= 0) {
          const t = trackMap[h.track_id];
          if (t?.duration && String(t.duration).includes(':')) {
            const [m,s] = t.duration.split(':').map(Number);
            totalSecs += m*60+(s||0);
          } else {
            totalSecs += 210;
          }
        }
      });

      const totalMins = Math.round(totalSecs / 60);

      document.getElementById('ppStatPlays').textContent  = totalPlays.toLocaleString('id-ID');
      document.getElementById('ppStatMins').textContent   = totalMins.toLocaleString('id-ID');
      document.getElementById('ppStatTracks').textContent = uniqTracks;

      // ── Top lagu ───────────────────────────────────────────
      const topEl = document.getElementById('ppTopTracks');
      topEl.innerHTML = top10Ids.length
        ? top10Ids.map((id, i) => {
            const t = trackMap[id]; if (!t) return '';
            const track = typeof rowToTrack === 'function' ? rowToTrack(t,'db') : {...t,audio:t.audio_url};
            return `<div class="ti" onclick='playTrackObj(${JSON.stringify(track).replace(/"/g,"&quot;")})'>
              <div class="ti-n">${['🥇','🥈','🥉'][i]||i+1}</div>
              <div class="ti-th"><img src="${t.thumbnail||PH_}" onerror="this.src='${PH_}'"></div>
              <div class="ti-inf">
                <div class="ti-t">${_esc(t.title)}</div>
                <div class="ti-a">${_esc(t.artist)}</div>
              </div>
              <div class="ti-dur" style="color:var(--dyn1);font-weight:700">${countMap[id]}×</div>
            </div>`;
          }).filter(Boolean).join('')
        : '<div class="empty-ti"><i class="fas fa-music"></i>Belum ada data</div>';

      // ── Top artis ──────────────────────────────────────────
      const artistMap = {};
      top10Ids.forEach(id => {
        const t = trackMap[id]; if (!t) return;
        const a = t.artist||'Unknown';
        artistMap[a] = (artistMap[a]||0) + countMap[id];
      });
      const topArtists = Object.entries(artistMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
      document.getElementById('ppTopArtists').innerHTML = topArtists.length
        ? topArtists.map(([name,cnt]) =>
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:10px">
              <span style="font-size:.82rem;font-weight:600">${_esc(name)}</span>
              <span style="font-size:.72rem;color:var(--dyn1);font-weight:700">${cnt}×</span>
            </div>`
          ).join('')
        : '<div class="empty-ti"><i class="fas fa-microphone"></i>Belum ada data</div>';

      // ── Riwayat terakhir ───────────────────────────────────
      const seenIds = new Set();
      const recentUniq = historyRows.filter(h => {
        if (!h.track_id || seenIds.has(h.track_id)) return false;
        seenIds.add(h.track_id); return true;
      }).slice(0,10);

      const missingIds = recentUniq.map(h=>h.track_id).filter(id=>!trackMap[id]);
      if (missingIds.length) {
        const more = await sb.get('tracks',
          `id=in.(${missingIds.map(id=>encodeURIComponent(id)).join(',')})&select=id,title,artist,thumbnail,duration,audio_url`
        );
        more.forEach(t => { trackMap[t.id] = t; });
      }

      document.getElementById('ppRecentList').innerHTML = recentUniq.length
        ? recentUniq.map((h,i) => {
            const t = trackMap[h.track_id]; if (!t) return '';
            const track = typeof rowToTrack === 'function' ? rowToTrack(t,'db') : {...t,audio:t.audio_url};
            const ago = typeof getTimeAgo === 'function' ? getTimeAgo(h.played_at) : '';
            return `<div class="ti" onclick='playTrackObj(${JSON.stringify(track).replace(/"/g,"&quot;")})'>
              <div class="ti-n">${i+1}</div>
              <div class="ti-th"><img src="${t.thumbnail||PH_}" onerror="this.src='${PH_}'"></div>
              <div class="ti-inf">
                <div class="ti-t">${_esc(t.title)}</div>
                <div class="ti-a">${_esc(t.artist)}</div>
              </div>
              <div class="ti-dur">${ago}</div>
            </div>`;
          }).filter(Boolean).join('')
        : '<div class="empty-ti"><i class="fas fa-history"></i>Belum ada riwayat</div>';

      // ── Pin (tabel pinned_tracks, kolom position) ──────────
      const pinGrid = document.getElementById('ppPinGrid');
      try {
        const pinRows = await sb.get('pinned_tracks',
          `user_key=eq.${encodeURIComponent(userKey)}&select=position,track_id&order=position.asc`
        );
        if (!pinRows?.length) {
          pinGrid.innerHTML = '<div style="color:var(--mt);font-size:.75rem;grid-column:1/-1;text-align:center;padding:12px">Belum ada pin</div>';
        } else {
          const pinIds = pinRows.map(p=>p.track_id).filter(id=>!trackMap[id]);
          if (pinIds.length) {
            const pts = await sb.get('tracks',
              `id=in.(${pinIds.map(id=>encodeURIComponent(id)).join(',')})&select=id,title,artist,thumbnail,audio_url`
            );
            pts.forEach(t => { trackMap[t.id] = t; });
          }
          pinGrid.innerHTML = [1,2,3].map(slot => {
            const pin = pinRows.find(p => p.position === slot);
            const t   = pin ? trackMap[pin.track_id] : null;
            if (!t) return `<div class="pin-empty" style="pointer-events:none"><i class="fas fa-music" style="opacity:.3"></i></div>`;
            const track = typeof rowToTrack === 'function' ? rowToTrack(t,'db') : {...t,audio:t.audio_url};
            return `<div class="pin-card" onclick='playTrackObj(${JSON.stringify(track).replace(/"/g,"&quot;")})'>
              <img src="${t.thumbnail||PH_}" onerror="this.src='${PH_}'">
              <div class="pin-overlay">
                <div class="pin-title">${_esc(t.title)}</div>
                <div class="pin-artist">${_esc(t.artist)}</div>
              </div>
              <div class="pin-slot-badge">${slot}</div>
            </div>`;
          }).join('');
        }
      } catch {
        pinGrid.innerHTML = '<div style="color:var(--mt);font-size:.75rem;grid-column:1/-1;text-align:center;padding:12px">Pin tidak tersedia</div>';
      }

    } catch(e) {
      console.error('[PublikProfil]', e.message);
      if (typeof toast === 'function') toast('Gagal load profil: ' + e.message);
    }
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { open, close };
})();

// ── Override PinAvatar.openPubProfile → halaman full-page ────────
setTimeout(() => {
  if (typeof PinAvatar !== 'undefined') {
    PinAvatar.openPubProfile = (userKey, displayName) => PublikProfil.open(userKey, displayName);
  }
}, 300);

// ══════════════════════════════════════════════════════════════
//  FIX loadWrapped — merge user_play_counts + play_history
// ══════════════════════════════════════════════════════════════
window.loadWrapped = async function() {
  const _wrPeriod = typeof _wrappedPeriod !== 'undefined' ? _wrappedPeriod : 'month';
  const _PH       = typeof PH !== 'undefined' ? PH : '';
  const _USER_KEY = typeof USER_KEY !== 'undefined' ? USER_KEY : 'guest';

  if (!_USER_KEY || _USER_KEY === 'guest') return;

  ['wrTotalPlays','wrTotalMins','wrUniqTracks','wrStreak'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '...';
  });
  ['wrTopTracks','wrTopArtists','wrTimeSlot'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '<div class="wr-empty">Memuat...</div>';
  });

  try {
    const now = new Date(), since = new Date(now);
    if (_wrPeriod === 'month') since.setMonth(now.getMonth()-1);
    if (_wrPeriod === 'year')  since.setFullYear(now.getFullYear()-1);
    const sinceISO = _wrPeriod === 'all' ? null : since.toISOString();

    const [playCountRows, historyRows] = await Promise.all([
      (_wrPeriod === 'all'
        ? sb.get('user_play_counts', `user_key=eq.${encodeURIComponent(_USER_KEY)}&select=track_id,count`)
        : Promise.resolve([])
      ).catch(() => []),
      sb.get('play_history',
        `user_key=eq.${encodeURIComponent(_USER_KEY)}`
        + (sinceISO ? `&played_at=gte.${encodeURIComponent(sinceISO)}` : '')
        + '&select=track_id,played_at,duration_played&order=played_at.desc&limit=2000'
      ).catch(() => [])
    ]);

    const countMap = {};
    playCountRows.forEach(r => { if (r.track_id) countMap[r.track_id] = r.count||0; });
    const histCountMap = {};
    historyRows.forEach(h => { if (h.track_id) histCountMap[h.track_id] = (histCountMap[h.track_id]||0)+1; });
    Object.entries(histCountMap).forEach(([id,cnt]) => { countMap[id] = Math.max(countMap[id]||0, cnt); });

    if (!Object.keys(countMap).length) {
      ['wrTopTracks','wrTopArtists','wrTimeSlot'].forEach(id => {
        const el = document.getElementById(id); if (el) el.innerHTML = '<div class="wr-empty">Belum ada data.</div>';
      });
      ['wrTotalPlays','wrTotalMins','wrUniqTracks','wrStreak'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '0';
      });
      return;
    }

    const totalPlays = Object.values(countMap).reduce((a,b)=>a+b,0);
    const uniqTracks = Object.keys(countMap).length;
    const sortedIds  = Object.keys(countMap).sort((a,b)=>countMap[b]-countMap[a]);
    const top20Ids   = sortedIds.slice(0,20);

    let trackMap = {};
    if (top20Ids.length) {
      const tracks = await sb.get('tracks',
        `id=in.(${top20Ids.map(id=>encodeURIComponent(id)).join(',')})&select=id,title,artist,thumbnail,duration`
      );
      tracks.forEach(t => { trackMap[t.id] = t; });
    }

    let totalSecs = 0;
    historyRows.forEach(h => {
      if (h.duration_played && Number(h.duration_played)>0) {
        totalSecs += Number(h.duration_played);
      } else {
        const t = trackMap[h.track_id];
        if (t?.duration && String(t.duration).includes(':')) {
          const [m,s] = t.duration.split(':').map(Number);
          totalSecs += m*60+(s||0);
        } else { totalSecs += 210; }
      }
    });

    Object.entries(countMap).forEach(([id,cnt]) => {
      const histCnt = histCountMap[id]||0;
      const extra = cnt - histCnt;
      if (extra <= 0) return;
      const t = trackMap[id];
      let spx = 210;
      if (t?.duration && String(t.duration).includes(':')) { const [m,s]=t.duration.split(':').map(Number); spx=m*60+(s||0); }
      totalSecs += extra * spx;
    });
    const totalMins = Math.round(totalSecs/60);

    const localDate = dt => { const d=new Date(dt); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const playDays = new Set(historyRows.map(h => h.played_at ? localDate(h.played_at) : null));
    let streak=0; const _d=new Date();
    while (playDays.has(localDate(_d))) { streak++; _d.setDate(_d.getDate()-1); }

    const _s = id => document.getElementById(id);
    if (_s('wrTotalPlays')) _s('wrTotalPlays').textContent = totalPlays.toLocaleString('id-ID');
    if (_s('wrTotalMins'))  _s('wrTotalMins').textContent  = totalMins.toLocaleString('id-ID');
    if (_s('wrUniqTracks')) _s('wrUniqTracks').textContent = uniqTracks;
    if (_s('wrStreak'))     _s('wrStreak').textContent     = streak+'h';

    if (_s('wrTopTracks')) {
      _s('wrTopTracks').innerHTML = top20Ids.slice(0,10).map((id,i) => {
        const t=trackMap[id]; if(!t?.title) return '';
        const track=typeof rowToTrack==='function'?rowToTrack(t,'db'):{...t,audio:t.audio_url};
        return `<div class="wr-track-item" onclick='typeof playTrackObj==="function"&&playTrackObj(${JSON.stringify(track).replace(/"/g,"&quot;")})'>
          <div class="wr-track-rank">${['🥇','🥈','🥉'][i]||i+1}</div>
          <img class="wr-track-thumb" src="${t.thumbnail||_PH}" onerror="this.src='${_PH}'">
          <div class="wr-track-info">
            <div class="wr-track-title">${t.title||'Unknown'}</div>
            <div class="wr-track-artist">${t.artist||'–'}</div>
          </div>
          <div class="wr-track-cnt">${countMap[id]}×</div>
        </div>`;
      }).filter(Boolean).join('')||'<div class="wr-empty">Tidak ada data.</div>';
    }

    const artistMap={};
    top20Ids.forEach(id=>{ const t=trackMap[id]; if(!t) return; artistMap[t.artist||'Unknown']=(artistMap[t.artist||'Unknown']||0)+countMap[id]; });
    const topArtists=Object.entries(artistMap).sort((a,b)=>b[1]-a[1]).slice(0,7);
    if (_s('wrTopArtists')) {
      _s('wrTopArtists').innerHTML=topArtists.length
        ?topArtists.map(([name,cnt])=>`<div class="wr-artist-item"><div class="wr-artist-name">${name}</div><div class="wr-artist-cnt">${cnt} putar</div></div>`).join('')
        :'<div class="wr-empty">Tidak ada data artis.</div>';
    }

    const slots={'Tengah Malam':0,'Dini Hari':0,'Pagi':0,'Siang':0,'Sore':0,'Malam':0};
    historyRows.forEach(h=>{ if(!h.played_at) return; const hr=new Date(h.played_at).getHours(); if(hr<4) slots['Tengah Malam']++; else if(hr<8) slots['Dini Hari']++; else if(hr<12) slots['Pagi']++; else if(hr<16) slots['Siang']++; else if(hr<20) slots['Sore']++; else slots['Malam']++; });
    const maxSlot=Math.max(...Object.values(slots),1);
    if (_s('wrTimeSlot')) {
      _s('wrTimeSlot').innerHTML=Object.entries(slots).map(([lbl,cnt])=>
        `<div class="wr-ts-row"><div class="wr-ts-lbl">${lbl}</div><div class="wr-ts-bar-wrap"><div class="wr-ts-bar" style="width:${Math.round(cnt/maxSlot*100)}%"></div></div><div class="wr-ts-cnt">${cnt}</div></div>`
      ).join('');
    }

  } catch(e) {
    if (typeof toast==='function') toast('Gagal load rekap: '+e.message);
  }
};
