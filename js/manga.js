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

// --- MANGA GRID LOGIC (MangaDex) ---
const mangaGridSearchInput = document.getElementById('manga-grid-search-input');
const mangaGridSearchBtn = document.getElementById('manga-grid-search-btn');
const mangaGridStatus = document.getElementById('manga-grid-status');
const mangaGridContainer = document.getElementById('manga-grid');
const mangaScrollSentinel = document.getElementById('manga-scroll-sentinel');

let currentMangaGridTags = '';
let currentMangaGridPage = 1;
let isMangaGridLoading = false;
let hasMoreMangaGrid = true;
let cachedMangaPosts = [];

const MD_API_BASE = 'https://api.mangadex.org';
const MD_CLIENT_ID = 'personal-client-512490bf-72f9-49c3-9793-5f361e909453-75974a36';

const mdFetchOptions = {
  headers: {
    'Client-Id': MD_CLIENT_ID
  }
};

function getMdTitle(manga) {
  if(!manga || !manga.attributes || !manga.attributes.title) return 'Unknown';
  return manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Unknown';
}

function getMdCoverUrl(manga) {
  if(!manga || !manga.relationships) return '';
  const coverRel = manga.relationships.find(r => r.type === 'cover_art');
  if (coverRel && coverRel.attributes && coverRel.attributes.fileName) {
    return `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.256.jpg`;
  }
  return '';
}

// Convert MangaDex manga object into our generic post format for vault/likes
function convertToPostFormat(manga) {
  return {
    id: manga.id,
    preview_url: getMdCoverUrl(manga),
    file_url: getMdCoverUrl(manga),
    score: 0,
    tags: manga.attributes.tags.map(t => t.attributes.name.en).join(' '),
    mangaObject: manga // store original
  };
}

async function searchMangaGrid(titleQuery, page, append = false) {
  if (isMangaGridLoading) return;
  isMangaGridLoading = true;
  mangaGridSearchBtn.disabled = true;

  if (!append) {
    mangaGridContainer.innerHTML = '';
    cachedMangaPosts = [];
    mangaGridStatus.style.display = 'block';
    mangaGridStatus.innerHTML = '<div class="spinner"></div>Fetching from MangaDex...';
    hasMoreMangaGrid = true;
  } else {
    mangaGridStatus.style.display = 'block';
    mangaGridStatus.innerHTML = '<div class="spinner"></div>Loading more manga...';
  }

  const limit = 15;
  const offset = (page - 1) * limit;
  let url = `${MD_API_BASE}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`;
  if (titleQuery.trim()) {
    url += `&title=${encodeURIComponent(titleQuery.trim())}`;
  }
  
  try {
    const res = await fetch(PROXY + encodeURIComponent(url), mdFetchOptions);
    const data = await res.json();

    if (!data || !data.data || data.data.length === 0) {
      mangaGridStatus.innerHTML = cachedMangaPosts.length === 0 ? '<span class="icon">😶</span>No matching manga found.' : '';
      hasMoreMangaGrid = false;
    } else {
      const formattedPosts = data.data.map(convertToPostFormat);
      cachedMangaPosts = append ? cachedMangaPosts.concat(formattedPosts) : formattedPosts;
      mangaGridStatus.style.display = 'none';
      hasMoreMangaGrid = data.data.length === limit;
      
      injectMangaCardsIntoGrid(formattedPosts);
    }
  } catch (err) {
    console.error('MangaDex fetch error:', err);
    mangaGridStatus.innerHTML = `<span class="icon">⚠️</span>API down or rate limited.`;
    hasMoreMangaGrid = false;
  }
  
  mangaGridSearchBtn.disabled = false;
  isMangaGridLoading = false;
}

function injectMangaCardsIntoGrid(data) {
  data.forEach((post, index) => {
    const previewUrl = post.preview_url;
    if (!previewUrl) return;
    
    const card = document.createElement('div');
    card.className = 'card';
    const img = document.createElement('img');
    img.src = previewUrl; 
    img.loading = 'lazy';
    img.onload = () => { if(typeof resizeGridItem === 'function') resizeGridItem(card); };
    img.onerror = () => { card.style.display = 'none'; };
    card.appendChild(img);

    const actionBadges = document.createElement('div');
    actionBadges.className = 'action-badges';

    const likeBtn = document.createElement('button');
    likeBtn.className = 'grid-action-btn btn-like';
    const isLiked = typeof likedPosts !== 'undefined' && likedPosts.includes(String(post.id));
    if(isLiked) likeBtn.classList.add('liked');
    likeBtn.textContent = isLiked ? '♥ Liked' : '♡ Like';
    likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(typeof togglePostLikeStatus === 'function') togglePostLikeStatus(post.id);
      const newlyLiked = likedPosts.includes(String(post.id));
      likeBtn.classList.toggle('liked', newlyLiked);
      likeBtn.textContent = newlyLiked ? '♥ Liked' : '♡ Like';
    });

    const saveBtn = document.createElement('button');
    saveBtn.className = 'grid-action-btn btn-save';
    const isSaved = vaultedPosts.some(p => String(p.id) === String(post.id));
    saveBtn.textContent = isSaved ? 'Saved' : 'Save';
    if(isSaved) saveBtn.style.backgroundColor = '#8b5cf6';
    
    saveBtn.addEventListener('click', (e) => {
      if(typeof openFolderMenu === 'function') openFolderMenu(e, post, saveBtn);
    });

    actionBadges.appendChild(likeBtn);
    actionBadges.appendChild(saveBtn);
    card.appendChild(actionBadges);

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.innerHTML = `<span>${getMdTitle(post.mangaObject).substring(0, 30)}...</span>`;
    card.appendChild(footer);
    
    card.addEventListener('click', () => {
       mangaIdInput.value = post.id;
       mangaFetchBtn.click();
       document.getElementById('manga-status').scrollIntoView({behavior: 'smooth'});
    });
    
    if(typeof masonryObserver !== 'undefined') masonryObserver.observe(card);
    mangaGridContainer.appendChild(card);
  });
}

