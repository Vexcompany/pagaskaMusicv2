/**
 * ════════════════════════════════════════════════════════════════
 *  play-tracker.js
 *  Fix: Play count sync, Activity feed real-time, Queue mobile UI
 * ════════════════════════════════════════════════════════════════
 */

// ════════════════════════════════════════════════════════════════
//  1. PLAY COUNT TRACKER - Real-time sync
// ════════════════════════════════════════════════════════════════

let playTrackerInterval = null;
let localPlayCounts = {}; // Local cache untuk batch update
let pendingPlaySync = false;
let syncedPlayCounts = {}; // Cache count terakhir yang sudah di-sync ke DB

/**
 * Initialize play count tracker
 * Jalan setiap kali user start playing
 */
function initPlayCountTracker() {
  if (playTrackerInterval) clearInterval(playTrackerInterval);
  
  // Sync setiap 10 detik (lebih sering untuk accuracy)
  playTrackerInterval = setInterval(async () => {
    if (!currentTrack || !audio || audio.paused) return;
    
    await syncPlayCountToDatabase();
  }, 10000); // 10 detik
}

/**
 * Stop play tracker
 */
function stopPlayCountTracker() {
  if (playTrackerInterval) {
    clearInterval(playTrackerInterval);
    playTrackerInterval = null;
  }
  // Final sync sebelum stop
  if (pendingPlaySync) {
    syncPlayCountToDatabase();
  }
}

/**
 * Track setiap play event dan sync
 */
async function trackPlayEvent(track) {
  if (!track || !track.id) return;
  
  try {
    // 1. Insert ke play_history
    await sb.post('play_history', {
      user_key: USER_KEY,
      track_id: track.id,
      played_at: new Date().toISOString(),
      duration_played: Math.round(audio.duration || 0),
      source: track.source || 'database'
    });
    
    // 2. Increment local cache (untuk batch update)
    localPlayCounts[track.id] = (localPlayCounts[track.id] || 0) + 1;
    pendingPlaySync = true;
    
    // 3. Update user's personal play count
    await updateUserPlayCount(track.id);
    
    // 4. Reload activity feed real-time
    loadLiveActivityOptimized();
    
    console.log(`[PlayTracker] Recorded: ${track.title} (total local: ${localPlayCounts[track.id]})`);
    
  } catch (e) {
    console.warn('[PlayTracker] Error:', e.message);
  }
}

/**
 * Sync play counts ke database
 */
async function syncPlayCountToDatabase() {
  if (!Object.keys(localPlayCounts).length) return;

  // Snapshot + clear SEBELUM await — cegah race condition kalau ada
  // play event masuk selama kita nunggu response DB
  const snapshot = { ...localPlayCounts };
  localPlayCounts = {};
  pendingPlaySync = false;

  try {
    for (const trackId of Object.keys(snapshot)) {
      const localDelta = snapshot[trackId];

      // Get current count dari DB
      const trackRow = await sb.get('tracks', `id=eq.${encodeURIComponent(trackId)}`);
      if (!trackRow.length) continue;

      const currentCount = trackRow[0].play_count || 0;
      const newCount = currentCount + localDelta;

      // PATCH ke DB
      await fetch(
        `${SB_URL}/rest/v1/tracks?id=eq.${encodeURIComponent(trackId)}`,
        {
          method: 'PATCH',
          headers: { ...HDR, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ play_count: newCount })
        }
      );

      // Simpan hasil sync supaya updatePlayCountDisplay bisa pakai nilai terbaru
      syncedPlayCounts[trackId] = newCount;

      console.log(`[PlayTracker] Synced: ${trackId} → ${newCount} plays`);
    }

    // Refresh UI setelah semua track selesai
    updatePlayCountDisplay();

  } catch (e) {
    // Kembalikan delta ke localPlayCounts supaya tidak hilang saat error
    for (const [id, delta] of Object.entries(snapshot)) {
      localPlayCounts[id] = (localPlayCounts[id] || 0) + delta;
    }
    pendingPlaySync = true;
    console.warn('[PlayTracker] Sync error:', e.message);
  }
}

/**
 * Update user's personal play count (untuk "Kamu X×")
 */
