let PROXY = localStorage.getItem('r34_proxy_url') || 'https://frosty-forest-2c7f.markus4free.workers.dev/?url='; // IMPORTANT: Keep the /?url= at the end

// =============================================================================
// --- Multi-API Source Configuration ---
// Distributes requests across multiple booru APIs via round-robin rotation.
// Each source tracks its own health; 429'd sources are temporarily skipped.
// =============================================================================
const API_SOURCES = {
  rule34: {
    key: 'rule34',
    name: 'Rule34',
    enabled: true,
    baseUrl: 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index',
    auth: '&api_key=2116381cf8a58c1de26faacfac84d760099e863311a98c1d060028461c82ab831d579f74e72983e6af34adbb661039c6a610d8f422be912fee3cb90b39d38f1a&user_id=6064624',
    tagApiBase: 'https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index',
    autocompleteUrl: 'https://api.rule34.xxx/autocomplete.php?q=',
    format: 'rule34',       // Flat JSON array, same field names as Rule34
    maxTags: null,           // No tag limit
    healthy: true,
    lastError: 0,
    cooldownMs: 10000,       // 10s cooldown on 429
  },
  gelbooru: {
    key: 'gelbooru',
    name: 'Gelbooru',
    enabled: true,
    baseUrl: 'https://gelbooru.com/index.php?page=dapi&s=post&q=index',
    auth: '&api_key=ed1dcd5a900cf19731f4f4a53c1fe133b58f2d355fb2aec7b313b5b3d8a6095125efe0830c9d775962f85cdbe875d2784c454cb4905866c35585df93da5232d2&user_id=2052759',
    tagApiBase: 'https://gelbooru.com/index.php?page=dapi&s=tag&q=index',
    autocompleteUrl: 'https://gelbooru.com/index.php?page=autocomplete2&term=',
    format: 'gelbooru',      // Wraps posts in { "@attributes":{}, "post":[] }
    maxTags: null,
    healthy: true,
    lastError: 0,
    cooldownMs: 10000,
  }
};

// Backward compatibility — algorithm.js and other code reference the `API` constant directly
const API = API_SOURCES.rule34.baseUrl + API_SOURCES.rule34.auth;
const AUTOCOMPLETE_API = API_SOURCES.rule34.autocompleteUrl;

// --- Round-Robin API Rotator ---
let apiRotationIndex = 0;

/**
 * Returns the next healthy, enabled API source.
 * Skips sources that are cooling down from a 429, and sources whose tag limit
 * would be exceeded by the current query.
 * @param {number} tagCount - Number of tags in the current query
 * @returns {object} The chosen API_SOURCES entry
 */
function getNextApiSource(tagCount = 0) {
  const enabledSources = Object.values(API_SOURCES).filter(s => s.enabled);
  const healthySources = enabledSources.filter(s =>
    s.healthy && (!s.maxTags || tagCount <= s.maxTags)
  );

  if (healthySources.length === 0) {
    // All sources are unhealthy or incompatible — reset health and fall back to Rule34
    console.warn('[API ROTATION] All sources exhausted, resetting health flags.');
    enabledSources.forEach(s => { s.healthy = true; });
    return API_SOURCES.rule34;
  }

  const source = healthySources[apiRotationIndex % healthySources.length];
  apiRotationIndex++;
  return source;
}

/**
 * Mark an API source as temporarily unhealthy (e.g. after a 429).
 * It auto-recovers after its configured cooldown period.
 */
function markApiUnhealthy(sourceKey) {
  const src = API_SOURCES[sourceKey];
  if (!src) return;
  src.healthy = false;
  src.lastError = Date.now();
  console.warn(`[API ROTATION] ${src.name} marked unhealthy. Cooling down for ${src.cooldownMs / 1000}s...`);
  if (typeof triggerToastNotification === 'function') {
    triggerToastNotification(`${src.name} API rate-limited. Rotating to other sources...`);
  }
  setTimeout(() => {
    src.healthy = true;
    console.log(`[API ROTATION] ${src.name} recovered, re-entering rotation.`);
  }, src.cooldownMs);
}

// --- URL Builder per source format ---
/**
 * Builds the correct search URL for a given API source.
 * Danbooru uses a completely different URL structure than Rule34/Gelbooru.
 */
function buildSearchUrl(source, tags, limit, page) {
  if (source.format === 'danbooru') {
    // Danbooru: /posts.json?tags=X&limit=N&page=N (1-indexed pages)
    const cleanTags = tags.replace(/\+/g, ' ').trim();
    let url = `${source.baseUrl}?tags=${encodeURIComponent(cleanTags)}&limit=${limit}&page=${page + 1}`;
    if (source.auth) url += source.auth;
    return url;
  }
  // Rule34 / Gelbooru: /index.php?page=dapi&s=post&q=index&tags=X&limit=N&pid=N&json=1
  let url = `${source.baseUrl}${source.auth}&tags=${encodeURIComponent(tags).replace(/%2B/g, '+')}&limit=${limit}&pid=${page}&json=1`;
  return url;
}