function doMangaSearch() {
  const userQuery = mangaGridSearchInput.value.trim();
  currentMangaGridTags = userQuery;
  currentMangaGridPage = 1;
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

searchMangaGrid('', 1, false);


// --- MANGADEX ID READER LOGIC ---
const mangaLikeBtn = document.getElementById('manga-like-btn');
const mangaSaveBtn = document.getElementById('manga-save-btn');

mangaFetchBtn.addEventListener('click', async () => {
  const mangaId = mangaIdInput.value.trim();
  if (!mangaId) return;

  mangaStatus.style.display = 'block';
  mangaStatus.innerHTML = '<span class="icon">🔍</span> Fetching metadata from MangaDex...';
  mangaContent.style.display = 'none';
  currentMangaData = null;

  try {
    const resUrl = `${MD_API_BASE}/manga/${mangaId}?includes[]=cover_art`;
    const res = await fetch(PROXY + encodeURIComponent(resUrl), mdFetchOptions);
    const resData = await res.json();
    const data = resData.data;

    if (data && data.id) {
      mangaStatus.style.display = 'none';
      currentMangaData = convertToPostFormat(data);
      
      // Also fetch chapter feed for reading
      const feedUrl = `${MD_API_BASE}/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=100`;
      const feedRes = await fetch(PROXY + encodeURIComponent(feedUrl), mdFetchOptions);
      const feedData = await feedRes.json();
      currentMangaData.chapters = feedData.data || [];
      
      mangaCover.src = getMdCoverUrl(data);
      mangaTitle.textContent = getMdTitle(data);
      
      mangaTags.innerHTML = '';
      if (data.attributes && data.attributes.tags) {
        data.attributes.tags.forEach(tagObj => {
          const t = document.createElement('span');
          t.className = 'lb-stream-tag';
          t.textContent = tagObj.attributes.name.en;
          mangaTags.appendChild(t);
        });
      }

      const isLiked = typeof likedPosts !== 'undefined' && likedPosts.includes(String(data.id));
      mangaLikeBtn.textContent = isLiked ? '♥ Liked' : '♡ Like';
      mangaLikeBtn.style.color = isLiked ? '#ff3366' : 'var(--text)';
      mangaLikeBtn.style.borderColor = isLiked ? '#ff3366' : 'var(--border)';

      const isSaved = vaultedPosts.some(p => String(p.id) === String(data.id));
      mangaSaveBtn.textContent = isSaved ? '💖 Saved' : '🤍 Save';
      mangaSaveBtn.style.color = isSaved ? '#8b5cf6' : 'var(--text)';
      mangaSaveBtn.style.borderColor = isSaved ? '#8b5cf6' : 'var(--border)';

      mangaContent.style.display = 'block';
    } else {
      mangaStatus.innerHTML = `<span class="icon">❌</span> Error: Not found on MangaDex`;
    }
  } catch (err) {
    console.error(err);
    mangaStatus.innerHTML = '<span class="icon">⚠️</span> Network error reaching MangaDex API';
  }
});

mangaLikeBtn.addEventListener('click', () => {
  if (!currentMangaData) return;
  if(typeof togglePostLikeStatus === 'function') togglePostLikeStatus(currentMangaData.id);
  const isLiked = likedPosts.includes(String(currentMangaData.id));
  mangaLikeBtn.textContent = isLiked ? '♥ Liked' : '♡ Like';
  mangaLikeBtn.style.color = isLiked ? '#ff3366' : 'var(--text)';
  mangaLikeBtn.style.borderColor = isLiked ? '#ff3366' : 'var(--border)';
});

mangaSaveBtn.addEventListener('click', (e) => {
  if (!currentMangaData) return;
  if(typeof openFolderMenu === 'function') openFolderMenu(e, currentMangaData, mangaSaveBtn);
});

mangaReadBtn.addEventListener('click', async () => {
  if (!currentMangaData || !currentMangaData.chapters || currentMangaData.chapters.length === 0) {
      alert("No English chapters found for this manga.");
      return;
  }

  mangaPagesContainer.innerHTML = '<div class="spinner"></div><p style="color:white">Loading first chapter pages...</p>';
  mangaReader.style.display = 'block';
  document.body.style.overflow = 'hidden';

  try {
      const firstChap = currentMangaData.chapters[0];
      const pageUrl = `${MD_API_BASE}/at-home/server/${firstChap.id}`;
      const pageRes = await fetch(PROXY + encodeURIComponent(pageUrl), mdFetchOptions);
      const pageData = await pageRes.json();
      
      mangaPagesContainer.innerHTML = '';
      const baseUrl = pageData.baseUrl;
      const hash = pageData.chapter.hash;
      const pages = pageData.chapter.data;
      
      pages.forEach(p => {
        const url = `${baseUrl}/data/${hash}/${p}`;
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.marginBottom = '10px';
        img.loading = 'lazy';
        mangaPagesContainer.appendChild(img);
      });
  } catch(e) {
      mangaPagesContainer.innerHTML = '<p style="color:red">Failed to load chapter pages.</p>';
  }
});

mangaReaderClose.addEventListener('click', () => {
  mangaReader.style.display = 'none';
  mangaPagesContainer.innerHTML = '';
  document.body.style.overflow = '';
});