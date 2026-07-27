// ════════════════════════════════════════════════════════════════
//  playlist.js — Pagaska Music User Playlist System
//  UPDATE #3: Playlist buatan user, visible ke semua, named
//  Requires: SB_URL, SB_KEY, session (pgsk_v2_session) di index.html
//  Requires: playTrackObj(), addToQueue(), toast() dari index.html
// ════════════════════════════════════════════════════════════════

const PlaylistManager = (() => {

  // ── SQL schema yang dibutuhkan di Supabase (jalankan sekali):
  // CREATE TABLE playlists (
  //   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  //   name TEXT NOT NULL,
  //   owner_name TEXT NOT NULL,
  //   owner_generasi TEXT NOT NULL,
  //   created_at TIMESTAMPTZ DEFAULT now(),
  //   track_count INT DEFAULT 0
  // );
  // CREATE TABLE playlist_tracks (
  //   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  //   playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  //   track_id TEXT NOT NULL,
  //   title TEXT, artist TEXT, thumbnail TEXT, audio_url TEXT,
  //   added_at TIMESTAMPTZ DEFAULT now(),
  //   position INT DEFAULT 0
  // );
  // ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
  // ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;
  // CREATE POLICY "public read" ON playlists FOR SELECT USING (true);
  // CREATE POLICY "public read" ON playlist_tracks FOR SELECT USING (true);
  // CREATE POLICY "service all" ON playlists USING (true) WITH CHECK (true);
  // CREATE POLICY "service all" ON playlist_tracks USING (true) WITH CHECK (true);

  const _h = () => ({
    'Content-Type': 'application/json',
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    Prefer: 'return=representation'
  });

  function _sess() {
    try { return JSON.parse(localStorage.getItem('pgsk_v2_session') || 'null'); }
    catch { return null; }
  }

  function _isOwner(pl) {
    const s = _sess();
    return s && pl.owner_name === s.nama && pl.owner_generasi == s.generasi;
  }

  // ── 🎨 FORMAT TANGGAL ─────────────────────────────────────────
  function _fmtDate(ts) {
    try {
      return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return ''; }
  }

  // ── 🔁 LOAD SEMUA PLAYLIST (visible ke semua user) ────────────
  async function loadAll() {
    const grid = document.getElementById('plGrid');
    const empty = document.getElementById('plEmpty');
    if (!grid) return;

    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--mt)">
      <i class="fas fa-circle-notch spin" style="font-size:1.4rem;color:var(--g)"></i>
      <div style="font-size:.75rem;margin-top:8px">Memuat playlist...</div>
    </div>`;
    if (empty) empty.style.display = 'none';

    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/playlists?select=*&order=created_at.desc`,
        { headers: _h() }
      );
      const rows = await res.json();
      if (!rows?.length) {
        grid.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
      }
      grid.innerHTML = rows.map(pl => _cardHtml(pl)).join('');
    } catch (e) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--rd);font-size:.75rem">⚠️ Gagal memuat: ${e.message}</div>`;
    }
  }

  // ── 🃏 CARD HTML SATU PLAYLIST ────────────────────────────────
  function _cardHtml(pl) {
    const mine = _isOwner(pl);
    const encId = encodeURIComponent(pl.id);
    const encName = encodeURIComponent(pl.name);
    return `<div class="pl-card" onclick="PlaylistManager.openDetail('${encId}','${encName}')">
      <div class="pl-card-art">
        <i class="fas fa-music" style="font-size:1.6rem;color:var(--g)"></i>
        <div class="pl-card-play"><i class="fas fa-play"></i></div>
      </div>
      <div class="pl-card-info">
        <div class="pl-card-title">${_esc(pl.name)}</div>
        <div class="pl-card-owner"><i class="fas fa-user" style="font-size:.55rem;margin-right:3px"></i>playlist oleh ${_esc(pl.owner_name)} · Gen ${_esc(pl.owner_generasi)}</div>
        <div class="pl-card-meta">${pl.track_count || 0} lagu · ${_fmtDate(pl.created_at)}</div>
      </div>
      ${mine ? `<button class="pl-card-del" onclick="event.stopPropagation();PlaylistManager.deletePlaylist('${encId}')" title="Hapus playlist"><i class="fas fa-trash-alt"></i></button>` : ''}
    </div>`;
  }

  // ── ➕ BUAT PLAYLIST BARU ──────────────────────────────────────
  function showCreate() {
    const modal = document.getElementById('plCreateModal');
    if (modal) {
      document.getElementById('plNewName').value = '';
      modal.classList.add('open');
      setTimeout(() => document.getElementById('plNewName')?.focus(), 150);
    }
  }

  function closeCreate() {
    document.getElementById('plCreateModal')?.classList.remove('open');
  }

  async function createPlaylist() {
    const nameEl = document.getElementById('plNewName');
    const name = nameEl?.value.trim();
    if (!name) { toast('⚠️ Nama playlist tidak boleh kosong'); return; }

    const s = _sess();
    if (!s) { toast('⚠️ Silakan login dulu'); return; }

    const btn = document.getElementById('plCreateBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch spin"></i> Membuat...'; }

    try {
      const res = await fetch(`${SB_URL}/rest/v1/playlists`, {
        method: 'POST',
        headers: _h(),
        body: JSON.stringify({ name, owner_name: s.nama, owner_generasi: String(s.generasi), track_count: 0 })
      });
      if (!res.ok) throw new Error(await res.text());
      const rows = await res.json();
      closeCreate();
      toast(`✅ Playlist "${name}" berhasil dibuat!`);
      await loadAll();
      if (rows?.[0]) openDetail(encodeURIComponent(rows[0].id), encodeURIComponent(rows[0].name));
    } catch (e) {
      toast('❌ Gagal buat playlist: ' + e.message);
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Buat Playlist'; }
  }

  // ── 🗑️ HAPUS PLAYLIST ─────────────────────────────────────────
  async function deletePlaylist(encId) {
    const id = decodeURIComponent(encId);
    if (!confirm('Hapus playlist ini? Semua lagu di dalamnya juga akan dihapus.')) return;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/playlists?id=eq.${id}`, { method: 'DELETE', headers: _h() });
      if (!r.ok) throw new Error(await r.text());
      toast('🗑️ Playlist dihapus');
      loadAll();
    } catch (e) { toast('❌ ' + e.message); }
  }

  // ── 📂 BUKA DETAIL PLAYLIST ───────────────────────────────────
  async function openDetail(encId, encName) {
    const id   = decodeURIComponent(encId);
    const name = decodeURIComponent(encName);

    document.getElementById('plDetailName').textContent = name;
    document.getElementById('plDetailList').innerHTML = `<div style="text-align:center;padding:24px;color:var(--mt)"><i class="fas fa-circle-notch spin" style="color:var(--g)"></i></div>`;
    document.getElementById('plDetailOwner').textContent = '';
    document.getElementById('plDetailMeta').textContent = '';
    document.getElementById('plDetailPlayAll').dataset.plid = id;
    document.getElementById('plDetailModal').classList.add('open');

    try {
      // Ambil info playlist
      const rPl = await fetch(`${SB_URL}/rest/v1/playlists?id=eq.${encodeURIComponent(id)}&select=*`, { headers: _h() });
      const pls = await rPl.json();
      const pl  = pls?.[0];
      if (pl) {
        document.getElementById('plDetailOwner').innerHTML = `<i class="fas fa-user" style="font-size:.58rem;margin-right:3px"></i>playlist oleh <strong>${_esc(pl.owner_name)}</strong> · Gen ${_esc(pl.owner_generasi)}`;
        document.getElementById('plDetailMeta').textContent = `${pl.track_count || 0} lagu · ${_fmtDate(pl.created_at)}`;

        // Tampilkan tombol rename/add hanya untuk pemilik
        const myPl = _isOwner(pl);
        document.getElementById('plDetailRenameBtn').style.display = myPl ? 'flex' : 'none';
        document.getElementById('plDetailRenameBtn').dataset.plid = id;
        document.getElementById('plDetailRenameBtn').dataset.plname = pl.name;
      }

      // Ambil tracks
      const rTr = await fetch(`${SB_URL}/rest/v1/playlist_tracks?playlist_id=eq.${encodeURIComponent(id)}&order=position.asc,added_at.asc`, { headers: _h() });
      const tracks = await rTr.json();

      if (!tracks?.length) {
        document.getElementById('plDetailList').innerHTML = `<div style="text-align:center;padding:30px;color:var(--mt)">
          <i class="fas fa-music" style="font-size:1.5rem;opacity:.3;display:block;margin-bottom:8px"></i>
          <div style="font-size:.75rem">Belum ada lagu di playlist ini</div>
          ${_isOwner(pl) ? '<div style="font-size:.68rem;margin-top:5px;color:var(--g)">Tambah lagu dari tombol ··· saat memutar</div>' : ''}
        </div>`;
        return;
      }

      const myPl = pl ? _isOwner(pl) : false;
      document.getElementById('plDetailList').innerHTML = tracks.map((t, i) =>
        `<div class="pl-track-row" onclick="PlaylistManager.playFromDetail('${encodeURIComponent(JSON.stringify({id:t.track_id,title:t.title,artist:t.artist,thumbnail:t.thumbnail,audio:t.audio_url,source:'db'}))}')">
          <div class="pl-track-num">${i + 1}</div>
          <div class="pl-track-thumb">
            ${t.thumbnail ? `<img src="${_esc(t.thumbnail)}" onerror="this.style.display='none'" style="width:36px;height:36px;border-radius:7px;object-fit:cover">` : `<div style="width:36px;height:36px;border-radius:7px;background:var(--s3);display:flex;align-items:center;justify-content:center"><i class="fas fa-music" style="font-size:.65rem;color:var(--mt)"></i></div>`}
          </div>
          <div class="pl-track-info">
            <div class="pl-track-title">${_esc(t.title || 'Unknown')}</div>
            <div class="pl-track-artist">${_esc(t.artist || 'Unknown')}</div>
          </div>
          ${myPl ? `<button class="pl-track-del" onclick="event.stopPropagation();PlaylistManager.removeTrack('${t.id}','${encId}')" title="Hapus dari playlist"><i class="fas fa-times"></i></button>` : ''}
        </div>`
      ).join('');
    } catch (e) {
      document.getElementById('plDetailList').innerHTML = `<div style="text-align:center;padding:16px;color:var(--rd);font-size:.73rem">⚠️ Gagal memuat: ${e.message}</div>`;
    }
  }

  function closeDetail() {
    document.getElementById('plDetailModal')?.classList.remove('open');
  }

  // ── ▶️ PUTAR SEMUA DARI PLAYLIST ─────────────────────────────
  async function playAllFromDetail() {
    const id = document.getElementById('plDetailPlayAll')?.dataset.plid;
    if (!id) return;
    try {
      const res = await fetch(`${SB_URL}/rest/v1/playlist_tracks?playlist_id=eq.${encodeURIComponent(id)}&order=position.asc,added_at.asc`, { headers: _h() });
      const tracks = await res.json();
      if (!tracks?.length) { toast('⚠️ Playlist kosong'); return; }
      // Tambahkan semua ke queue lalu putar yang pertama
      tracks.forEach(t => {
        if (typeof addToQueue === 'function') addToQueue({ id: t.track_id, title: t.title, artist: t.artist, thumbnail: t.thumbnail, audio: t.audio_url, source: 'db' });
      });
      if (typeof playTrackObj === 'function') await playTrackObj({ id: tracks[0].track_id, title: tracks[0].title, artist: tracks[0].artist, thumbnail: tracks[0].thumbnail, audio: tracks[0].audio_url, source: 'db' });
      closeDetail();
      toast(`▶️ Memutar ${tracks.length} lagu dari playlist`);
    } catch(e) { toast('❌ ' + e.message); }
  }

  function playFromDetail(enc) {
    try {
      const t = JSON.parse(decodeURIComponent(enc));
      if (typeof playTrackObj === 'function') playTrackObj(t);
    } catch(e) { toast('❌ ' + e.message); }
  }

  // ── ❌ HAPUS TRACK DARI PLAYLIST ─────────────────────────────
  async function removeTrack(ptId, encPlId) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/playlist_tracks?id=eq.${ptId}`, { method: 'DELETE', headers: _h() });
      if (!r.ok) throw new Error(await r.text());
      // Update track_count
      const plId = decodeURIComponent(encPlId);
      const rCnt = await fetch(`${SB_URL}/rest/v1/playlist_tracks?playlist_id=eq.${encodeURIComponent(plId)}&select=id`, { headers: _h() });
      const cnt = (await rCnt.json())?.length || 0;
      await fetch(`${SB_URL}/rest/v1/playlists?id=eq.${encodeURIComponent(plId)}`, { method: 'PATCH', headers: _h(), body: JSON.stringify({ track_count: cnt }) });
      toast('🗑️ Lagu dihapus dari playlist');
      openDetail(encPlId, encodeURIComponent(document.getElementById('plDetailName')?.textContent || ''));
    } catch(e) { toast('❌ ' + e.message); }
  }

  // ── ➕ TAMBAH LAGU KE PLAYLIST (dipanggil dari player) ────────
  async function showAddToPlaylist(track) {
    // Simpan track yang mau ditambahkan
    window._plAddTrack = track;

    const list = document.getElementById('plPickList');
    if (!list) return;

    list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--mt)"><i class="fas fa-circle-notch spin"></i></div>`;
    document.getElementById('plPickModal')?.classList.add('open');

    const s = _sess();
    if (!s) { list.innerHTML = '<div style="text-align:center;padding:16px;color:var(--mt);font-size:.75rem">Login dulu ya!</div>'; return; }

    try {
      // Tampilkan hanya playlist milik user ini
      const res = await fetch(
        `${SB_URL}/rest/v1/playlists?owner_name=eq.${encodeURIComponent(s.nama)}&owner_generasi=eq.${encodeURIComponent(String(s.generasi))}&order=created_at.desc`,
        { headers: _h() }
      );
      const rows = await res.json();
      if (!rows?.length) {
        list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--mt);font-size:.75rem">
          Kamu belum punya playlist.<br>
          <button onclick="PlaylistManager.closePickModal();PlaylistManager.showCreate()" style="margin-top:8px;padding:6px 14px;border-radius:8px;background:var(--g);color:#000;border:none;font-size:.72rem;font-weight:700;cursor:pointer">+ Buat Playlist</button>
        </div>`;
        return;
      }
      list.innerHTML = rows.map(pl =>
        `<div class="pl-pick-row" onclick="PlaylistManager.addTrackToPlaylist('${encodeURIComponent(pl.id)}','${encodeURIComponent(pl.name)}')">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--s3);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-music" style="font-size:.65rem;color:var(--g)"></i></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.78rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(pl.name)}</div>
            <div style="font-size:.62rem;color:var(--mt)">${pl.track_count || 0} lagu</div>
          </div>
          <i class="fas fa-plus" style="color:var(--g);font-size:.8rem"></i>
        </div>`
      ).join('');
    } catch(e) {
      list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--rd);font-size:.73rem">⚠️ ${e.message}</div>`;
    }
  }

  function closePickModal() {
    document.getElementById('plPickModal')?.classList.remove('open');
  }

  async function addTrackToPlaylist(encPlId, encPlName) {
    const plId   = decodeURIComponent(encPlId);
    const plName = decodeURIComponent(encPlName);
    const t = window._plAddTrack;
    if (!t) { toast('⚠️ Tidak ada lagu dipilih'); closePickModal(); return; }

    try {
      // Cek posisi terakhir
      const rPos = await fetch(`${SB_URL}/rest/v1/playlist_tracks?playlist_id=eq.${encodeURIComponent(plId)}&select=position&order=position.desc&limit=1`, { headers: _h() });
      const posRows = await rPos.json();
      const nextPos = posRows?.[0]?.position != null ? posRows[0].position + 1 : 0;

      // Insert track
      const rIns = await fetch(`${SB_URL}/rest/v1/playlist_tracks`, {
        method: 'POST', headers: _h(),
        body: JSON.stringify({
          playlist_id: plId,
          track_id: String(t.id || t.trackId || Date.now()),
          title:    t.title  || 'Unknown',
          artist:   t.artist || 'Unknown',
          thumbnail: t.thumbnail || null,
          audio_url: t.audio || t.audioUrl || null,
          position: nextPos
        })
      });
      if (!rIns.ok) throw new Error(await rIns.text());

      // Update track_count
      const rCnt = await fetch(`${SB_URL}/rest/v1/playlist_tracks?playlist_id=eq.${encodeURIComponent(plId)}&select=id`, { headers: _h() });
      const cnt = (await rCnt.json())?.length || 0;
      await fetch(`${SB_URL}/rest/v1/playlists?id=eq.${encodeURIComponent(plId)}`, {
        method: 'PATCH', headers: _h(), body: JSON.stringify({ track_count: cnt })
      });

      closePickModal();
      toast(`✅ "${t.title}" ditambahkan ke "${plName}"`);
      window._plAddTrack = null;
    } catch(e) { toast('❌ ' + e.message); }
  }

  // ── ✏️ RENAME PLAYLIST ────────────────────────────────────────
  async function renamePlaylist() {
    const btn = document.getElementById('plDetailRenameBtn');
    const plId = btn?.dataset.plid;
    const oldName = btn?.dataset.plname;
    if (!plId) return;
    const newName = prompt('Nama baru playlist:', oldName || '');
    if (!newName?.trim() || newName.trim() === oldName) return;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/playlists?id=eq.${encodeURIComponent(plId)}`, {
        method: 'PATCH', headers: _h(), body: JSON.stringify({ name: newName.trim() })
      });
      if (!r.ok) throw new Error(await r.text());
      toast(`✅ Playlist diganti nama menjadi "${newName.trim()}"`);
      document.getElementById('plDetailName').textContent = newName.trim();
      btn.dataset.plname = newName.trim();
      loadAll();
    } catch(e) { toast('❌ ' + e.message); }
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    loadAll, showCreate, closeCreate, createPlaylist,
    deletePlaylist, openDetail, closeDetail,
    playAllFromDetail, playFromDetail, removeTrack,
    showAddToPlaylist, closePickModal, addTrackToPlaylist,
    renamePlaylist
  };

})();

window.PlaylistManager = PlaylistManager;