// --- Response Normalizer ---
// Maps different API response formats to the standard post object shape
// that the rest of the app (grid, lightbox, vault, algorithm) expects:
//   { id, score, file_url, preview_url, sample_url, tags, width, height, rating, source }

/**
 * Normalizes a single post from any source into the standard format.
 */
function normalizePost(post, sourceFormat) {
  if (sourceFormat === 'danbooru') {
    return {
      id: post.id,
      score: post.score || 0,
      file_url: post.file_url || '',
      preview_url: post.preview_file_url || '',
      sample_url: post.large_file_url || post.file_url || '',
      tags: post.tag_string || '',
      width: post.image_width || 0,
      height: post.image_height || 0,
      rating: post.rating || '',
      source: post.source || '',
      _api_source: 'danbooru'
    };
  }
  // Rule34 and Gelbooru already use the expected field names
  post._api_source = sourceFormat;
  return post;
}

/**
 * Extracts the posts array from a raw API response, handling format differences.
 * - Rule34 returns a flat array: [post, post, ...]
 * - Gelbooru wraps it: { "@attributes":{}, "post":[...] }
 * - Danbooru returns a flat array: [post, post, ...]
 */
function extractPostsArray(rawData, sourceFormat) {
  if (!rawData) return [];

  // Gelbooru wraps posts in { "post": [...] }
  if (sourceFormat === 'gelbooru') {
    if (rawData.post && Array.isArray(rawData.post)) return rawData.post;
    if (Array.isArray(rawData)) return rawData;
    return [];
  }

  // Rule34 and Danbooru return flat arrays
  if (Array.isArray(rawData)) return rawData;
  // Single-object fallback
  if (typeof rawData === 'object' && rawData !== null && rawData.id) return [rawData];
  return [];
}

// --- Cloudinary Video Optimization ---
// 1. Create a Cloudinary account.
// 2. Add an Auto-upload mapping in Settings -> Upload:
//    Folder: api-videos
//    URL prefix: https://wwebm.rule34.xxx/images/
// 3. Fill in your Cloud Name and Folder Name below:
const CLOUDINARY_CLOUD_NAME = ''; // Leave empty to disable
const CLOUDINARY_FOLDER = '';

