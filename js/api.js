let PROXY = localStorage.getItem('r34_proxy_url') || 'https://frosty-forest-2c7f.markus4free.workers.dev/?url='; // IMPORTANT: Keep the /?url= at the end
const API = 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&api_key=2116381cf8a58c1de26faacfac84d760099e863311a98c1d060028461c82ab831d579f74e72983e6af34adbb661039c6a610d8f422be912fee3cb90b39d38f1a&user_id=6064624';

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
const AUTOCOMPLETE_API = 'https://api.rule34.xxx/autocomplete.php?q=';
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
      if (res.status === 429) {
        console.warn(`[RATE LIMIT] 429 Too Many Requests. Backing off for 3 seconds...`);
        
        // Show user-facing notification
        if (!isCoolingDown) {
          isCoolingDown = true;
          if (typeof triggerToastNotification === 'function') {
            triggerToastNotification("API overloaded, waiting till it cooled down...");
          }
          setTimeout(() => { isCoolingDown = false; }, 3000);
        }

        // Re-insert at the front of the queue it came from
        if (isHighPriority) highPriorityQueue.unshift(req);
        else lowPriorityQueue.unshift(req);

        clearTimeout(queueTimeoutId);
        queueTimeoutId = setTimeout(processFetchQueue, 3000); // 3 second backoff
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
        } catch(jsonErr) {}
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
