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

let mdTagsMap = new Map();

async function initMdTags() {
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(`${MD_API_BASE}/manga/tag`), mdFetchOptions);
    const data = await res.json();
    if(data && data.data) {
      data.data.forEach(tag => {
        const name = tag.attributes.name.en.toLowerCase();
        mdTagsMap.set(name, tag.id);
      });
    }
  } catch (e) {
    console.error("Failed to load MangaDex tags", e);
  }
}
initMdTags();

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
  let url = `${MD_API_BASE}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`;
  
  // Custom Tag Parsing Engine
  let parsedTitle = titleQuery.trim();
  const tagRegex = /tag:([a-zA-Z0-9_-]+)/gi;
  let match;
  let includedTags = [];
  
  const tagAliases = {
    'yuri': "girls' love",
    'yaoi': "boys' love",
    'gender_bender': 'genderswap'
  };

  while ((match = tagRegex.exec(titleQuery)) !== null) {
    let tagName = match[1].toLowerCase().replace(/_/g, ' ');
    if (tagAliases[tagName]) tagName = tagAliases[tagName];
    
    for (const [key, uuid] of mdTagsMap.entries()) {
      if (key === tagName || key.includes(tagName)) { 
         if (!includedTags.includes(uuid)) includedTags.push(uuid);
         break;
      }
    }
    parsedTitle = parsedTitle.replace(match[0], '');
  }
  
  parsedTitle = parsedTitle.trim();
  if (parsedTitle) {
    url += `&title=${encodeURIComponent(parsedTitle)}`;
  }
  
  if (includedTags.length > 0) {
    includedTags.forEach(id => {
      url += `&includedTags[]=${id}`;
    });
  }
  
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(url), mdFetchOptions);
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

const handleMangaScroll = debounce((entries) => {
  if (entries[0].isIntersecting && !isMangaGridLoading && hasMoreMangaGrid) {
    currentMangaGridPage++;
    searchMangaGrid(currentMangaGridTags, currentMangaGridPage, true);
  }
}, 250);
const mangaScrollObserver = new IntersectionObserver(handleMangaScroll, { rootMargin: '400px' });
mangaScrollObserver.observe(mangaScrollSentinel);

searchMangaGrid('', 1, false);


// --- MANGADEX ID READER LOGIC ---
const mangaLikeBtn = document.getElementById('manga-like-btn');
const mangaSaveBtn = document.getElementById('manga-save-btn');
const mangaLangSelect = document.getElementById('manga-lang-select');
const mangaChapterList = document.getElementById('manga-chapter-list');

const mangaCache = new Map();

// Load preferred language
const savedLang = localStorage.getItem('r34_manga_lang') || 'en';
if(mangaLangSelect) mangaLangSelect.value = savedLang;

if(mangaLangSelect) {
  mangaLangSelect.addEventListener('change', () => {
    localStorage.setItem('r34_manga_lang', mangaLangSelect.value);
    if (currentMangaData) {
      fetchAndRenderChapters(currentMangaData.id);
    }
  });
}

async function fetchAndRenderChapters(mangaId) {
  mangaChapterList.innerHTML = '<div class="spinner"></div><span style="color:var(--muted); font-size: 0.9rem;">Loading chapters...</span>';
  const lang = mangaLangSelect.value;
  const feedUrl = `${MD_API_BASE}/manga/${mangaId}/feed?translatedLanguage[]=${lang}&order[volume]=desc&order[chapter]=desc&limit=500`;
  
  try {
    const feedRes = await throttledFetch(PROXY + encodeURIComponent(feedUrl), mdFetchOptions);
    const feedData = await feedRes.json();
    currentMangaData.chapters = feedData.data || [];
    
    mangaChapterList.innerHTML = '';
    if (currentMangaData.chapters.length === 0) {
      mangaChapterList.innerHTML = `<span style="color:var(--muted); font-size: 0.9rem;">No chapters found for selected language.</span>`;
      return;
    }

    const progressObj = (await localforage.getItem('r34_manga_progress')) || {};
    const lastReadChapId = progressObj[mangaId];
    
    currentMangaData.chapters.forEach(chap => {
      const vol = chap.attributes.volume || '-';
      const chNum = chap.attributes.chapter || '?';
      const title = chap.attributes.title ? ` - ${chap.attributes.title}` : '';
      const isLastRead = chap.id === lastReadChapId;
      
      const btn = document.createElement('button');
      btn.style.cssText = `background: var(--bg); color: var(--text); border: 1px solid ${isLastRead ? 'var(--accent-purple)' : 'var(--border)'}; padding: 12px; border-radius: 6px; text-align: left; cursor: pointer; transition: background 0.2s; position: relative;`;
      
      let html = `<strong>Vol ${vol} Ch ${chNum}</strong><span style="color:var(--muted)">${title}</span>`;
      if (isLastRead) {
        html += `<span style="float:right; color: var(--accent-purple); font-size: 0.75rem; border: 1px solid var(--accent-purple); padding: 2px 6px; border-radius: 4px; font-weight: bold;">Resume</span>`;
      }
      btn.innerHTML = html;
      
      btn.onmouseover = () => btn.style.background = 'var(--surface)';
      btn.onmouseout = () => btn.style.background = 'var(--bg)';
      
      btn.onclick = () => loadMangaChapter(chap.id);
      
      mangaChapterList.appendChild(btn);
    });
  } catch (e) {
    mangaChapterList.innerHTML = `<span style="color:#f43f5e; font-size: 0.9rem;">Failed to load chapter feed.</span>`;
  }
}