function getOptimizedVideoUrl(rawUrl) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_FOLDER || !rawUrl) return rawUrl;

  // Extract the path after /images/ since Rule34 hosts videos across different subdomains
  const match = rawUrl.match(/https?:\/\/[^\/]+\/images\/(.+)/);
  if (match) {
    const path = match[1];
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/q_auto,f_auto,w_720/${CLOUDINARY_FOLDER}/${path}`;
  }
  return rawUrl;
}

document.addEventListener('DOMContentLoaded', () => {
  const proxyInput = document.getElementById('proxy-input');
  const proxySaveBtn = document.getElementById('proxy-save-btn');
  if (proxyInput) {
    proxyInput.value = localStorage.getItem('r34_proxy_url') || '';
  }
  if (proxySaveBtn) {
    proxySaveBtn.addEventListener('click', () => {
      let val = proxyInput.value.trim();
      if (val && !val.endsWith('url=')) {
        val += (val.includes('?') ? '&url=' : '?url=');
      }
      if (val) {
        if (typeof window.safeLocalStorageSet === 'function') window.safeLocalStorageSet('r34_proxy_url', val);
        else localStorage.setItem('r34_proxy_url', val);
        PROXY = val;
      } else {
        localStorage.removeItem('r34_proxy_url');
        PROXY = 'https://frosty-forest-2c7f.markus4free.workers.dev/?url=';
      }
      if (typeof triggerToastNotification === 'function') {
        triggerToastNotification("Proxy settings saved. Reloading feed...");
      }
      if (typeof doSearch === 'function') doSearch();
    });
  }
});
const PER_PAGE = 40;

let latestPostId = null;
let idCalibrated = false;

// --- Rate Limiting & Throttler ---
let highPriorityQueue = [];
let lowPriorityQueue = [];
let isFetchingQueue = false;
let currentFetchDelay = 500; // Safer 2 requests per second baseline
let queueTimeoutId = null;
let isCoolingDown = false;

function processFetchQueue() {
  if (highPriorityQueue.length === 0 && lowPriorityQueue.length === 0) {
    isFetchingQueue = false;
    return;
  }
  isFetchingQueue = true;

  const isHighPriority = highPriorityQueue.length > 0;
  const req = isHighPriority ? highPriorityQueue.shift() : lowPriorityQueue.shift();

  // Launch fetch without blocking the queue
  fetch(req.url, req.options)
    .then(async res => {
      if (res.status === 429 || res.status === 403) {
        console.warn(`[API BLOCK] ${res.status} error. Rotating away...`);

        // Detect which API source was hit and mark it unhealthy
        const hitSourceKey = Object.keys(API_SOURCES).find(k => req.url.includes(API_SOURCES[k].baseUrl.split('/')[2]));
        if (hitSourceKey) {
          markApiUnhealthy(hitSourceKey);
        }

        // Show user-facing notification
        if (!isCoolingDown) {
          isCoolingDown = true;
          if (typeof triggerToastNotification === 'function') {
            triggerToastNotification("API overloaded, rotating to another source...");
          }
          setTimeout(() => { isCoolingDown = false; }, 3000);
        }

        // IMPORTANT: Do NOT requeue the request! That causes an infinite loop.
        // Instead, resolve with a fake failed response so the app can move on.
        req.resolve({
          ok: false,
          status: res.status,
          text: async () => "",
          json: async () => []
        });

        clearTimeout(queueTimeoutId);
        queueTimeoutId = setTimeout(processFetchQueue, currentFetchDelay);
        return;
      }


      // Save successful responses to cache
      if (res.ok && req.useCache && (!req.options.method || req.options.method.toUpperCase() === 'GET')) {
        const resClone = res.clone();
        try {
          const data = await resClone.json();
          // Keep transient responses fresh and bounded; the cache is only an optimization.
          const cacheEntry = JSON.stringify({ cachedAt: Date.now(), data });
          if (typeof window.safeSessionStorageSet === 'function') {
            window.safeSessionStorageSet(`r34_cache_${req.url}`, cacheEntry);
          } else {
            try { sessionStorage.setItem(`r34_cache_${req.url}`, cacheEntry); } catch (_) { /* Cache is optional. */ }
          }
        } catch (jsonErr) { }
      }

      req.resolve(res);
    })
    .catch(err => req.reject(err));

  // Schedule the next pull from the queue (unless a 429 overrides it)
  clearTimeout(queueTimeoutId);
  queueTimeoutId = setTimeout(processFetchQueue, currentFetchDelay);
}

function throttledFetch(url, options = {}, isBackground = false, useCache = true) {
  return new Promise((resolve, reject) => {
    // --- Session Caching for Testing/Development ---
    // This prevents hitting the API limit when you refresh the page constantly
    if (useCache && (!options.method || options.method.toUpperCase() === 'GET')) {
      const cacheKey = `r34_cache_${url}`;
      let cached = null;
      try { cached = sessionStorage.getItem(cacheKey); } catch (_) { /* Storage can be disabled. */ }
      if (cached) {
        try {
          const parsedCache = JSON.parse(cached);
          const isEnvelope = parsedCache && typeof parsedCache === 'object' && 'cachedAt' in parsedCache && 'data' in parsedCache;
          const isFresh = !isEnvelope || Date.now() - parsedCache.cachedAt < 6 * 60 * 60 * 1000;
          if (!isFresh) {
            try { sessionStorage.removeItem(cacheKey); } catch (_) { /* Cache is optional. */ }
          } else {
            const parsedData = isEnvelope ? parsedCache.data : parsedCache;
            const serializedData = JSON.stringify(parsedData);
            const fakeResponse = {
              ok: true,
              status: 200,
              json: () => Promise.resolve(parsedData),
              text: () => Promise.resolve(serializedData),
              clone: () => ({
                ok: true,
                status: 200,
                json: () => Promise.resolve(parsedData),
                text: () => Promise.resolve(serializedData)
              })
            };
            return resolve(fakeResponse); // Instantly resolve from a fresh cache entry.
          }
        } catch (e) {
          try { sessionStorage.removeItem(cacheKey); } catch (_) { /* Cache is optional. */ }
        }
      }
    }

    const req = { url, options, resolve, reject, useCache };
    if (isBackground) {
      lowPriorityQueue.push(req);
    } else {
      highPriorityQueue.push(req);
    }
    if (!isFetchingQueue) {
      processFetchQueue();
    }
  });
}

window.clearBackgroundFetchQueue = function () {
  lowPriorityQueue = [];
};

// --- Debounce Utility ---
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function getLatestId() {
  if (latestPostId !== null) return latestPostId;
  try {
    const url = `${API}&limit=1&json=1`;
    const res = await throttledFetch(PROXY + encodeURIComponent(url));
    const data = await res.json();
    if (data && data[0]) {
      latestPostId = parseInt(data[0].id);
      idCalibrated = true;
    }
  } catch (e) {
    latestPostId = 11200000;
  }
  return latestPostId;
}

const POSTS_PER_DAY = 6000;
async function getIdRange(days) {
  if (days === 'all') return null;
  const latest = await getLatestId();
  const minId = Math.max(0, latest - (days * POSTS_PER_DAY));
  return { min: minId, max: latest };
}

let autocompleteAbortController = null;

async function queryAutocomplete(query, callback = null) {
  if (autocompleteAbortController) {
    autocompleteAbortController.abort();
  }
  autocompleteAbortController = new AbortController();

  const targetUrl = `${AUTOCOMPLETE_API}${encodeURIComponent(query)}`;
  try {
    const res = await fetch(PROXY + encodeURIComponent(targetUrl), {
      signal: autocompleteAbortController.signal
    });
    const data = await res.json();
    if (callback) {
      callback(data);
    } else if (typeof renderSuggestions === 'function') {
      renderSuggestions(data);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Autocomplete fetch loop fail:', err);
    }
  }
}
