// ════════════════════════════════════════════════════════════════
//  api-downloader.js — Multi-Source Apple Music Downloader
//  Supports: Nexray & Theresav
// ════════════════════════════════════════════════════════════════

/**
 * Downloader configuration untuk berbagai service
 *
 * Theresav API key TIDAK di-hardcode di sini.
 * Key diambil dari /api/config (Vercel env var THERESAV_KEY) saat pertama kali dibutuhkan.
 */

let _theresavKey = null; // Cache key setelah fetch

async function _getTheresavKey() {
  if (_theresavKey) return _theresavKey;
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
    const cfg = await res.json();
    _theresavKey = cfg.theresavKey || null;
  } catch (e) {
    console.warn('[Downloader] Gagal ambil Theresav key:', e.message);
  }
  return _theresavKey;
}

const DOWNLOADERS = {
  nexray: {
    name: 'Nexray',
    icon: '🔵',
    endpoint: 'https://api.nexray.eu.cc/download',
    params: {
      url: 'url',        // Apple Music URL
      quality: 'quality' // optional: highest, high, medium, low
    },
    parse: (response) => {
      if (response.status && response.result?.download?.url) {
        return {
          success: true,
          url: response.result.download.url,
          title: response.result.metadata?.title,
          artist: response.result.metadata?.artist,
          album: response.result.metadata?.album,
          thumbnail: response.result.metadata?.thumbnail,
          duration: response.result.metadata?.duration,
          quality: response.result.metadata?.quality,
          format: response.result.download?.format
        };
      }
      return { success: false, error: response.message || 'Nexray Error' };
    }
  },

  theresav: {
    name: 'Theresav',
    icon: '🟢',
    endpoint: 'https://api.theresav.biz.id/download/applemusic',
    // apikey di-resolve secara async via _getTheresavKey(), bukan hardcoded
    params: {
      url: 'url',
      apikey: 'apikey'
    },
    parse: (response) => {
      if (response.status && response.result?.download?.url) {
        return {
          success: true,
          url: response.result.download.url,
          title: response.result.metadata?.title,
          artist: response.result.metadata?.artist,
          album: response.result.metadata?.album,
          thumbnail: response.result.metadata?.thumbnail,
          duration: response.result.metadata?.duration,
          quality: response.result.metadata?.quality,
          format: response.result.download?.format
        };
      }
      return { success: false, error: response.message || 'Theresav Error' };
    }
  }
};

/**
 * Download Apple Music track dari source pilihan
 * @param {string} appleMusicUrl - Apple Music track URL
 * @param {string} source - 'nexray' atau 'theresav'
 * @param {object} options - Additional options
 * @returns {Promise<object>} Download result
 */
async function downloadFromAppleMusic(appleMusicUrl, source = 'nexray', options = {}) {
  if (!DOWNLOADERS[source]) {
    throw new Error(`Unknown downloader: ${source}`);
  }

  if (!appleMusicUrl) {
    throw new Error('Apple Music URL is required');
  }

  const config = DOWNLOADERS[source];
  
  try {
    // Build request
    const params = new URLSearchParams();
    params.append(config.params.url, appleMusicUrl);

    // Ambil Theresav key dari /api/config (env var), bukan hardcoded
    if (source === 'theresav' && config.params.apikey) {
      const apikey = await _getTheresavKey();
      if (!apikey) throw new Error('Theresav API key tidak tersedia. Periksa env var THERESAV_KEY di Vercel.');
      params.append(config.params.apikey, apikey);
    }

    // Add optional quality parameter jika ada
    if (options.quality && config.params.quality) {
      params.append(config.params.quality, options.quality);
    }

    const url = `${config.endpoint}?${params.toString()}`;
    
    console.log(`[${source.toUpperCase()}] Requesting:`, url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Pagaska-Music/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const result = config.parse(data);

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      ...result,
      source: source,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`[${source.toUpperCase()}] Error:`, error);
    throw error;
  }
}

/**
 * Show downloader selection modal
 * @param {string} appleMusicUrl - Apple Music URL
 * @param {object} trackMetadata - Pre-filled metadata (title, artist, thumbnail)
 */
function showDownloaderSelector(appleMusicUrl, trackMetadata = {}) {
  const modal = document.createElement('div');
  modal.id = 'downloaderModal';
  modal.className = 'modal-bg open';
  modal.style.zIndex = '5001';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-ico info" style="font-size:1.8rem">📥</div>
      <h3>Pilih Downloader</h3>
      <div class="modal-body">
        Pilih service untuk download lagu dari Apple Music
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
        ${Object.entries(DOWNLOADERS).map(([key, config]) => `
          <button class="downloader-btn" onclick="startDownload('${appleMusicUrl}', '${key}')">
            <span>${config.icon} ${config.name}</span>
            <i class="fas fa-arrow-right" style="font-size:.7rem;opacity:.6"></i>
          </button>
        `).join('')}
      </div>
      <button class="modal-cancel" onclick="closeDownloaderModal()" style="width:100%;margin-top:8px">
        Batal
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  // Store untuk diakses di startDownload
  window._currentDownloadData = { appleMusicUrl, trackMetadata };
}

/**
 * Close downloader modal
 */
function closeDownloaderModal() {
  const modal = document.getElementById('downloaderModal');
  if (modal) modal.remove();
}

/**
 * Start download dengan source pilihan
 * @param {string} appleMusicUrl - Apple Music URL
 * @param {string} source - 'nexray' atau 'theresav'
 */
async function startDownload(appleMusicUrl, source) {
  closeDownloaderModal();
  toast(`⏳ Mengunduh dari ${DOWNLOADERS[source].name}...`);

  try {
    const result = await downloadFromAppleMusic(appleMusicUrl, source);
    
    console.log('Download result:', result);
    
    // Show success toast
    toast(`✅ ${DOWNLOADERS[source].name} siap: ${result.quality || 'MP3'}`);

    // Option 1: Direct download link
    if (result.url) {
      downloadFile(result.url, result.title || 'song', result.format || 'mp3');
    }

    // Option 2: Open downloader selector modal untuk user
    if (typeof window.onDownloadReady === 'function') {
      window.onDownloadReady(result);
    }

  } catch (error) {
    console.error('Download error:', error);
    toast(`❌ Error: ${error.message}`);
  }
}

/**
 * Helper: trigger file download
 */
function downloadFile(url, filename, format = 'mp3') {
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.${format}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Expose to window
 */
window.ApiDownloader = {
  downloadFromAppleMusic,
  showDownloaderSelector,
  closeDownloaderModal,
  startDownload,
  downloadFile,
  DOWNLOADERS
};
