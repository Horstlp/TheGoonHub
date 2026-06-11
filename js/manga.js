const mangaIdInput = document.getElementById('manga-id-input');
const mangaFetchBtn = document.getElementById('manga-fetch-btn');
const mangaStatus = document.getElementById('manga-status');
const mangaContent = document.getElementById('manga-content');
const mangaCover = document.getElementById('manga-cover');
const mangaTitle = document.getElementById('manga-title');
const mangaTags = document.getElementById('manga-tags');
const mangaReadBtn = document.getElementById('manga-read-btn');
const mangaReader = document.getElementById('manga-reader');
const mangaReaderClose = document.getElementById('manga-reader-close');
const mangaPagesContainer = document.getElementById('manga-pages-container');

// --- MANGA GRID LOGIC ---
const mangaGridSearchInput = document.getElementById('manga-grid-search-input');
const mangaGridSearchBtn = document.getElementById('manga-grid-search-btn');
const mangaGridStatus = document.getElementById('manga-grid-status');
const mangaGridContainer = document.getElementById('manga-grid');
const mangaScrollSentinel = document.getElementById('manga-scroll-sentinel');

let currentMangaGridTags = 'comic';
let currentMangaGridPage = 0;
let isMangaGridLoading = false;
let hasMoreMangaGrid = true;
// We will use the app.js cachedPosts and injectPostCardsIntoGrid to leverage existing Lightbox and masonry features
// But we need to ensure we don't mix them up, so we'll store them in a separate array and temporarily swap if clicked.
let cachedMangaPosts = [];

async function searchMangaGrid(tags, page, append = false) {
  if (isMangaGridLoading) return;
  isMangaGridLoading = true;
  mangaGridSearchBtn.disabled = true;

  if (!append) {
    mangaGridContainer.innerHTML = '';
    cachedMangaPosts = [];
    mangaGridStatus.style.display = 'block';
    mangaGridStatus.innerHTML = '<div class="spinner"></div>Crunching requested parameters...';
    hasMoreMangaGrid = true;
  } else {
    mangaGridStatus.style.display = 'block';
    mangaGridStatus.innerHTML = '<div class="spinner"></div>Loading more posts...';
  }

  // Force comic tag for the manga grid
  const tagsParam = `comic+${tags}`.trim();
  const url = `${API}&tags=${encodeURIComponent(tagsParam).replace(/%2B/g,'+')}&limit=${PER_PAGE}&pid=${page}&json=1`;
  
  try {
    const res = await fetch(PROXY + encodeURIComponent(url));
    const responseText = await res.text();
    let data = [];
    if (res.ok && responseText.trim()) {
      data = JSON.parse(responseText);
    }

    if (!data || data.length === 0) {
      mangaGridStatus.innerHTML = cachedMangaPosts.length === 0 ? '<span class="icon">😶</span>No matching vectors found.' : '';
      hasMoreMangaGrid = false;
    } else {
      cachedMangaPosts = append ? cachedMangaPosts.concat(data) : data;
      mangaGridStatus.style.display = 'none';
      hasMoreMangaGrid = data.length === PER_PAGE;
      
      // We borrow the `injectPostCardsIntoGrid` from app.js to build the masonry grid
      // But we need to ensure Lightbox indexing works. 
      // Workaround: when a manga card is clicked, we sync `cachedPosts` in app.js
      injectMangaCardsIntoGrid(data);
    }
  } catch (err) {
    mangaGridStatus.innerHTML = `<span class="icon">⚠️</span>Network pipeline disruption.`;
    hasMoreMangaGrid = false;
  }
  
  mangaGridSearchBtn.disabled = false;
  isMangaGridLoading = false;
}

