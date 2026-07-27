// ════════════════════════════════════════════════════════════════
//  notif.js — Pagaska Music Notification System (UPDATE #4)
//  Diload di index.html setelah playlist.js
//  Fitur:
//    - Subscribe Web Push (VAPID)
//    - Poll notif dari Supabase tiap 30 detik (fallback tanpa push)
//    - In-app bell icon + dropdown riwayat notif
//    - Mark as read
// ════════════════════════════════════════════════════════════════

const PagaskaNotif = (() => {

  // ── CONFIG ──────────────────────────────────────────────────
  // VAPID public key — generate di: https://web-push-codelab.glitch.me/
  // Atau pakai: npx web-push generate-vapid-keys
  // Isi VAPID_PUBLIC_KEY dengan public key kamu, lalu simpan private key
  // di backend/Supabase secret untuk kirim push nanti
  const VAPID_PUBLIC_KEY = 'BPdMohfhdsCfr81OTVYNhf2RDlNuOqON2ip2r-ZU3vM47-kPKjPYQ8AVni9-39myVAKoNOGjJP0LtjVo-8q0T7E'; // ← ISI DENGAN VAPID PUBLIC KEY KAMU

  const POLL_INTERVAL = 30000; // 30 detik
  let _pollTimer = null;
  let _lastSeen  = localStorage.getItem('pgsk_notif_last_seen') || '1970-01-01';

  // ── HEADER SUPABASE ─────────────────────────────────────────
  const _h = () => ({
    'Content-Type': 'application/json',
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`
  });

  function _sess() {
    try { return JSON.parse(localStorage.getItem('pgsk_v2_session') || 'null'); } catch { return null; }
  }

  // ── INIT — dipanggil saat app load ──────────────────────────
  async function init() {
    _injectUI();
    await _loadNotifs();
    _startPoll();

    // Coba subscribe push kalau SW sudah ready
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await _subscribePush(reg);
      } catch (e) {
        console.log('[Notif] Push subscribe skip:', e.message);
      }
    }
  }

  // ── INJECT BELL UI ke topbar ─────────────────────────────────
  function _injectUI() {
    if (document.getElementById('notifBell')) return;

    const tbRight = document.querySelector('.tb-right');
    if (!tbRight) return;

    const bell = document.createElement('div');
    bell.id        = 'notifBell';
    bell.className = 'tb-notif';
    bell.title     = 'Notifikasi';
    bell.style.cssText = 'position:relative';
    bell.innerHTML = `
      <i class="fas fa-bell"></i>
      <div class="notif-dot" id="notifDot" style="display:none"></div>
    `;
    bell.onclick = toggleDropdown;

    // Sisipkan sebelum chat button
    const chatBtn = tbRight.querySelector('[onclick*="chat"]');
    tbRight.insertBefore(bell, chatBtn || tbRight.firstChild);

    // Dropdown
    const drop = document.createElement('div');
    drop.id = 'notifDropdown';
    drop.style.cssText = `
      position:fixed; top:56px; right:8px; left:8px; max-width:380px; margin:0 auto;
      background:var(--s1); border:1px solid var(--bd); border-radius:16px;
      z-index:500; display:none; flex-direction:column;
      box-shadow:0 12px 40px rgba(0,0,0,.6);
      max-height:70vh; overflow:hidden;
    `;
    drop.innerHTML = `
      <div style="padding:12px 16px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="font-family:'Syne',sans-serif;font-size:.88rem;font-weight:800"><i class="fas fa-bell" style="color:var(--g);margin-right:6px"></i>Notifikasi</div>
        <button onclick="PagaskaNotif.markAllRead()" style="font-size:.62rem;color:var(--g);background:none;border:none;cursor:pointer;font-family:inherit">Tandai semua dibaca</button>
      </div>
      <div id="notifList" style="overflow-y:auto;scrollbar-width:none;flex:1"></div>
    `;
    document.body.appendChild(drop);

    // Tutup kalau klik di luar
    document.addEventListener('click', e => {
      if (!bell.contains(e.target) && !drop.contains(e.target)) drop.style.display = 'none';
    });
  }

  // ── TOGGLE DROPDOWN ──────────────────────────────────────────
  function toggleDropdown() {
    const drop = document.getElementById('notifDropdown');
    if (!drop) return;
    const isOpen = drop.style.display === 'flex';
    drop.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) {
      markAllRead();
      _loadNotifs();
    }
  }

  // ── LOAD NOTIFS DARI SUPABASE ────────────────────────────────
  async function _loadNotifs() {
    const s = _sess();
    if (!s) return;

    try {
      // Ambil notif untuk semua user ATAU khusus user ini
      const res = await fetch(
        `${SB_URL}/rest/v1/notifications?or=(target_user.eq.all,target_user.eq.${encodeURIComponent(s.nama+'_'+s.generasi)})&order=created_at.desc&limit=30`,
        { headers: _h() }
      );
      // 404 = tabel belum dibuat di Supabase, skip tanpa error
      if (res.status === 404) { _renderEmpty(); return; }
      if (!res.ok) return;
      const rows = await res.json();
      if (!rows?.length) { _renderEmpty(); return; }

      // Cek berapa yang belum dibaca
      const readIds = _getReadIds();
      const unread  = rows.filter(r => !readIds.includes(r.id));

      // Update badge
      const dot = document.getElementById('notifDot');
      if (dot) dot.style.display = unread.length ? 'block' : 'none';

      // Update topbar chat badge (reuse pattern dari topbar)
      _renderNotifs(rows, readIds);

      // Tampilkan in-app toast untuk notif baru sejak terakhir seen
      const newOnes = rows.filter(r => r.created_at > _lastSeen && !readIds.includes(r.id));
      if (newOnes.length) {
        newOnes.slice(0, 2).forEach(n => {
          setTimeout(() => {
            if (typeof toast === 'function') toast(`🔔 ${n.title}: ${n.body}`);
          }, 500);
        });
        _lastSeen = new Date().toISOString();
        localStorage.setItem('pgsk_notif_last_seen', _lastSeen);
      }
    } catch (e) {
      console.log('[Notif] Load error:', e.message);
    }
  }

  // ── RENDER LIST ───────────────────────────────────────────────
  function _renderEmpty() {
    const list = document.getElementById('notifList');
    if (list) list.innerHTML = `<div style="text-align:center;padding:30px 20px;color:var(--mt)">
      <i class="fas fa-bell-slash" style="font-size:1.5rem;opacity:.3;display:block;margin-bottom:8px"></i>
      <div style="font-size:.75rem">Belum ada notifikasi</div>
    </div>`;
  }

  function _renderNotifs(rows, readIds) {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (!rows?.length) { _renderEmpty(); return; }

    list.innerHTML = rows.map(n => {
      const isRead = readIds.includes(n.id);
      const time   = _fmtTime(n.created_at);
      const typeIcon = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', promo: 'fa-gift' }[n.type] || 'fa-bell';
      const typeColor = { info: 'var(--b2)', success: 'var(--g)', warning: 'var(--yw)', promo: 'var(--p2)' }[n.type] || 'var(--g)';
      return `<div style="padding:12px 16px;border-bottom:1px solid var(--bd);display:flex;gap:10px;align-items:flex-start;background:${isRead ? 'transparent' : 'rgba(29,185,84,.04)'}">
        <div style="width:32px;height:32px;border-radius:50%;background:${typeColor}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
          <i class="fas ${typeIcon}" style="color:${typeColor};font-size:.75rem"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.78rem;font-weight:${isRead ? '500' : '700'};margin-bottom:2px">${_esc(n.title)}</div>
          <div style="font-size:.7rem;color:var(--mt);line-height:1.5">${_esc(n.body)}</div>
          <div style="font-size:.6rem;color:var(--mt);margin-top:4px;opacity:.7">${time}</div>
        </div>
        ${!isRead ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--g);flex-shrink:0;margin-top:5px"></div>' : ''}
      </div>`;
    }).join('');
  }

  // ── READ STATE (simpan di localStorage) ──────────────────────
  function _getReadIds() {
    try { return JSON.parse(localStorage.getItem('pgsk_notif_read') || '[]'); } catch { return []; }
  }

  function markAllRead() {
    // Ambil semua id yang terrender lalu mark read
    const list = document.getElementById('notifList');
    if (!list) return;
    // Re-fetch dan mark semua
    _loadNotifsAndMarkRead();
    document.getElementById('notifDot')?.style && (document.getElementById('notifDot').style.display = 'none');
  }

  async function _loadNotifsAndMarkRead() {
    const s = _sess();
    if (!s) return;
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/notifications?or=(target_user.eq.all,target_user.eq.${encodeURIComponent(s.nama+'_'+s.generasi)})&order=created_at.desc&limit=30`,
        { headers: _h() }
      );
      if (res.status === 404 || !res.ok) return;
      const rows = await res.json();
      if (!rows?.length) return;
      const ids = rows.map(r => r.id);
      localStorage.setItem('pgsk_notif_read', JSON.stringify(ids));
      _renderNotifs(rows, ids);
    } catch {}
  }

  // ── PUSH SUBSCRIBE ───────────────────────────────────────────
  // Simpan subscription ke localStorage (bukan Supabase push_subscriptions yang sering 404/409).
  // Push notif tetap berfungsi via polling tabel notifications setiap 30 detik.
  async function _subscribePush(reg) {
    if (!VAPID_PUBLIC_KEY) return;

    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;

      const s = _sess();
      if (!s) return;

      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // Simpan endpoint ke localStorage untuk referensi
      localStorage.setItem('pgsk_push_sub', JSON.stringify({
        endpoint:  sub.endpoint,
        user_key:  `${s.nama}_${s.generasi}`,
        updated:   new Date().toISOString(),
      }));
      console.log('[Notif] Push sub registered (local)');
    } catch (e) {
      console.log('[Notif] Push sub error (non-fatal):', e.message);
    }
  }

  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  // ── POLLING ──────────────────────────────────────────────────
  function _startPoll() {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(_loadNotifs, POLL_INTERVAL);
  }

  // ── UTILS ────────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _fmtTime(ts) {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60)   return 'Baru saja';
      if (diff < 3600) return Math.floor(diff/60) + ' menit lalu';
      if (diff < 86400) return Math.floor(diff/3600) + ' jam lalu';
      return d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
    } catch { return ''; }
  }

  return { init, toggleDropdown, markAllRead };

})();

window.PagaskaNotif = PagaskaNotif;

// Auto-init saat DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PagaskaNotif.init());
} else {
  setTimeout(() => PagaskaNotif.init(), 500);
}