async function updateUserPlayCount(trackId) {
  try {
    // Check if user sudah punya record
    const existing = await sb.get(
      'user_play_counts',
      `user_key=eq.${encodeURIComponent(USER_KEY)}&track_id=eq.${encodeURIComponent(trackId)}`
    );
    
    if (existing.length) {
      // Update existing
      const newCount = (existing[0].count || 0) + 1;
      await fetch(
        `${SB_URL}/rest/v1/user_play_counts?user_key=eq.${encodeURIComponent(USER_KEY)}&track_id=eq.${encodeURIComponent(trackId)}`,
        {
          method: 'PATCH',
          headers: { ...HDR, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ count: newCount })
        }
      );
      myPlayCounts[trackId] = newCount;
    } else {
      // Insert baru
      await sb.post('user_play_counts', {
        user_key: USER_KEY,
        track_id: trackId,
        count: 1
      });
      myPlayCounts[trackId] = 1;
    }
  } catch (e) {
    console.warn('[UserPlayCount] Error:', e.message);
  }
}

/**
 * Update UI display dengan real-time count
 */
function updatePlayCountDisplay() {
  if (!currentTrack) return;
  
  // Update hero card
  const playsEL = document.getElementById('hPlaysN');
  if (playsEL) {
    // Prioritas: nilai DB terbaru (syncedPlayCounts) → pending local → fallback currentTrack
    const total = syncedPlayCounts[currentTrack.id]
      ?? (localPlayCounts[currentTrack.id]
        ? (syncedPlayCounts[currentTrack.id] || currentTrack.play_count || 0) + localPlayCounts[currentTrack.id]
        : currentTrack.play_count || 0);
    playsEL.textContent = total;
  }

  // Update chart list
  const chartItems = document.querySelectorAll('.chart-item');
  chartItems.forEach(item => {
    const cntEl = item.querySelector('.chart-cnt');
    if (cntEl) {
      const trackId = item.getAttribute('data-track-id');
      if (trackId === currentTrack.id) {
        const synced = syncedPlayCounts[trackId] ?? currentTrack.play_count ?? 0;
        const pending = localPlayCounts[trackId] || 0;
        cntEl.textContent = synced + pending;
      }
    }
  });
}

// ════════════════════════════════��═══════════════════════════════
//  2. LIVE ACTIVITY - Real-time update
// ════════════════════════════════════════════════════════════════

let activityRefreshInterval = null;
const ACTIVITY_CACHE = {};

/**
 * Start live activity auto-refresh
 */
function startLiveActivityRefresh() {
  if (activityRefreshInterval) clearInterval(activityRefreshInterval);
  
  // Refresh setiap 5 detik
  activityRefreshInterval = setInterval(() => {
    loadLiveActivity();
  }, 5000);
}

/**
 * Stop live activity refresh
 */
function stopLiveActivityRefresh() {
  if (activityRefreshInterval) {
    clearInterval(activityRefreshInterval);
    activityRefreshInterval = null;
  }
}

/**
 * Enhanced loadLiveActivity dengan caching & optimization
 */
async function loadLiveActivityOptimized() {
  try {
    const rows = await sb.get('play_history', 'order=played_at.desc&limit=20');
    
    // Cache untuk avoid duplicate render
    const cacheKey = JSON.stringify(rows.slice(0, 5).map(r => r.id));
    if (ACTIVITY_CACHE.lastKey === cacheKey) return; // No change
    ACTIVITY_CACHE.lastKey = cacheKey;
    
    activityData = rows;
    renderActivityEnhanced();
    document.getElementById('activitySec').style.display = rows.length ? 'block' : 'none';
    
  } catch (e) {
    console.warn('[LiveActivity]', e.message);
  }
}

/**
 * Enhanced activity render dengan animations
 */
