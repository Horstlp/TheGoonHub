/* Shared safeguards for transient caches, persistent storage, and network changes. */
(function () {
  const CACHE_PREFIX = 'r34_cache_';
  const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
  const CACHE_LIMIT = 60;

  function isQuotaError(error) {
    return error && (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  function notify(message) {
    if (typeof window.triggerToastNotification === 'function') {
      window.triggerToastNotification(message);
    }
  }

  function getCacheTimestamp(rawValue) {
    try {
      const parsed = JSON.parse(rawValue);
      return parsed && typeof parsed.cachedAt === 'number' ? parsed.cachedAt : 0;
    } catch (_) {
      return 0;
    }
  }

  window.cleanupTransientCache = function () {
    try {
      const now = Date.now();
      const cacheEntries = [];

      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (!key || !key.startsWith(CACHE_PREFIX)) continue;

        const rawValue = sessionStorage.getItem(key);
        const cachedAt = getCacheTimestamp(rawValue);
        if (!cachedAt || now - cachedAt > CACHE_MAX_AGE) {
          sessionStorage.removeItem(key);
        } else {
          cacheEntries.push({ key, cachedAt });
        }
      }

      cacheEntries
        .sort((a, b) => a.cachedAt - b.cachedAt)
        .slice(0, Math.max(0, cacheEntries.length - CACHE_LIMIT))
        .forEach(({ key }) => sessionStorage.removeItem(key));
    } catch (_) {
      // Private browsing and disabled storage can block cache access. Network requests still work.
    }
  };

  window.safeLocalStorageSet = function (key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (isQuotaError(error)) {
        window.cleanupTransientCache();
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (_) {
          notify('Storage is full. Recent temporary data was cleared, but this change could not be saved.');
          return false;
        }
      }
      notify('This browser is blocking local storage, so this change will only last for this session.');
      return false;
    }
  };

  window.safeSessionStorageSet = function (key, value) {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (isQuotaError(error)) {
        window.cleanupTransientCache();
        try {
          sessionStorage.setItem(key, value);
          return true;
        } catch (_) {
          notify('Temporary cache is full. Browsing can continue without caching this response.');
        }
      }
      return false;
    }
  };

  const mediaObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const image = entry.target;
        const source = image.dataset.src;
        if (source) image.src = source;
        image.removeAttribute('data-src');
        mediaObserver.unobserve(image);
      });
    }, { rootMargin: '650px 0px' })
    : null;

  window.deferMediaLoad = function (image, source) {
    if (!image || !source) return;
    image.dataset.src = source;
    if (mediaObserver) {
      mediaObserver.observe(image);
    } else {
      image.src = source;
      image.removeAttribute('data-src');
    }
  };

  // localForage backs the user vault. Avoid unhandled quota failures while preserving existing data.
  if (window.localforage && !window.localforage.__r34StorageGuard) {
    const originalSetItem = window.localforage.setItem.bind(window.localforage);
    window.localforage.setItem = async function (...args) {
      try {
        return await originalSetItem(...args);
      } catch (error) {
        if (isQuotaError(error)) {
          window.cleanupTransientCache();
          try {
            return await originalSetItem(...args);
          } catch (_) {
            notify('Your vault is out of space. Export it or free browser storage before saving more.');
            return null;
          }
        }
        notify('The vault could not be saved right now. Your existing saved items are unchanged.');
        return null;
      }
    };
    window.localforage.__r34StorageGuard = true;
  }

  function renderNetworkState() {
    const isOffline = !navigator.onLine;
    document.documentElement.classList.toggle('is-offline', isOffline);

    let banner = document.getElementById('network-status-banner');
    if (!banner && isOffline) {
      banner = document.createElement('div');
      banner.id = 'network-status-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      document.body.prepend(banner);
    }

    if (banner) {
      banner.textContent = isOffline
        ? 'You’re offline. Saved items remain available; new results will resume when you reconnect.'
        : 'Back online. New results are available again.';
      banner.classList.toggle('show', isOffline);
      if (!isOffline) window.setTimeout(() => banner.remove(), 2500);
    }
  }

  window.addEventListener('offline', () => {
    renderNetworkState();
    notify('You’re offline. Check your connection and try again when it returns.');
  });
  window.addEventListener('online', () => {
    renderNetworkState();
    notify('Back online.');
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    const message = reason && (reason.message || String(reason));
    if (message && /failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
      event.preventDefault();
      notify(navigator.onLine ? 'That request could not be completed. Please try again.' : 'You’re offline. Please reconnect and try again.');
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    window.cleanupTransientCache();
    renderNetworkState();
  });
}());