mangaFetchBtn.addEventListener('click', async () => {
  const mangaId = mangaIdInput.value.trim();
  if (!mangaId) return;

  mangaStatus.style.display = 'block';
  mangaStatus.innerHTML = '<span class="icon">🔍</span> Fetching metadata...';
  mangaContent.style.display = 'none';
  currentMangaData = null;

  try {
    let data;
    if (mangaCache.has(mangaId)) {
      data = mangaCache.get(mangaId);
    } else {
      const resUrl = `${MD_API_BASE}/manga/${mangaId}?includes[]=cover_art`;
      const res = await throttledFetch(PROXY + encodeURIComponent(resUrl), mdFetchOptions);
      const resData = await res.json();
      data = resData.data;
      if (data && data.id) mangaCache.set(mangaId, data);
    }

    if (data && data.id) {
      mangaStatus.style.display = 'none';
      currentMangaData = convertToPostFormat(data);
      
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
      
      fetchAndRenderChapters(data.id);
      
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
  if(typeof openFolderMenu === 'function') {
    openFolderMenu(e, currentMangaData, mangaSaveBtn, (isSavedNow) => {
       mangaSaveBtn.textContent = isSavedNow ? '💖 Saved' : '🤍 Save';
       mangaSaveBtn.style.color = isSavedNow ? '#8b5cf6' : 'var(--text)';
       mangaSaveBtn.style.borderColor = isSavedNow ? '#8b5cf6' : 'var(--border)';
    });
  }
});

async function loadMangaChapter(chapterId) {
  mangaPagesContainer.innerHTML = '<div class="spinner"></div><p style="color:white">Loading chapter pages...</p>';
  mangaReader.style.display = 'block';
  document.body.style.overflow = 'hidden';

  try {
      // Save progress tracker
      if (currentMangaData && currentMangaData.id) {
          const progressObj = (await localforage.getItem('r34_manga_progress')) || {};
          progressObj[currentMangaData.id] = chapterId;
          await localforage.setItem('r34_manga_progress', progressObj);
      }

      const pageUrl = `${MD_API_BASE}/at-home/server/${chapterId}`;
      const pageRes = await throttledFetch(PROXY + encodeURIComponent(pageUrl), mdFetchOptions);
      const pageData = await pageRes.json();
      
      mangaPagesContainer.innerHTML = '';
      const baseUrl = pageData.baseUrl;
      const hash = pageData.chapter.hash;
      const pages = pageData.chapter.dataSaver;
      
      pages.forEach((p, idx) => {
        const url = `${baseUrl}/data-saver/${hash}/${p}`;
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.marginBottom = '10px';
        img.loading = idx < 3 ? 'eager' : 'lazy'; // Force first 3 pages
        mangaPagesContainer.appendChild(img);
      });

      // Smart Pre-loader
      const preloadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if(entry.isIntersecting) {
            let currentImg = entry.target;
            for(let i=0; i<3; i++) {
              currentImg = currentImg.nextElementSibling;
              if (currentImg && currentImg.tagName === 'IMG' && currentImg.loading === 'lazy') {
                 // Trigger eager load
                 const temp = new Image();
                 temp.src = currentImg.src;
                 currentImg.loading = 'eager';
              }
            }
          }
        });
      }, { rootMargin: '800px' });
      
      Array.from(mangaPagesContainer.querySelectorAll('img')).forEach(img => preloadObserver.observe(img));

  } catch(e) {
      mangaPagesContainer.innerHTML = '<p style="color:red">Failed to load chapter pages.</p>';
  }
}

mangaReaderClose.addEventListener('click', () => {
  mangaReader.style.display = 'none';
  mangaPagesContainer.innerHTML = '';
  document.body.style.overflow = '';
  if (currentMangaData) fetchAndRenderChapters(currentMangaData.id); // Re-render to show updated progress
});

// Keyboard Controls for Manga Reader
document.addEventListener('keydown', (e) => {
  if (mangaReader.style.display === 'block') {
    if (e.code === 'Space' || e.code === 'ArrowDown') {
      e.preventDefault();
      mangaPagesContainer.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      mangaPagesContainer.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
    }
  }
});