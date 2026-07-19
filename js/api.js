let PROXY = localStorage.getItem('r34_proxy_url') || 'https://frosty-forest-2c7f.markus4free.workers.dev/?url='; // IMPORTANT: Keep the /?url= at the end
const API = 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&api_key=2116381cf8a58c1de26faacfac84d760099e863311a98c1d060028461c82ab831d579f74e72983e6af34adbb661039c6a610d8f422be912fee3cb90b39d38f1a&user_id=6064624';

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
        localStorage.setItem('r34_proxy_url', val);
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
let fetchQueue = [];
let isFetchingQueue = false;
const FETCH_DELAY_MS = 300; // Limit to ~3 requests per second with API key

function processFetchQueue() {
  if (fetchQueue.length === 0) {
    isFetchingQueue = false;
    return;
  }
  isFetchingQueue = true;

  const { url, options, resolve, reject } = fetchQueue.shift();

  fetch(url, options)
    .then(res => resolve(res))
    .catch(err => reject(err))
    .finally(() => {
      setTimeout(processFetchQueue, FETCH_DELAY_MS);
    });
}

function throttledFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    fetchQueue.push({ url, options, resolve, reject });
    if (!isFetchingQueue) {
      processFetchQueue();
    }
  });
}

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

async function queryAutocomplete(query, callback = null) {
  const targetUrl = `${AUTOCOMPLETE_API}${encodeURIComponent(query)}`;
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(targetUrl));
    const data = await res.json();
    if (callback) {
      callback(data);
    } else if (typeof renderSuggestions === 'function') {
      renderSuggestions(data);
    }
  } catch (err) {
    console.error('Autocomplete fetch loop fail:', err);
  }
}
