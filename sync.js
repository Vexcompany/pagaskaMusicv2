// ════════════════════════════════════════════════════════════════
//  sync.js — Pagaska Music Profile Sync (UPDATE #5)
//  Sync liked songs & queue ke Supabase supaya konsisten
//  di semua device untuk user yang sama.
//  Diload setelah notif.js di index.html
// ════════════════════════════════════════════════════════════════

const PagaskaSync = (() => {

  const SYNC_INTERVAL = 45000; // 45 detik
  let _timer = null;
  let _syncing = false;

  // ── SQL yang dibutuhkan di Supabase (jalankan sekali):
  // CREATE TABLE user_profiles (
  //   user_key TEXT PRIMARY KEY,
  //   nama TEXT, generasi TEXT,
  //   liked_songs JSONB DEFAULT '[]',
  //   queue JSONB DEFAULT '[]',
  //   last_track JSONB DEFAULT NULL,
  //   updated_at TIMESTAMPTZ DEFAULT now()
  // );
  // ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
  // CREATE POLICY "service all" ON user_profiles USING (true) WITH CHECK (true);

  const _h = () => ({
    'Content-Type': 'application/json',
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    Prefer: 'return=representation,resolution=merge-duplicates'
  });

  function _sess() {
    try { return JSON.parse(localStorage.getItem('pgsk_v2_session') || 'null'); }
    catch { return null; }
  }

  function _userKey() {
    const s = _sess();
    return s ? `${s.nama}_${s.generasi}` : null;
  }

  // ── ⬆️  PUSH — simpan state ke Supabase ──────────────────────
  async function push() {
    const uk = _userKey();
    if (!uk || _syncing) return;
    _syncing = true;

    try {
      // Ambil state terkini dari LS (variabel global dari index.html)
      const liked = typeof likedArr !== 'undefined' ? likedArr : [];
      const q     = typeof queue     !== 'undefined' ? queue     : [];
      const last  = typeof currentTrack !== 'undefined' ? currentTrack : null;
      const s     = _sess();

      await fetch(`${SB_URL}/rest/v1/user_profiles`, {
        method: 'POST',
        headers: _h(),
        body: JSON.stringify({
          user_key:    uk,
          nama:        s?.nama        || '',
          generasi:    String(s?.generasi || ''),
          liked_songs: liked,
          queue:       q.slice(0, 50), // max 50 item queue
          last_track:  last,
          updated_at:  new Date().toISOString()
        })
      });
    } catch (e) {
      console.log('[Sync] Push error:', e.message);
    }

    _syncing = false;
  }

  // ── ⬇️  PULL — ambil state dari Supabase ─────────────────────
  async function pull() {
    const uk = _userKey();
    if (!uk) return;

    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/user_profiles?user_key=eq.${encodeURIComponent(uk)}&select=*`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (!rows?.length) return;

      const remote = rows[0];

      // ── Merge liked songs ──────────────────────────────────────
      // Gabungkan local + remote, dedup by id, local wins kalau konflik
      const localLiked  = typeof likedArr !== 'undefined' ? likedArr : [];
      const remoteLiked = remote.liked_songs || [];

      const mergedMap = new Map();
      // Remote dulu sebagai base
      remoteLiked.forEach(t => { if (t?.id) mergedMap.set(t.id, t); });
      // Local override (lebih fresh)
      localLiked.forEach(t => { if (t?.id) mergedMap.set(t.id, t); });

      const merged = [...mergedMap.values()];

      // Update global dan localStorage
      if (typeof likedArr !== 'undefined') {
        likedArr.length = 0;
        merged.forEach(t => likedArr.push(t));
      }
      if (typeof LS !== 'undefined') LS.sl(merged);

      // ── Merge queue ────────────────────────────────────────────
      // Kalau local queue kosong, pakai remote queue
      const localQ  = typeof queue !== 'undefined' ? queue : [];
      const remoteQ = remote.queue || [];

      if (!localQ.length && remoteQ.length) {
        if (typeof queue !== 'undefined') {
          queue.length = 0;
          remoteQ.forEach(t => queue.push(t));
        }
        if (typeof LS !== 'undefined') LS.sq(remoteQ);
        // Re-render queue kalau NP terbuka
        if (typeof renderNPQueue === 'function') renderNPQueue();
      }

      // ── Re-render liked di profil kalau sedang terbuka ────────
      if (typeof renderLiked === 'function') renderLiked();
      if (typeof updLikeButtons === 'function' && typeof currentTrack !== 'undefined' && currentTrack) {
        updLikeButtons();
      }

      // Update badge total di stats
      const statEl = document.querySelector('[data-stat="liked"]');
      if (statEl) statEl.textContent = merged.length;

      console.log(`[Sync] Pulled: ${merged.length} liked, ${remoteQ.length} queue items`);
    } catch (e) {
      console.log('[Sync] Pull error:', e.message);
    }
  }

  // ── 🔄 AUTO SYNC ──────────────────────────────────────────────
  function startAutoSync() {
    if (_timer) clearInterval(_timer);

    // Pull saat pertama kali (restore state dari device lain)
    setTimeout(pull, 1500);

    // Push setiap 45 detik
    _timer = setInterval(() => { push(); }, SYNC_INTERVAL);

    // Push saat tab ditutup/di-background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) push();
    });
    window.addEventListener('beforeunload', () => push());
  }

  // ── HOOK ke toggleLikeCurrent — push setelah like/unlike ─────
  function hookLike() {
    const orig = window.toggleLikeCurrent;
    if (typeof orig !== 'function') return;
    window.toggleLikeCurrent = async function (...args) {
      await orig.apply(this, args);
      setTimeout(push, 300);
    };
  }

  // ── HOOK ke addToQueue — push setelah queue berubah ──────────
  function hookQueue() {
    const orig = window.addToQueue;
    if (typeof orig !== 'function') return;
    window.addToQueue = function (...args) {
      const result = orig.apply(this, args);
      setTimeout(push, 300);
      return result;
    };
  }

  // ── INIT ──────────────────────────────────────────────────────
  function init() {
    const uk = _userKey();
    if (!uk || uk === 'guest_undefined') {
      console.log('[Sync] No session, skip sync');
      return;
    }

    // Hook functions setelah DOM siap
    setTimeout(() => {
      hookLike();
      hookQueue();
      startAutoSync();
      console.log('[Sync] Profile sync active for:', uk);
    }, 1000);
  }

  return { init, push, pull };

})();

window.PagaskaSync = PagaskaSync;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PagaskaSync.init());
} else {
  setTimeout(() => PagaskaSync.init(), 800);
}