function renderActivityEnhanced() {
  const el = document.getElementById('activityFeed');
  if (!activityData.length) { el.innerHTML = ''; return; }
  
  const html = activityData.slice(0, 8).map((r, idx) => {
    const t = histArr.find(h => h.id === r.track_id) || queue.find(q => q.id === r.track_id);
    const name = r.user_key?.split('_').slice(0, -1).join(' ') || r.user_key || '?';
    const ini = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const timeAgo = getTimeAgo(r.played_at || r.created_at);
    const isMe = r.user_key === USER_KEY;
    
    return `
      <div class="activity-item" style="animation: slideIn 0.3s ease forwards; animation-delay: ${idx * 50}ms;">
        <div class="act-av">${ini}</div>
        <div class="act-info">
          <div class="act-name">${name}${isMe ? ' (Kamu)' : ''}</div>
          <div class="act-track">${t ? `🎵 ${t.title}` : 'Memutar lagu'}</div>
        </div>
        <div class="act-time">${timeAgo}</div>
        ${isMe ? '<div class="act-dot"></div>' : ''}
      </div>
    `;
  }).join('');
  
  el.innerHTML = html;
}

// Animation style
if (!document.getElementById('playTrackerStyles')) {
  const style = document.createElement('style');
  style.id = 'playTrackerStyles';
  style.textContent = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-10px); }
      to { opacity: 1; transform: translateX(0); }
    }
    
    .activity-item { animation: slideIn 0.3s ease; }
  `;
  document.head.appendChild(style);
}

// ════════════════════════════════════════════════════════════════
//  3. MOBILE-FRIENDLY QUEUE REORDER UI
// ════════════════════════════════════════════════════════════════

/**
 * Enhanced queue render dengan mobile-friendly reorder
 */
function renderQueueEnhanced(queueArray) {
  const el = document.getElementById('panQ');
  if (!queueArray || !queueArray.length) {
    el.innerHTML = '<div class="empty-ti"><i class="fas fa-music"></i>Queue kosong</div>';
    return;
  }
  
  el.innerHTML = queueArray.map((t, i) => `
    <div class="ti-mobile" data-index="${i}">
      <!-- Left: drag handle + number -->
      <div class="ti-mobile-left">
        <div class="ti-reorder-mobile" draggable="true" ondragstart="startReorderDrag(event, ${i})">
          <i class="fas fa-grip-vertical"></i>
        </div>
        <div class="ti-n">${i + 1}</div>
      </div>
      
      <!-- Center: thumbnail + info -->
      <div class="ti-mobile-center" onclick='playTrackObj(${esc(rowToTrack(t, "db"))})'>
        <div class="ti-th">
          <img src="${t.thumbnail || PH}" onerror="this.src='${PH}'" alt="${t.title}">
        </div>
        <div class="ti-inf">
          <div class="ti-t">${t.title}</div>
          <div class="ti-a">${t.artist}</div>
        </div>
      </div>
      
      <!-- Right: actions -->
      <div class="ti-mobile-right">
        <button class="ti-btn-up" onclick="reorderQueueUp(${i})" title="Naik">
          <i class="fas fa-chevron-up"></i>
        </button>
        <button class="ti-btn-down" onclick="reorderQueueDown(${i})" title="Turun">
          <i class="fas fa-chevron-down"></i>
        </button>
        <button class="ti-del" onclick="removeFromQueue(${i})" title="Hapus">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
  
  // Update badge
  document.getElementById('qBadge').textContent = queueArray.length;
}

/**
 * Reorder queue - UP
 */
function reorderQueueUp(index) {
  if (index <= 0) return;
  [queue[index - 1], queue[index]] = [queue[index], queue[index - 1]];
  renderQueueEnhanced(queue);
  toast('✅ Urutan diubah');
}

/**
 * Reorder queue - DOWN
 */
function reorderQueueDown(index) {
  if (index >= queue.length - 1) return;
  [queue[index], queue[index + 1]] = [queue[index + 1], queue[index]];
  renderQueueEnhanced(queue);
  toast('✅ Urutan diubah');
}

/**
 * Remove from queue
 */
function removeFromQueue(index) {
  queue.splice(index, 1);
  renderQueueEnhanced(queue);
  toast('✅ Dihapus dari queue');
}

/**
 * Drag and drop reorder
 */
let draggedIndex = null;

function startReorderDrag(e, index) {
  draggedIndex = index;
  e.dataTransfer.effectAllowed = 'move';
  e.target.closest('.ti-mobile').style.opacity = '0.5';
}