function injectMangaCardsIntoGrid(data) {
  data.forEach((post, index) => {
    const fileUrl = post.file_url || post.sample_url || post.preview_url;
    const previewUrl = post.preview_url || post.sample_url || post.file_url;
    if (!fileUrl) return;
    const ext = fileUrl.split('.').pop().toLowerCase();
    const isVideo = ['mp4','webm'].includes(ext);
    const card = document.createElement('div');
    card.className = 'card';
    const img = document.createElement('img');
    img.src = previewUrl; 
    img.loading = 'lazy';
    img.onload = () => { if(typeof resizeGridItem === 'function') resizeGridItem(card); };
    img.onerror = () => { card.style.display = 'none'; };
    card.appendChild(img);

    // Save Badge
    const saveBadge = document.createElement('div');
    saveBadge.className = 'save-badge';
    const isSaved = vaultedPosts.some(p => String(p.id) === String(post.id));
    saveBadge.textContent = isSaved ? 'Saved' : 'Save';
    if(isSaved) saveBadge.style.backgroundColor = '#8b5cf6';
    
    saveBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if(typeof togglePostFavoriteStatus === 'function') togglePostFavoriteStatus(post);
      const newlySaved = vaultedPosts.some(p => String(p.id) === String(post.id));
      saveBadge.textContent = newlySaved ? 'Saved' : 'Save';
      saveBadge.style.backgroundColor = newlySaved ? '#8b5cf6' : '#ff5e97';
    });
    card.appendChild(saveBadge);

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.innerHTML = `<span class="score">▲ ${post.score ?? 0}</span><span>${ext.toUpperCase()}</span>`;
    card.appendChild(footer);
    
    // Lightbox Hook
    card.addEventListener('click', () => {
      // Temporarily swap the main cachedPosts so Lightbox knows about these
      window.cachedPosts = cachedMangaPosts;
      // Calculate true index across the entire loaded manga set
      const trueIndex = window.cachedPosts.findIndex(p => p.id === post.id);
      if(typeof openLightbox === 'function' && trueIndex !== -1) openLightbox(trueIndex);
    });
    
    if(typeof masonryObserver !== 'undefined') masonryObserver.observe(card);
    mangaGridContainer.appendChild(card);
  });
}

function doMangaSearch() {
  const userTags = mangaGridSearchInput.value.trim().replace(/\s+/g, '+');
  currentMangaGridTags = userTags;
  currentMangaGridPage = 0;
  searchMangaGrid(currentMangaGridTags, currentMangaGridPage, false);
}

mangaGridSearchBtn.addEventListener('click', doMangaSearch);
mangaGridSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doMangaSearch();
});

const mangaScrollObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !isMangaGridLoading && hasMoreMangaGrid) {
    currentMangaGridPage++;
    searchMangaGrid(currentMangaGridTags, currentMangaGridPage, true);
  }
}, { rootMargin: '400px' });
mangaScrollObserver.observe(mangaScrollSentinel);

// Trigger initial manga grid load
searchMangaGrid('', 0, false);


// --- DOUJIN API LOGIC ---
let currentMangaData = null;
const MANGA_API_BASE = 'https://doujin-api.vercel.app';

mangaFetchBtn.addEventListener('click', async () => {
  const mangaId = mangaIdInput.value.trim();
  if (!mangaId) return;

  mangaStatus.style.display = 'block';
  mangaStatus.innerHTML = '<span class="icon">🔍</span> Fetching metadata...';
  mangaContent.style.display = 'none';
  currentMangaData = null;

  try {
    const res = await fetch(`${PROXY}${encodeURIComponent(`${MANGA_API_BASE}/manga_id=${mangaId}`)}`);
    const data = await res.json();

    if (data && !data.Error && data.title) {
      mangaStatus.style.display = 'none';
      currentMangaData = data;
      
      mangaCover.src = data.cover_image;
      mangaTitle.textContent = data.title;
      
      mangaTags.innerHTML = '';
      if (data.tags) {
        data.tags.forEach(tag => {
          const t = document.createElement('span');
          t.className = 'lb-stream-tag';
          t.textContent = tag;
          mangaTags.appendChild(t);
        });
      }

      mangaContent.style.display = 'block';
    } else {
      mangaStatus.innerHTML = `<span class="icon">❌</span> Error: ${data.Error || 'Not found'}`;
    }
  } catch (err) {
    console.error(err);
    mangaStatus.innerHTML = '<span class="icon">⚠️</span> Network error or API down.';
  }
});

mangaReadBtn.addEventListener('click', () => {
  if (!currentMangaData || !currentMangaData.page_urls) return;

  mangaPagesContainer.innerHTML = '';
  currentMangaData.page_urls.forEach((url, idx) => {
    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.marginBottom = '10px';
    img.loading = 'lazy';
    mangaPagesContainer.appendChild(img);
  });

  mangaReader.style.display = 'block';
  document.body.style.overflow = 'hidden'; // prevent bg scroll
});

mangaReaderClose.addEventListener('click', () => {
  mangaReader.style.display = 'none';
  mangaPagesContainer.innerHTML = '';
  document.body.style.overflow = '';
});
