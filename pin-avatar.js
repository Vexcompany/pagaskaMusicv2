// pin-avatar.js
// ══════════════════════════════════════════════════════════════
//  PinAvatar — Pin Lagu Favorit + Foto Profil + Profil Publik
//  Depends on: sb, USER_KEY, BACKEND_URL, toast(), playTrackObj(),
//              esc(), escapeHtml(), openChatRoom()
// ══════════════════════════════════════════════════════════════

const PinAvatar = (() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let _myPins      = [];   // [{position, track_id}]
  let _pickerSlot  = null; // slot dipilih (1/2/3)
  let _pickerTrack = null; // track dipilih dari player
  const _avatarCache = {}; // user_key → url | null

  // ── Helpers ────────────────────────────────────────────────
  function _ini(name) {
    return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function _ph(size = 120) {
    return `https://placehold.co/${size}x${size}/0d0d24/333?text=♪`;
  }

  async function _ensureAllTracks() {
    if (window.allTracks && window.allTracks.length > 0) return;
    try {
      window.allTracks = await sb.get(
        'tracks',
        'select=id,title,artist,thumbnail,audio_url&order=title.asc&limit=500'
      ) || [];
    } catch { window.allTracks = []; }
  }

  function _trackById(id) {
    return (window.allTracks || []).find(t => String(t.id) === String(id)) || null;
  }

  // ══════════════════════════════════════════════════════════
  //  AVATAR
  // ══════════════════════════════════════════════════════════
  async function _fetchAvatar(userKey) {
    if (userKey in _avatarCache) return _avatarCache[userKey];
    try {
      const rows = await sb.get('user_avatars', `user_key=eq.${encodeURIComponent(userKey)}&select=avatar_url`);
      _avatarCache[userKey] = rows?.[0]?.avatar_url || null;
    } catch {
      _avatarCache[userKey] = null;
    }
    return _avatarCache[userKey];
  }

  async function loadMyAvatar() {
    const url    = await _fetchAvatar(USER_KEY);
    const initEl = document.getElementById('profilAvInit');
    const imgEl  = document.getElementById('profilAvImg');
    if (!initEl || !imgEl) return;
    if (url) {
      imgEl.src          = url;
      imgEl.style.display = 'block';
      initEl.style.display = 'none';
    } else {
      imgEl.style.display  = 'none';
      initEl.style.display = 'flex';
    }
    // Terapkan ke elemen avatar di halaman yang sudah ter-render
    _applyAvatarToEl(USER_KEY, url);
  }

  function _applyAvatarToEl(userKey, url) {
    if (!url) return;
    // Activity items
    const actEl = document.getElementById(`actav-${userKey}`);
    if (actEl && !actEl.querySelector('img')) {
      actEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block';
      img.onerror = () => { img.remove(); };
      actEl.appendChild(img);
    }
  }

  function triggerUpload() {
    document.getElementById('avatarFileInput')?.click();
  }

  async function onFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // reset input
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { toast('Format harus JPG, PNG, atau WebP'); return; }
    if (file.size > 2 * 1024 * 1024)  { toast('Ukuran foto maksimal 2MB'); return; }

    toast('Mengupload foto profil...');
    try {
      const base64 = await _resizeToBase64(file, 400);
      const res    = await fetch(`${BACKEND_URL}/api/upload-avatar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg', userKey: USER_KEY }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload gagal');

      const url = json.url;
      // Upsert ke Supabase
      const existing = await sb.get('user_avatars', `user_key=eq.${encodeURIComponent(USER_KEY)}&select=user_key`);
      if (existing?.length) {
        await sb.patch('user_avatars', `user_key=eq.${encodeURIComponent(USER_KEY)}`, { avatar_url: url, updated_at: new Date().toISOString() });
      } else {
        await sb.post('user_avatars', { user_key: USER_KEY, avatar_url: url });
      }

      _avatarCache[USER_KEY] = url;
      await loadMyAvatar();
      toast('Foto profil berhasil diperbarui');
    } catch (e) {
      console.error('[avatar]', e);
      toast('Gagal upload: ' + e.message);
    }
  }

  function _resizeToBase64(file, maxSize) {
    return new Promise((resolve, reject) => {
      const img    = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else       { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.82).split(',')[1]);
      };
      img.onerror = reject;
      img.src = objUrl;
    });
  }

  // ══════════════════════════════════════════════════════════
  //  PIN GRID (profil sendiri)
  // ══════════════════════════════════════════════════════════
  async function _loadMyPins() {
    try {
      _myPins = await sb.get(
        'pinned_tracks',
        `user_key=eq.${encodeURIComponent(USER_KEY)}&select=position,track_id&order=position.asc`
      ) || [];
    } catch { _myPins = []; }
  }

  async function renderMyPins() {
    const grid = document.getElementById('profilPinGrid');
    if (!grid) return;
    grid.innerHTML = '<div style="color:var(--mt);font-size:.7rem;text-align:center;grid-column:1/-1;padding:10px">Memuat...</div>';

    await Promise.all([_loadMyPins(), _ensureAllTracks()]);

    grid.innerHTML = [1, 2, 3].map(slot => {
      const pin   = _myPins.find(p => p.position === slot);
      const track = pin ? _trackById(pin.track_id) : null;

      if (pin && track) {
        const th = track.thumbnail || _ph();
        return `<div class="pin-card" onclick="playTrackObj(${esc(track)})">
          <img src="${th}" onerror="this.src='${_ph()}'">
          <div class="pin-overlay">
            <div class="pin-title">${escapeHtml(track.title || '–')}</div>
            <div class="pin-artist">${escapeHtml(track.artist || '–')}</div>
          </div>
          <div class="pin-slot-badge">${slot}</div>
          <button class="pin-remove" onclick="event.stopPropagation();PinAvatar.removePin(${slot})" title="Hapus">
            <i class="fas fa-times"></i>
          </button>
        </div>`;
      }
      return `<div class="pin-empty" onclick="PinAvatar.openPicker(null,${slot})">
        <i class="fas fa-plus"></i><span>Slot ${slot}</span>
      </div>`;
    }).join('');
  }

  async function removePin(position) {
    try {
      await sb.del('pinned_tracks', `user_key=eq.${encodeURIComponent(USER_KEY)}&position=eq.${position}`);
    } catch (e) { console.warn('[pin remove]', e); }
    await renderMyPins();
    toast('Pin dihapus');
  }

  async function _savePin(slot, trackId) {
    // Hapus slot ini kalau sudah ada isi
    try { await sb.del('pinned_tracks', `user_key=eq.${encodeURIComponent(USER_KEY)}&position=eq.${slot}`); } catch {}
    await sb.post('pinned_tracks', {
      user_key:  USER_KEY,
      track_id:  String(trackId),
      position:  slot,
      pinned_at: new Date().toISOString(),
    });
  }

  // ══════════════════════════════════════════════════════════
  //  PICKER MODAL
  // ══════════════════════════════════════════════════════════
  async function openPicker(track, slot) {
    _pickerTrack = track  || null;
    _pickerSlot  = slot   || null;

    const modal   = document.getElementById('pinPickerModal');
    const titleEl = document.getElementById('pinPickerTitle');
    const listEl  = document.getElementById('pinPickerList');
    const srchEl  = document.getElementById('pinPickerSearch');
    if (!modal) return;

    srchEl.value = '';
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--mt);font-size:.75rem">Memuat...</div>';

    if (track) {
      titleEl.textContent = 'Pilih Slot Pin';
    } else if (slot) {
      titleEl.textContent = `Pilih Lagu — Slot ${slot}`;
    } else {
      titleEl.textContent = 'Kelola Pin';
    }

    modal.classList.add('open');

    await Promise.all([_loadMyPins(), _ensureAllTracks()]);

    if (track) {
      _renderSlotPicker(track, listEl);
    } else {
      _renderTrackList('', listEl);
    }
  }

  async function _renderSlotPicker(track, listEl) {
    listEl.innerHTML = [1, 2, 3].map(s => {
      const pin      = _myPins.find(p => p.position === s);
      const existing = pin ? _trackById(pin.track_id) : null;
      const sub      = existing
        ? `Timpa: ${escapeHtml((existing.title || '').slice(0, 20))}${existing.title?.length > 20 ? '…' : ''}`
        : 'Slot kosong';
      return `<button class="pin-picker-item" onclick="PinAvatar._doPin(${s}, ${esc(track)})">
        <div style="width:40px;height:40px;border-radius:8px;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:1rem;color:var(--dyn1);font-weight:800;flex-shrink:0">${s}</div>
        <div class="pin-picker-meta">
          <div class="pin-picker-title">Slot ${s}</div>
          <div class="pin-picker-artist">${sub}</div>
        </div>
      </button>`;
    }).join('');
  }

  function _renderTrackList(query, listEl) {
    const tracks = _filterTracks(query);
    if (!tracks.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--mt);font-size:.75rem">Tidak ada lagu</div>';
      return;
    }
    listEl.innerHTML = tracks.slice(0, 100).map(t =>
      `<button class="pin-picker-item" onclick="PinAvatar._onTrackSelected(${esc(t)})">
        <img src="${t.thumbnail || _ph(40)}" onerror="this.src='${_ph(40)}'">
        <div class="pin-picker-meta">
          <div class="pin-picker-title">${escapeHtml(t.title || '–')}</div>
          <div class="pin-picker-artist">${escapeHtml(t.artist || '–')}</div>
        </div>
      </button>`
    ).join('');
  }

  function _filterTracks(q) {
    const tracks = window.allTracks || [];
    if (!q) return tracks;
    const lq = q.toLowerCase();
    return tracks.filter(t =>
      (t.title  || '').toLowerCase().includes(lq) ||
      (t.artist || '').toLowerCase().includes(lq)
    );
  }

  function filterPicker(query) {
    const listEl = document.getElementById('pinPickerList');
    if (!listEl || _pickerTrack) return; // mode slot picker — tidak filter
    _renderTrackList(query, listEl);
  }

  async function _onTrackSelected(track) {
    if (_pickerSlot) {
      // Slot sudah diketahui — langsung simpan
      await _doPin(_pickerSlot, track);
    } else {
      // Pilih slot dulu
      _pickerTrack = track;
      document.getElementById('pinPickerTitle').textContent = 'Pilih Slot Pin';
      _renderSlotPicker(track, document.getElementById('pinPickerList'));
    }
  }

  async function _doPin(slot, track) {
    closePicker();
    try {
      await _savePin(slot, track.id);
      _myPins = _myPins.filter(p => p.position !== slot);
      _myPins.push({ position: slot, track_id: String(track.id) });
      await renderMyPins();
      toast(`"${track.title}" di-pin ke slot ${slot}`);
    } catch (e) {
      console.error('[pin save]', e);
      toast('Gagal menyimpan pin');
    }
  }

  function closePicker() {
    document.getElementById('pinPickerModal')?.classList.remove('open');
    _pickerTrack = null;
    _pickerSlot  = null;
  }

  // ══════════════════════════════════════════════════════════
  //  PUBLIC PROFILE SHEET
  // ══════════════════════════════════════════════════════════
  async function openPubProfile(userKey, name) {
    const modal = document.getElementById('pubProfileModal');
    if (!modal) return;

    // Reset ke loading state
    document.getElementById('pubHeader').innerHTML  = '<div style="color:var(--mt);font-size:.75rem;padding:8px 0">Memuat profil...</div>';
    document.getElementById('pubStats').innerHTML   = '';
    document.getElementById('pubPinGrid').innerHTML = '';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    await Promise.all([_ensureAllTracks()]);

    const [avatarUrl, pubPins, playCount] = await Promise.all([
      _fetchAvatar(userKey),
      _fetchPubPins(userKey),
      _fetchPlayCount(userKey),
    ]);

    // ── Header ──
    const ini    = _ini(name);
    const avHtml = avatarUrl
      ? `<img src="${avatarUrl}" class="pub-av-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="pub-av-init" style="display:none">${ini}</div>`
      : `<div class="pub-av-init">${ini}</div>`;

    const parts    = userKey.split('_');
    const gen      = parts[parts.length - 1];
    const isMe     = userKey === USER_KEY;
    const chatBtn  = !isMe
      ? `<button onclick="closePubProfileAndChat('${userKey.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}');"
           style="margin-top:8px;padding:7px 14px;border-radius:10px;background:var(--g);color:#000;border:none;font-size:.72rem;font-weight:700;cursor:pointer;touch-action:manipulation;display:inline-flex;align-items:center;gap:6px">
           <i class="fas fa-comment"></i> Kirim Pesan
         </button>`
      : '';

    document.getElementById('pubHeader').innerHTML = `
      ${avHtml}
      <div style="flex:1;min-width:0">
        <div class="pub-name">${escapeHtml(name)}</div>
        <div class="pub-sub">Generasi ${gen}${isMe ? ' · Kamu' : ''}</div>
        ${chatBtn}
      </div>`;

    // ── Stats ──
    document.getElementById('pubStats').innerHTML = [
      { lbl: 'Total Putar', val: playCount, ico: 'fas fa-headphones', color: 'var(--dyn1)' },
      { lbl: 'Pin Lagu',    val: pubPins.length, ico: 'fas fa-thumbtack', color: 'var(--p2)' },
      { lbl: 'Generasi',    val: gen,            ico: 'fas fa-users',     color: 'var(--b2)' },
    ].map(s => `<div class="pub-stat">
      <i class="${s.ico}" style="color:${s.color};font-size:.95rem;margin-bottom:4px;display:block"></i>
      <div class="pub-stat-val">${s.val}</div>
      <div class="pub-stat-lbl">${s.lbl}</div>
    </div>`).join('');

    // ── Pin Grid ──
    const pinGrid = document.getElementById('pubPinGrid');
    if (!pubPins.length) {
      pinGrid.innerHTML = `<div style="grid-column:1/-1;color:var(--mt);font-size:.72rem;text-align:center;padding:14px">Belum ada pin favorit</div>`;
    } else {
      pinGrid.innerHTML = [1, 2, 3].map(slot => {
        const pin   = pubPins.find(p => p.position === slot);
        const track = pin ? _trackById(pin.track_id) : null;
        if (pin && track) {
          const th = track.thumbnail || _ph();
          return `<div class="pin-card" onclick="playTrackObj(${esc(track)});PinAvatar.closePubProfile()">
            <img src="${th}" onerror="this.src='${_ph()}'">
            <div class="pin-overlay">
              <div class="pin-title">${escapeHtml(track.title || '–')}</div>
              <div class="pin-artist">${escapeHtml(track.artist || '–')}</div>
            </div>
            <div class="pin-slot-badge">${slot}</div>
          </div>`;
        }
        return `<div class="pin-empty" style="cursor:default;pointer-events:none">
          <i class="fas fa-music" style="opacity:.3"></i>
        </div>`;
      }).join('');
    }
  }

  async function _fetchPubPins(userKey) {
    try {
      return await sb.get(
        'pinned_tracks',
        `user_key=eq.${encodeURIComponent(userKey)}&select=position,track_id&order=position.asc`
      ) || [];
    } catch { return []; }
  }

  async function _fetchPlayCount(userKey) {
    try {
      const rows = await sb.get('user_play_counts', `user_key=eq.${encodeURIComponent(userKey)}&select=count`);
      return (rows || []).reduce((a, r) => a + (r.count || 0), 0);
    } catch { return 0; }
  }

  function closePubProfile() {
    document.getElementById('pubProfileModal')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ══════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════
  return {
    // Avatar
    loadMyAvatar,
    triggerUpload,
    onFileChange,
    // Pin
    renderMyPins,
    removePin,
    openPicker,
    filterPicker,
    closePicker,
    // Public profile
    openPubProfile,
    closePubProfile,
    // Called from inline HTML (must be public)
    _onTrackSelected,
    _doPin,
  };

})();

window.PinAvatar = PinAvatar;

// ══════════════════════════════════════════════════════════════
//  AVATAR FOTO DI CHAT — fix: header chat room & list chat
//  sebelumnya selalu pakai inisial teks, sekarang ambil foto asli
// ══════════════════════════════════════════════════════════════
PinAvatar.applyAvatarTo = async function (el, userKey) {
  if (!el || !userKey) return;
  if (el.querySelector('img')) return; // sudah ada foto, skip
  let url;
  try { url = await PinAvatar._fetchAvatarPublic(userKey); } catch { url = null; }
  if (!url) return;
  // Preservasi elemen status online (dot hijau) kalau ada
  const onlineDot = el.querySelector('.chat-online');
  el.innerHTML = '';
  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block';
  img.onerror = function () { this.remove(); }; // fallback: biarkan kosong, inisial sudah hilang tapi tidak fatal
  el.appendChild(img);
  if (onlineDot) el.appendChild(onlineDot);
};

// Wrapper kecil ke _fetchAvatar internal (karena _fetchAvatar ada di closure)
PinAvatar._fetchAvatarPublic = async function (userKey) {
  try {
    const rows = await sb.get('user_avatars', `user_key=eq.${encodeURIComponent(userKey)}&select=avatar_url`);
    return rows?.[0]?.avatar_url || null;
  } catch { return null; }
};

// ── Pasang avatar foto di header Chat Room ──────────────────────
const _origOpenChatRoom = window.openChatRoom;
if (typeof _origOpenChatRoom === 'function') {
  window.openChatRoom = async function (otherKey, name) {
    const ret = _origOpenChatRoom(otherKey, name);
    if (ret && typeof ret.then === 'function') await ret;
    const avEl = document.getElementById('chatRoomAv');
    PinAvatar.applyAvatarTo(avEl, otherKey);
  };
}

// ── Pasang avatar foto di setiap item Chat List ──────────────────
const _origLoadChatList = window.loadChatList;
if (typeof _origLoadChatList === 'function') {
  window.loadChatList = async function () {
    const ret = _origLoadChatList();
    if (ret && typeof ret.then === 'function') await ret;
    document.querySelectorAll('#chatList .chat-item[data-user-key]').forEach(item => {
      const key  = item.dataset.userKey;
      const avEl = item.querySelector('.chat-av');
      PinAvatar.applyAvatarTo(avEl, key);
    });
  };
}

// ── Pasang avatar foto di Live Activity feed (beranda) ────────────
const _origRenderActivity = window.renderActivity;
if (typeof _origRenderActivity === 'function') {
  window.renderActivity = function () {
    _origRenderActivity();
    document.querySelectorAll('#activityFeed [id^="actav-"]').forEach(el => {
      const key = el.id.replace('actav-', '');
      PinAvatar.applyAvatarTo(el, key);
    });
  };
}

// Helper: tutup profil publik lalu buka chat
function closePubProfileAndChat(userKey, name) {
  PinAvatar.closePubProfile();
  setTimeout(() => {
    navigate('chat');
    setTimeout(() => openChatRoom(userKey, name), 200);
  }, 150);
}