function allowDrop(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function dropReorder(e, targetIndex) {
  e.preventDefault();
  if (draggedIndex === null || draggedIndex === targetIndex) return;
  
  const temp = queue[draggedIndex];
  if (draggedIndex < targetIndex) {
    queue.splice(targetIndex, 0, temp);
    queue.splice(draggedIndex, 1);
  } else {
    queue.splice(draggedIndex, 1);
    queue.splice(targetIndex, 0, temp);
  }
  
  draggedIndex = null;
  renderQueueEnhanced(queue);
  toast('✅ Urutan diubah');
}

/**
 * Add CSS untuk mobile queue
 */
function addMobileQueueStyles() {
  if (document.getElementById('mobileQueueStyles')) return;
  
  const style = document.createElement('style');
  style.id = 'mobileQueueStyles';
  style.textContent = `
    /* Mobile-friendly queue item */
    .ti-mobile {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border-radius: 10px;
      background: var(--s1);
      border: 1px solid var(--bd);
      margin-bottom: 8px;
      transition: all 0.2s;
      cursor: grab;
      user-select: none;
    }
    
    .ti-mobile:active { cursor: grabbing; }
    .ti-mobile:hover { background: var(--s2); border-color: var(--dyn1); }
    
    .ti-mobile-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    
    .ti-reorder-mobile {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--mt);
      cursor: grab;
      padding: 4px;
      border-radius: 6px;
      transition: all 0.2s;
    }
    
    .ti-reorder-mobile:hover {
      background: var(--s3);
      color: var(--dyn1);
    }
    
    .ti-reorder-mobile:active { cursor: grabbing; }
    
    .ti-n {
      width: 20px;
      text-align: center;
      font-size: 0.7rem;
      color: var(--mt);
      font-weight: 600;
    }
    
    .ti-mobile-center {
      flex: 1;
      min-width: 0;
      display: flex;
      gap: 10px;
      align-items: center;
      cursor: pointer;
    }
    
    .ti-th {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
    }
    
    .ti-th img { width: 100%; height: 100%; object-fit: cover; }
    
    .ti-inf {
      flex: 1;
      min-width: 0;
    }
    
    .ti-t {
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    
    .ti-a {
      font-size: 0.65rem;
      color: var(--mt);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .ti-mobile-right {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    
    .ti-btn-up, .ti-btn-down, .ti-del {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: none;
      background: var(--s3);
      color: var(--mt);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    
    .ti-btn-up:hover, .ti-btn-down:hover {
      background: rgba(29, 185, 84, 0.2);
      color: var(--dyn1);
    }
    
    .ti-del:hover {
      background: rgba(255, 77, 109, 0.2);
      color: var(--rd);
    }
    
    .ti-btn-up:active, .ti-btn-down:active, .ti-del:active {
      transform: scale(0.95);
    }
    
    /* Mobile responsiveness */
    @media (max-width: 600px) {
      .ti-mobile {
        padding: 8px;
        gap: 8px;
      }
      
      .ti-mobile-right {
        gap: 4px;
      }
      
      .ti-btn-up, .ti-btn-down, .ti-del {
        width: 28px;
        height: 28px;
        font-size: 0.65rem;
      }
      
      .ti-th {
        width: 36px;
        height: 36px;
      }
      
      .ti-n {
        font-size: 0.65rem;
      }
      
      .ti-t {
        font-size: 0.75rem;
      }
      
      .ti-a {
        font-size: 0.6rem;
      }
    }
    
    /* Tablet & up */
    @media (min-width: 768px) {
      .ti-mobile-right {
        gap: 8px;
      }
      
      .ti-btn-up, .ti-btn-down, .ti-del {
        width: 36px;
        height: 36px;
      }
    }
  `;
  document.head.appendChild(style);
}

// Initialize on page load
addMobileQueueStyles();

// ════════════════════════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════════════════════════

window.PlayTracker = {
  initPlayCountTracker,
  stopPlayCountTracker,
  trackPlayEvent,
  syncPlayCountToDatabase,
  updateUserPlayCount,
  startLiveActivityRefresh,
  stopLiveActivityRefresh,
  loadLiveActivityOptimized,
  renderActivityEnhanced,
  renderQueueEnhanced,
  reorderQueueUp,
  reorderQueueDown,
  removeFromQueue
};
