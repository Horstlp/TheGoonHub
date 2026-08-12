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

const mangaHqToggle = document.getElementById('manga-hq-toggle');
const mangaPagedToggle = document.getElementById('manga-paged-toggle');

if (mangaHqToggle) {
  mangaHqToggle.checked = localStorage.getItem('manga_hq') === 'true';
  mangaHqToggle.addEventListener('change', (e) => {
    localStorage.setItem('manga_hq', e.target.checked);
    if (mangaPagesContainer.dataset.chapterId) {
      loadMangaChapter(mangaPagesContainer.dataset.chapterId);
    }
  });
}

if (mangaPagedToggle) {
  mangaPagedToggle.checked = localStorage.getItem('manga_paged') === 'true';
  mangaPagedToggle.addEventListener('change', (e) => {
    localStorage.setItem('manga_paged', e.target.checked);
    if (mangaPagesContainer.dataset.chapterId) {
      loadMangaChapter(mangaPagesContainer.dataset.chapterId);
    }
  });
}

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
  if (!manga || !manga.attributes || !manga.attributes.title) return 'Unknown';
  return manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Unknown';
}

function getMdCoverUrl(manga) {
  if (!manga || !manga.relationships) return '';
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
let mdFullTags = [];
let mdSelectedIncludedTags = new Set();
let mdSelectedExcludedTags = new Set();
let mdTagMode = 'AND';
const mdAuthorCache = new Map();

async function resolveAuthorOrArtistId(name) {
  if (!name) return null;
  const trimmed = name.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmed)) return trimmed;
  if (mdAuthorCache.has(trimmed.toLowerCase())) return mdAuthorCache.get(trimmed.toLowerCase());
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(`${MD_API_BASE}/author?name=${encodeURIComponent(trimmed)}&limit=1`), mdFetchOptions);
    const data = await res.json();
    if (data && data.data && data.data.length > 0) {
      const id = data.data[0].id;
      mdAuthorCache.set(trimmed.toLowerCase(), id);
      return id;
    }
  } catch (e) {
    console.warn("Author lookup failed for", trimmed, e);
  }
  return null;
}

async function initMdTags() {
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(`${MD_API_BASE}/manga/tag`), mdFetchOptions);
    const data = await res.json();
    if (data && data.data) {
      mdFullTags = data.data.map(tag => {
        const name = (tag.attributes && tag.attributes.name && (tag.attributes.name.en || Object.values(tag.attributes.name)[0])) || 'Unknown';
        const group = (tag.attributes && tag.attributes.group) || 'genre';
        return { id: tag.id, name, group };
      }).sort((a, b) => a.name.localeCompare(b.name));

      mdFullTags.forEach(tag => {
        mdTagsMap.set(tag.name.toLowerCase(), tag.id);
      });

      if (typeof renderMangaModalTags === 'function') {
        renderMangaModalTags();
      }
    }
  } catch (e) {
    console.error("Failed to load MangaDex tags", e);
  }
}
initMdTags();

async function searchMangaGrid(titleQuery, page, append = false) {
  if (isMangaGridLoading) return;
  isMangaGridLoading = true;
  if (mangaGridSearchBtn) mangaGridSearchBtn.disabled = true;

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
  let url = `${MD_API_BASE}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art`;
  
  // Custom Tag Parsing & Filter Engine
  let parsedTitle = (titleQuery || '').trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(parsedTitle)) {
      url += `&ids[]=${parsedTitle}`;
  } else {
      let includedTags = Array.from(mdSelectedIncludedTags);
      let excludedTags = Array.from(mdSelectedExcludedTags);
      let ratings = [];
      let statuses = [];
      let demos = [];
      let orderQuery = '';
      
      const tokens = parsedTitle.split(/\s+/);
      let remainingTitleTokens = [];

      const tagAliases = {
        'yuri': "girls' love",
        'yaoi': "boys' love",
        'gender_bender': 'genderswap'
      };

      tokens.forEach(token => {
          let lowerToken = token.toLowerCase();
          if (lowerToken.startsWith('-tag:')) {
              let tagName = lowerToken.replace('-tag:', '').replace(/_/g, ' ');
              if (tagAliases[tagName]) tagName = tagAliases[tagName];
              for (const [key, uuid] of mdTagsMap.entries()) {
                  if (key === tagName || key.includes(tagName)) {
                      if (!excludedTags.includes(uuid)) excludedTags.push(uuid);
                      break;
                  }
              }
          } else if (lowerToken.startsWith('tag:')) {
              let tagName = lowerToken.replace('tag:', '').replace(/_/g, ' ');
              if (tagAliases[tagName]) tagName = tagAliases[tagName];
              for (const [key, uuid] of mdTagsMap.entries()) {
                  if (key === tagName || key.includes(tagName)) {
                      if (!includedTags.includes(uuid)) includedTags.push(uuid);
                      break;
                  }
              }
          } else if (lowerToken.startsWith('status:')) {
              let val = lowerToken.replace('status:', '');
              if (['ongoing', 'completed', 'hiatus', 'cancelled'].includes(val)) statuses.push(val);
          } else if (lowerToken.startsWith('demo:')) {
              let val = lowerToken.replace('demo:', '');
              if (['shounen', 'shoujo', 'josei', 'seinen'].includes(val)) demos.push(val);
          } else if (token) {
              remainingTitleTokens.push(token);
          }
      });

      // Sort Order
      const sortSelect = document.getElementById('manga-filter-sort');
      if (sortSelect && sortSelect.value) {
        const sVal = sortSelect.value;
        if (sVal === 'title_asc') orderQuery = '&order[title]=asc';
        else if (sVal === 'title_desc') orderQuery = '&order[title]=desc';
        else if (sVal === 'year_asc') orderQuery = '&order[year]=asc';
        else if (sVal === 'year_desc') orderQuery = '&order[year]=desc';
        else if (sVal !== 'relevance') orderQuery = `&order[${sVal}]=desc`;
      }

      // Content Ratings
      const ratingCheckboxes = document.querySelectorAll('input[name="manga-rating"]:checked');
      if (ratingCheckboxes.length > 0) {
        ratingCheckboxes.forEach(cb => ratings.push(cb.value));
      }
      if (ratings.length === 0) ratings = ['erotica', 'pornographic'];

      // Demographic
      const demoSelect = document.getElementById('manga-filter-demo');
      if (demoSelect && demoSelect.value && demoSelect.value !== 'any') {
        if (!demos.includes(demoSelect.value)) demos.push(demoSelect.value);
      }

      // Status
      const statusSelect = document.getElementById('manga-filter-status');
      if (statusSelect && statusSelect.value && statusSelect.value !== 'any') {
        if (!statuses.includes(statusSelect.value)) statuses.push(statusSelect.value);
      }

      // Original Languages
      const origLangSelect = document.getElementById('manga-filter-orig-lang');
      if (origLangSelect && origLangSelect.value && origLangSelect.value !== 'all') {
        url += `&originalLanguage[]=${origLangSelect.value}`;
      }

      // Publication Year
      const yearInput = document.getElementById('manga-filter-year');
      if (yearInput && yearInput.value.trim()) {
        const yVal = yearInput.value.trim();
        if (/^\d{4}$/.test(yVal)) {
          url += `&year=${encodeURIComponent(yVal)}`;
        }
      }

      // Has translated chapters & Language
      const hasTranslatedCb = document.getElementById('manga-filter-has-translated');
      if (hasTranslatedCb && hasTranslatedCb.checked) {
        url += `&hasAvailableChapters=true`;
      }
      const transLangSelect = document.getElementById('manga-filter-trans-lang');
      if (transLangSelect && transLangSelect.value && transLangSelect.value !== 'all') {
        url += `&availableTranslatedLanguage[]=${transLangSelect.value}`;
      }

      // Authors & Artists (Lookup ID if name given)
      const authorInput = document.getElementById('manga-filter-author');
      if (authorInput && authorInput.value.trim()) {
        const authId = await resolveAuthorOrArtistId(authorInput.value.trim());
        if (authId) url += `&authors[]=${authId}`;
      }
      const artistInput = document.getElementById('manga-filter-artist');
      if (artistInput && artistInput.value.trim()) {
        const artId = await resolveAuthorOrArtistId(artistInput.value.trim());
        if (artId) url += `&artists[]=${artId}`;
      }

      ratings.forEach(r => url += `&contentRating[]=${r}`);
      statuses.forEach(s => url += `&status[]=${s}`);
      demos.forEach(d => url += `&publicationDemographic[]=${d}`);
      includedTags.forEach(id => url += `&includedTags[]=${id}`);
      excludedTags.forEach(id => url += `&excludedTags[]=${id}`);
      if (includedTags.length > 0) {
        url += `&includedTagsMode=${mdTagMode}`;
      }
      if (excludedTags.length > 0) {
        url += `&excludedTagsMode=OR`;
      }
      url += orderQuery;

      parsedTitle = remainingTitleTokens.join(' ').trim();
      if (parsedTitle) {
        url += `&title=${encodeURIComponent(parsedTitle)}`;
      }
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

      const progressObj = (await localforage.getItem('r34_manga_progress')) || {};
      const favsObj = (await localforage.getItem('r34_manga_favorites')) || {};
      const readIds = new Set(Object.keys(progressObj));
      const savedIds = new Set(Object.keys(favsObj));

      injectMangaCardsIntoGrid(formattedPosts, mangaGridContainer, readIds, savedIds);
      
      if (uuidRegex.test(parsedTitle) && formattedPosts.length === 1 && !append) {
        setTimeout(() => {
          const firstCard = mangaGridContainer.querySelector('.card');
          if (firstCard) openInlineMangaExpansion(formattedPosts[0], firstCard, mangaGridContainer);
        }, 100);
      }
    }
  } catch (err) {
    console.error('MangaDex fetch error:', err);
    mangaGridStatus.innerHTML = `<span class="icon">⚠️</span>API down or rate limited.`;
    hasMoreMangaGrid = false;
  }

  mangaGridSearchBtn.disabled = false;
  isMangaGridLoading = false;

  if (hasMoreMangaGrid && typeof mangaScrollSentinel !== 'undefined' && mangaScrollSentinel) {
      const sentinelRect = mangaScrollSentinel.getBoundingClientRect();
      if (sentinelRect.top < window.innerHeight && sentinelRect.top > 0) {
          currentMangaGridPage++;
          searchMangaGrid(currentMangaGridTags, currentMangaGridPage, true);
      }
  }
}

function injectMangaCardsIntoGrid(data, targetContainer = mangaGridContainer, readIds = new Set(), savedIds = new Set()) {
  data.forEach((post, index) => {
    const previewUrl = post.preview_url;
    if (!previewUrl) return;

    const card = document.createElement('div');
    card.className = 'card';
    const img = document.createElement('img');
    img.src = previewUrl;
    img.loading = 'lazy';
    img.onload = () => { if (typeof resizeGridItem === 'function') resizeGridItem(card); };
    img.onerror = () => { card.style.display = 'none'; };
    card.appendChild(img);

    // Visual indicator for Read/Saved
    if (readIds.has(post.id) || savedIds.has(post.id)) {
      const indicator = document.createElement('div');
      indicator.style.position = 'absolute';
      indicator.style.top = '10px';
      indicator.style.left = '10px';
      indicator.style.background = 'rgba(0,0,0,0.7)';
      indicator.style.color = 'var(--text)';
      indicator.style.padding = '4px 8px';
      indicator.style.borderRadius = '12px';
      indicator.style.fontSize = '0.75rem';
      indicator.style.fontWeight = 'bold';
      indicator.style.zIndex = '10';
      indicator.style.backdropFilter = 'blur(4px)';
      
      if (readIds.has(post.id) && savedIds.has(post.id)) {
        indicator.textContent = '👁️ Read & 💖 Saved';
      } else if (savedIds.has(post.id)) {
        indicator.textContent = '💖 Saved';
      } else {
        indicator.textContent = '👁️ Read';
      }
      card.appendChild(indicator);
      
      // Slightly dim the cover to indicate it's been seen
      img.style.opacity = '0.7';
      img.style.transition = 'opacity 0.2s';
      card.onmouseenter = () => { img.style.opacity = '1'; };
      card.onmouseleave = () => { img.style.opacity = '0.7'; };
    }

    const saveWidget = document.createElement('div');
    saveWidget.className = 'pinterest-save-widget';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'pinterest-save-btn';
    saveBtn.style.marginLeft = 'auto'; // push button to the right since there's no folder select
    const isSaved = vaultedManga.some(p => String(p.id) === String(post.id));
    if (isSaved) saveBtn.classList.add('saved');
    saveBtn.textContent = isSaved ? 'Saved' : 'Merken';

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof saveMangaToBookshelf === 'function') {
        saveMangaToBookshelf(post, 'All', saveBtn);
      }
    });

    saveWidget.appendChild(saveBtn);
    card.appendChild(saveWidget);

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.innerHTML = `<span>${getMdTitle(post.mangaObject).substring(0, 30)}...</span>`;
    card.appendChild(footer);

    card.addEventListener('click', () => {
      openInlineMangaExpansion(post, card, targetContainer);
    });

    if (typeof masonryObserver !== 'undefined') masonryObserver.observe(card);
    targetContainer.appendChild(card);
  });
}

async function injectPhysicalBookshelf(data, targetContainer) {
  targetContainer.innerHTML = '';
  targetContainer.className = 'bookshelf-container';

  let needsReSave = false;

  // Helper to render a single shelf panel
  const renderShelf = async (shelfName, shelfData) => {
    const panel = document.createElement('div');
    panel.className = 'manga-shelf-panel';

    const bookmark = document.createElement('div');
    bookmark.className = 'manga-shelf-bookmark';
    bookmark.textContent = shelfName;
    panel.appendChild(bookmark);

    for (const post of shelfData) {
      const manga = post.mangaObject;
      if (!manga) continue;

      if (manga.attributes.volumeCount === undefined) {
        try {
          const aggRes = await throttledFetch(PROXY + encodeURIComponent(`${MD_API_BASE}/manga/${post.id}/aggregate`));
          if (aggRes.ok) {
            const aggData = await aggRes.json();
            const vols = aggData.volumes ? Object.keys(aggData.volumes).length : 1;
            manga.attributes.volumeCount = vols === 0 ? 1 : vols;
            needsReSave = true;
          } else {
            manga.attributes.volumeCount = 1;
          }
        } catch (err) {
          console.error("Failed to fetch aggregate for bookshelf", err);
          manga.attributes.volumeCount = 1;
        }
      }

      const actualVols = manga.attributes.volumeCount || 1;
      const renderVols = Math.min(actualVols, 30);
      const title = getMdTitle(manga);
      const coverUrl = post.preview_url;

      const group = document.createElement('div');
      group.className = 'manga-series-group';

      const tooltip = document.createElement('div');
      tooltip.className = 'manga-shelf-tooltip';
      
      const tooltipContent = document.createElement('div');
      tooltipContent.innerHTML = `
        <img src="${coverUrl}" alt="Cover">
        <h4>${title}</h4>
        <p>${actualVols} Volume${actualVols !== 1 ? 's' : ''}</p>
      `;
      tooltip.appendChild(tooltipContent);
      
      const manageBtn = document.createElement('button');
      manageBtn.className = 'expanded-btn';
      manageBtn.style.marginTop = '8px';
      manageBtn.style.width = '100%';
      manageBtn.style.padding = '6px';
      manageBtn.textContent = 'Manage / Details';
      manageBtn.onclick = (e) => {
          e.stopPropagation();
          openInlineMangaExpansion(post, group, targetContainer);
      };
      tooltip.appendChild(manageBtn);
      
      group.appendChild(tooltip);

      for (let i = 1; i <= renderVols; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'manga-vol-wrapper';

        if (i === 1) {
          const cover = document.createElement('div');
          cover.className = 'manga-vol-full';
          cover.style.backgroundImage = `url(${coverUrl})`;
          
          const label = document.createElement('div');
          label.className = 'manga-vol-label-full';
          label.textContent = `${title} VOL.1`;

          cover.addEventListener('click', () => readMangaVolumeDirectly(post, 1));
          wrapper.appendChild(cover);
          wrapper.appendChild(label);
        } else {
          const spine = document.createElement('div');
          spine.className = 'manga-vol-spine';
          spine.style.backgroundImage = `url(${coverUrl})`;
          spine.style.backgroundPosition = `${i * 15}px center`;

          const label = document.createElement('div');
          label.className = 'manga-vol-label-spine';
          label.textContent = i;

          spine.addEventListener('click', () => readMangaVolumeDirectly(post, i));
          wrapper.appendChild(spine);
          wrapper.appendChild(label);
        }

        group.appendChild(wrapper);
      }

      if (actualVols > 30) {
        const ellipsis = document.createElement('div');
        ellipsis.style.color = 'var(--muted)';
        ellipsis.style.marginLeft = '4px';
        ellipsis.style.alignSelf = 'center';
        ellipsis.textContent = `+${actualVols - 30} more...`;
        group.appendChild(ellipsis);
      }

      panel.appendChild(group);
    }
    
    targetContainer.appendChild(panel);
  };

  // 1. Render the 'All' shelf with every manga
  await renderShelf('All', data);

  // 2. Render individual custom shelves
  // We use vaultedMangaFolders which stores the user's shelf names.
  const customFolders = typeof vaultedMangaFolders !== 'undefined' ? vaultedMangaFolders : [];
  for (const folder of customFolders) {
    if (folder === 'All') continue; // Skip if 'All' somehow got in there
    const shelfData = data.filter(p => p.folder === folder);
    await renderShelf(folder, shelfData);
  }

  // 3. Render '+ Add New Shelf' button
  const addShelfBtn = document.createElement('button');
  addShelfBtn.className = 'add-shelf-btn';
  addShelfBtn.innerHTML = '<i class="fas fa-plus"></i> Add New Shelf';
  addShelfBtn.addEventListener('click', () => {
    const newName = prompt("Enter new shelf name:");
    if (newName && newName.trim()) {
      const trimmed = newName.trim();
      if (!customFolders.includes(trimmed)) {
        customFolders.push(trimmed);
        if (typeof localforage !== 'undefined') {
          localforage.setItem('r34_manga_folders_v2', customFolders);
        }
        // Re-render
        injectPhysicalBookshelf(data, targetContainer);
      }
    }
  });
  
  const addShelfContainer = document.createElement('div');
  addShelfContainer.style.textAlign = 'center';
  addShelfContainer.style.marginTop = '20px';
  addShelfContainer.appendChild(addShelfBtn);
  targetContainer.appendChild(addShelfContainer);

  if (needsReSave && typeof localforage !== 'undefined') {
    localforage.setItem('r34_vault_manga_v2', vaultedManga);
  }
}

// --- Inline Expansion Logic ---
function closeInlineMangaExpansion() {
  const existing = document.querySelector('.manga-expanded-view');
  if (existing) {
    if (typeof masonryObserver !== 'undefined') {
      masonryObserver.unobserve(existing);
    }
    
    if (existing.dataset.sourceId) {
      const source = document.getElementById(existing.dataset.sourceId);
      if (source) {
          source.style.display = ''; // unhide
          if (typeof resizeGridItem === 'function') resizeGridItem(source);
      }
    }
    
    existing.style.animation = 'none';
    existing.style.opacity = '0';
    existing.style.transform = 'scaleY(0.95)';
    setTimeout(() => existing.remove(), 200);
  }
}

async function readMangaVolumeDirectly(post, targetVolumeNumber) {
  // Setup reader overlay immediately
  const mangaReader = document.getElementById('manga-reader');
  const mangaPagesContainer = document.getElementById('manga-pages-container');
  mangaPagesContainer.dataset.chapterId = "";
  mangaPagesContainer.innerHTML = '<div class="spinner"></div><p class="text-white">Fetching volume chapters...</p>';
  mangaReader.style.display = 'block';
  document.body.style.overflow = 'hidden';

  try {
      const lang = localStorage.getItem('r34_manga_lang') || 'en';
      let aggRes = await throttledFetch(PROXY + encodeURIComponent(`${MD_API_BASE}/manga/${post.id}/aggregate?translatedLanguage[]=${lang}`));
      let aggData = await aggRes.json();
      
      if (!aggData.volumes || Object.keys(aggData.volumes).length === 0) {
          aggRes = await throttledFetch(PROXY + encodeURIComponent(`${MD_API_BASE}/manga/${post.id}/aggregate`));
          aggData = await aggRes.json();
      }

      if (!aggData.volumes || Object.keys(aggData.volumes).length === 0) {
          throw new Error('No chapters found');
      }

      const vols = Object.values(aggData.volumes);
      let targetVol = vols.find(v => parseFloat(v.volume) === targetVolumeNumber || (v.volume === 'none' && targetVolumeNumber === 1));
      
      if (!targetVol) {
          targetVol = vols.sort((a,b) => parseFloat(a.volume) - parseFloat(b.volume))[0];
      }

      const chaps = Object.values(targetVol.chapters).sort((a,b) => parseFloat(a.chapter) - parseFloat(b.chapter));
      if (chaps.length > 0) {
          let allOrderedChapters = [];
          vols.sort((a,b) => {
              if (a.volume === 'none') return 1;
              if (b.volume === 'none') return -1;
              return parseFloat(a.volume) - parseFloat(b.volume);
          }).forEach(v => {
              const vChaps = Object.values(v.chapters).sort((a,b) => parseFloat(a.chapter) - parseFloat(b.chapter));
              allOrderedChapters.push(...vChaps.map(c => c.id));
          });
          
          currentMangaData = {
              id: post.id,
              title: getMdTitle(post.mangaObject),
              coverUrl: post.preview_url,
              chaptersQueue: allOrderedChapters
          };

          loadMangaChapter(chaps[0].id);
      } else {
          throw new Error('No chapters in volume');
      }
  } catch (err) {
      console.error(err);
      const mangaPagesContainer = document.getElementById('manga-pages-container');
      mangaPagesContainer.innerHTML = `<p class="text-white">Error loading volume: ${err.message}</p>`;
  }
}

async function openInlineMangaExpansion(post, clickedElement, container, targetVolume) {
  closeInlineMangaExpansion(); // Close any open ones

  const manga = post.mangaObject;
  if (!manga) return;

  if (!clickedElement.id) {
    clickedElement.id = 'manga-grid-item-' + post.id + '-' + Date.now();
  }

  // 2. Create Expanded View
  const expanded = document.createElement('div');
  expanded.className = 'manga-expanded-view';
  expanded.dataset.sourceId = clickedElement.id;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'expanded-close';
  closeBtn.innerHTML = '✕';
  closeBtn.onclick = closeInlineMangaExpansion;
  expanded.appendChild(closeBtn);

  const coverImg = document.createElement('img');
  coverImg.className = 'expanded-cover';
  coverImg.src = post.preview_url;
  expanded.appendChild(coverImg);

  const infoCol = document.createElement('div');
  infoCol.className = 'expanded-info';
  
  const titleEl = document.createElement('h3');
  titleEl.className = 'expanded-title';
  titleEl.textContent = getMdTitle(manga);
  infoCol.appendChild(titleEl);

  const actions = document.createElement('div');
  actions.className = 'expanded-actions';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'expanded-btn';
  const isSaved = typeof vaultedPosts !== 'undefined' && vaultedPosts.some(p => String(p.id) === String(post.id));
  if (isSaved) saveBtn.classList.add('saved');
  saveBtn.textContent = isSaved ? 'Saved' : 'Save';
  saveBtn.onclick = (e) => {
    if (typeof openFolderMenu === 'function') {
      openFolderMenu(e, post, saveBtn, (isSavedNow) => {
        saveBtn.classList.toggle('saved', isSavedNow);
        saveBtn.textContent = isSavedNow ? 'Saved' : 'Save';
      });
    }
  };
  
  const readBtn = document.createElement('button');
  readBtn.className = 'expanded-btn';
  readBtn.textContent = 'Read First Chapter';
  // Note: We'll attach the click handler after fetching chapters!
  
  actions.appendChild(saveBtn);
  actions.appendChild(readBtn);
  infoCol.appendChild(actions);

  const updateSaveBtnState = async () => {
    const favs = (await localforage.getItem('r34_manga_favorites')) || {};
    const isFav = !!favs[post.id];
    saveBtn.textContent = isFav ? '💖 Saved' : '🤍 Save';
    saveBtn.style.color = isFav ? '#8b5cf6' : 'var(--text)';
    saveBtn.style.borderColor = isFav ? '#8b5cf6' : 'var(--border)';
  };
  updateSaveBtnState();

  saveBtn.onclick = async () => {
    const favs = (await localforage.getItem('r34_manga_favorites')) || {};
    if (favs[post.id]) {
      delete favs[post.id];
    } else {
      favs[post.id] = {
        id: post.id,
        title: getMdTitle(manga),
        coverUrl: post.preview_url,
        timestamp: Date.now()
      };
    }
    await localforage.setItem('r34_manga_favorites', favs);
    updateSaveBtnState();
    if (typeof renderMangaLibrary === 'function') renderMangaLibrary();
  };

  const desc = document.createElement('div');
  desc.className = 'expanded-desc';
  let descText = manga.attributes.description?.en || 'No description available.';
  // Basic markdown cleanup
  descText = descText.replace(/\[\/?b\]/gi, '').replace(/\[\/?i\]/gi, '').replace(/\[url=.*?\](.*?)\[\/url\]/gi, '$1');
  desc.textContent = descText;
  infoCol.appendChild(desc);
  
  expanded.appendChild(infoCol);

  // 3. Chapters Section
  const chaptersCol = document.createElement('div');
  chaptersCol.className = 'expanded-chapters';
  
  const chapHeader = document.createElement('div');
  chapHeader.className = 'chapters-header';
  chapHeader.innerHTML = `<h3 class="m-0 text-lg">Chapters</h3>`;
  
  const langSelect = document.createElement('select');
  langSelect.className = 'filter-select';
  langSelect.style.cssText = 'background: rgba(0,0,0,0.3); border: 1px solid var(--border); color: var(--text); padding: 4px 8px; border-radius: 4px;';
  let langs = ['en'];
  if (post.mangaObject && post.mangaObject.attributes && post.mangaObject.attributes.availableTranslatedLanguages) {
      langs = post.mangaObject.attributes.availableTranslatedLanguages.filter(l => l !== null);
      if (langs.length === 0) langs = ['en'];
  }

  langs.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l; opt.textContent = l.toUpperCase();
    langSelect.appendChild(opt);
  });
  
  const savedLang = localStorage.getItem('r34_manga_lang') || 'en';
  langSelect.value = langs.includes(savedLang) ? savedLang : langs[0];
  chapHeader.appendChild(langSelect);
  chaptersCol.appendChild(chapHeader);

  const chapList = document.createElement('div');
  chapList.className = 'chapters-list';
  chapList.innerHTML = '<span class="text-muted">Loading chapters...</span>';
  chaptersCol.appendChild(chapList);
  
  expanded.appendChild(chaptersCol);

  // Hide original card and inject inline
  clickedElement.style.display = 'none';
  clickedElement.parentNode.insertBefore(expanded, clickedElement);
  
  if (typeof masonryObserver !== 'undefined') {
    masonryObserver.observe(expanded);
  }
  
  expanded.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 4. Fetch Volumes & Preload Pages
  async function fetchVolumesForExpansion(lang, targetVolumeNumber) {
    chapList.innerHTML = '<span class="text-muted">Loading volumes...</span>';
    try {
      // Fetch aggregate for chapters and volumes
      let aggRes = await throttledFetch(PROXY + encodeURIComponent(`https://api.mangadex.org/manga/${post.id}/aggregate?translatedLanguage[]=${lang}`));
      let aggData = await aggRes.json();
      
      if (!aggData.volumes || Object.keys(aggData.volumes).length === 0) {
        aggRes = await throttledFetch(PROXY + encodeURIComponent(`https://api.mangadex.org/manga/${post.id}/aggregate`));
        aggData = await aggRes.json();
      }

      // Fetch cover arts for all volumes
      const coverRes = await throttledFetch(PROXY + encodeURIComponent(`https://api.mangadex.org/cover?manga[]=${post.id}&limit=100`));
      const coverData = await coverRes.json();
      
      const coverMap = {};
      if (coverData.data) {
          coverData.data.forEach(c => {
              if (c.attributes.volume) coverMap[c.attributes.volume] = c.attributes.fileName;
          });
      }

      chapList.innerHTML = '';
      
      if (!aggData.volumes || Object.keys(aggData.volumes).length === 0) {
        chapList.innerHTML = '<span class="text-muted">No chapters found.</span>';
        readBtn.disabled = true;
        return;
      }
      
      const volumes = Object.values(aggData.volumes).sort((a,b) => {
          if (a.volume === 'none') return 1;
          if (b.volume === 'none') return -1;
          return parseFloat(a.volume) - parseFloat(b.volume);
      });
      
      // Build a flat ordered array of chapters for reading chaining
      let allOrderedChapters = [];
      
      // Render Volumes
      volumes.forEach(vol => {
          // Sort chapters inside the volume
          const chaps = Object.values(vol.chapters).sort((a,b) => parseFloat(a.chapter) - parseFloat(b.chapter));
          if (chaps.length === 0) return;
          
          allOrderedChapters.push(...chaps.map(c => c.id));
          
          const spine = document.createElement('div');
          spine.className = 'volume-cover';
          
          let volCoverUrl = post.preview_url;
          if (vol.volume !== 'none' && coverMap[vol.volume]) {
              volCoverUrl = `https://uploads.mangadex.org/covers/${post.id}/${coverMap[vol.volume]}.256.jpg`;
          }
          spine.style.backgroundImage = `url(${volCoverUrl})`;
          
          const titleEl = document.createElement('div');
          titleEl.className = 'volume-cover-title';
          titleEl.textContent = vol.volume !== 'none' ? `Vol. ${vol.volume}` : 'No Vol';
          spine.appendChild(titleEl);
          
          const rangeEl = document.createElement('div');
          rangeEl.className = 'volume-cover-range';
          if (chaps.length === 1) {
              rangeEl.textContent = `Ch. ${chaps[0].chapter}`;
          } else {
              rangeEl.textContent = `Ch. ${chaps[0].chapter} - ${chaps[chaps.length - 1].chapter}`;
          }
          spine.appendChild(rangeEl);
          
          spine.onclick = () => {
              loadMangaChapter(chaps[0].id);
          };
          if (targetVolumeNumber !== undefined && (parseFloat(vol.volume) === targetVolumeNumber || (vol.volume === 'none' && targetVolumeNumber === 1))) {
              setTimeout(() => spine.click(), 100);
          }
          
          // Hover Preload Logic (Preloads the FIRST chapter of the volume)
          const firstChapId = chaps[0].id;
          spine.dataset.chapId = firstChapId;
          spine.addEventListener('mouseenter', async () => {
              spine.style.borderColor = 'var(--accent-purple)';
              if (spine.dataset.firstPageUrl) {
                coverImg.src = spine.dataset.firstPageUrl;
              } else if (!spine.dataset.loadingPage) {
                spine.dataset.loadingPage = "true";
                coverImg.style.opacity = '0.5'; 
                try {
                  const res = await fetch(`https://api.mangadex.org/at-home/server/${firstChapId}`);
                  const data = await res.json();
                  if (data.baseUrl && data.chapter.dataSaver.length > 0) {
                    const url = `${data.baseUrl}/data-saver/${data.chapter.hash}/${data.chapter.dataSaver[0]}`;
                    spine.dataset.firstPageUrl = url;
                    if (spine.matches(':hover')) {
                      coverImg.src = url;
                      coverImg.style.opacity = '1';
                    }
                  }
                } catch(e) {}
                coverImg.style.opacity = '1';
              }
          });
          
          spine.addEventListener('mouseleave', () => {
            coverImg.src = post.preview_url;
            spine.style.borderColor = 'rgba(255,255,255,0.3)';
          });
          
          chapList.appendChild(spine);
      });
      
      // Store current manga context globally for reader
      currentMangaData = {
          id: post.id,
          title: getMdTitle(manga),
          coverUrl: post.preview_url,
          chaptersQueue: allOrderedChapters
      };
      
      readBtn.disabled = allOrderedChapters.length === 0;
      readBtn.onclick = () => {
          if (allOrderedChapters.length > 0) {
              loadMangaChapter(allOrderedChapters[0]);
          }
      };

      // Background Preload Sequence (Preload first page of ALL volumes silently)
      setTimeout(async () => {
        const spinesToPreload = Array.from(chapList.children).filter(s => s.classList.contains('volume-cover'));
        for (const sp of spinesToPreload) {
          if (!document.body.contains(expanded)) break; // Stop if closed
          if (sp.dataset.firstPageUrl || sp.dataset.loadingPage) continue;
          
          try {
             const res = await fetch(`https://api.mangadex.org/at-home/server/${sp.dataset.chapId}`);
             const data = await res.json();
             if (data.baseUrl && data.chapter.dataSaver.length > 0) {
                sp.dataset.firstPageUrl = `${data.baseUrl}/data-saver/${data.chapter.hash}/${data.chapter.dataSaver[0]}`;
             }
          } catch(e) {}
          
          await new Promise(r => setTimeout(r, 300)); // Be nice to API
        }
      }, 1000);

    } catch (err) {
      console.error(err);
      chapList.innerHTML = '<span class="text-danger">Error loading volumes.</span>';
    }
  }

  fetchVolumesForExpansion(langSelect.value, targetVolume);

  langSelect.addEventListener('change', () => {
    localStorage.setItem('r34_manga_lang', langSelect.value);
    fetchVolumesForExpansion(langSelect.value);
  });
}


// ==========================================================================
// MANGA ADVANCED SEARCH CONTROLLER & FILTER ENGINE
// ==========================================================================

const mangaAdvancedSearchInput = document.getElementById('manga-grid-search-input');
const mangaSearchClearBtn = document.getElementById('manga-search-clear-btn');
const mangaToggleFiltersBtn = document.getElementById('manga-toggle-filters-btn');
const mangaFiltersPanel = document.getElementById('manga-filters-panel');

const mangaSortSelect = document.getElementById('manga-filter-sort');
const mangaTagsTriggerBtn = document.getElementById('manga-tags-trigger-btn');
const mangaTagsTriggerText = document.getElementById('manga-tags-trigger-text');
const mangaTagsBadge = document.getElementById('manga-tags-badge');
const mangaRatingTriggerBtn = document.getElementById('manga-rating-trigger-btn');
const mangaRatingTriggerText = document.getElementById('manga-rating-trigger-text');
const mangaRatingBadge = document.getElementById('manga-rating-badge');
const mangaRatingDropdown = document.getElementById('manga-rating-dropdown-menu');
const mangaDemoSelect = document.getElementById('manga-filter-demo');
const mangaAuthorInput = document.getElementById('manga-filter-author');
const mangaArtistInput = document.getElementById('manga-filter-artist');
const mangaOrigLangSelect = document.getElementById('manga-filter-orig-lang');
const mangaYearInput = document.getElementById('manga-filter-year');
const mangaYearMinus = document.getElementById('manga-year-minus');
const mangaYearPlus = document.getElementById('manga-year-plus');
const mangaStatusSelect = document.getElementById('manga-filter-status');
const mangaHasTranslatedCb = document.getElementById('manga-filter-has-translated');
const mangaTransLangSelect = document.getElementById('manga-filter-trans-lang');
const mangaActiveTagPills = document.getElementById('manga-active-tag-pills');

const mangaResetFiltersBtn = document.getElementById('manga-reset-filters-btn');
const mangaLuckyBtn = document.getElementById('manga-lucky-btn');

// Tag Drawer Elements
const mangaTagsModal = document.getElementById('manga-tags-modal');
const mangaTagsModalClose = document.getElementById('manga-tags-modal-close');
const mangaModalTagSearch = document.getElementById('manga-modal-tag-search');
const mangaModalTagsContainer = document.getElementById('manga-modal-tags-container');
const mangaModalTagsClear = document.getElementById('manga-modal-tags-clear');

function doMangaSearch() {
  const query = mangaAdvancedSearchInput ? mangaAdvancedSearchInput.value : '';
  currentMangaGridTags = query;
  currentMangaGridPage = 1;
  searchMangaGrid(currentMangaGridTags, currentMangaGridPage, false);
}

const debouncedMangaSearch = debounce(() => {
  doMangaSearch();
}, 250);

// 1. Tag Drawer Renderer & Interaction
function renderMangaModalTags(filterQuery = '') {
  if (!mangaModalTagsContainer) return;
  if (!mdFullTags || mdFullTags.length === 0) {
    mangaModalTagsContainer.innerHTML = '<div class="manga-tags-loading"><div class="spinner"></div>Loading tags...</div>';
    return;
  }

  const query = filterQuery.toLowerCase().trim();
  const categoryLabels = {
    'genre': '🎭 Genres',
    'theme': '🎨 Themes',
    'format': '📑 Formats',
    'content': '⚠️ Content / Warnings'
  };

  const groups = {};
  mdFullTags.forEach(tag => {
    if (query && !tag.name.toLowerCase().includes(query)) return;
    const grp = tag.group || 'genre';
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(tag);
  });

  mangaModalTagsContainer.innerHTML = '';

  const groupOrder = ['genre', 'theme', 'format', 'content'];
  let totalRendered = 0;

  groupOrder.forEach(grpKey => {
    const tags = groups[grpKey];
    if (!tags || tags.length === 0) return;
    totalRendered += tags.length;

    const section = document.createElement('div');
    section.className = 'manga-tag-category-section';

    const title = document.createElement('div');
    title.className = 'manga-tag-category-title';
    title.textContent = categoryLabels[grpKey] || grpKey.toUpperCase();
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'manga-tag-chips-grid';

    tags.forEach(tag => {
      const chip = document.createElement('div');
      chip.className = 'manga-tag-chip';
      chip.dataset.id = tag.id;
      chip.textContent = tag.name;

      if (mdSelectedIncludedTags.has(tag.id)) {
        chip.classList.add('included');
      } else if (mdSelectedExcludedTags.has(tag.id)) {
        chip.classList.add('excluded');
      }

      chip.addEventListener('click', () => {
        if (mdSelectedIncludedTags.has(tag.id)) {
          // Included -> Excluded
          mdSelectedIncludedTags.delete(tag.id);
          mdSelectedExcludedTags.add(tag.id);
          chip.classList.remove('included');
          chip.classList.add('excluded');
        } else if (mdSelectedExcludedTags.has(tag.id)) {
          // Excluded -> Neutral
          mdSelectedExcludedTags.delete(tag.id);
          chip.classList.remove('excluded');
        } else {
          // Neutral -> Included
          mdSelectedIncludedTags.add(tag.id);
          chip.classList.add('included');
        }
        updateMangaTagsUI();
        debouncedMangaSearch();
      });

      grid.appendChild(chip);
    });

    section.appendChild(grid);
    mangaModalTagsContainer.appendChild(section);
  });

  if (totalRendered === 0) {
    mangaModalTagsContainer.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 30px;">No tags found matching "' + filterQuery + '"</div>';
  }
}

function updateMangaTagsUI() {
  const incCount = mdSelectedIncludedTags.size;
  const excCount = mdSelectedExcludedTags.size;
  const totalCount = incCount + excCount;

  if (mangaTagsBadge) {
    if (totalCount > 0) {
      mangaTagsBadge.textContent = `+${totalCount}`;
      mangaTagsBadge.style.display = 'inline-flex';
    } else {
      mangaTagsBadge.style.display = 'none';
    }
  }

  if (mangaTagsTriggerBtn) {
    mangaTagsTriggerBtn.classList.toggle('active', totalCount > 0 || (mangaTagsModal && mangaTagsModal.style.display !== 'none'));
  }

  if (mangaTagsTriggerText) {
    if (totalCount === 0) {
      mangaTagsTriggerText.textContent = 'Tags';
    } else {
      mangaTagsTriggerText.textContent = `Tags (${totalCount})`;
    }
  }

  // Update active tag pills inside the search capsule
  if (mangaActiveTagPills) {
    mangaActiveTagPills.innerHTML = '';

    mdSelectedIncludedTags.forEach(tagId => {
      const tagObj = mdFullTags.find(t => t.id === tagId);
      const name = tagObj ? tagObj.name : 'Tag';
      const pill = document.createElement('span');
      pill.className = 'manga-active-pill include';
      pill.innerHTML = `<span>+ ${name}</span><span class="pill-remove-btn" title="Remove tag">✕</span>`;
      pill.querySelector('.pill-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        mdSelectedIncludedTags.delete(tagId);
        updateMangaTagsUI();
        renderMangaModalTags(mangaModalTagSearch ? mangaModalTagSearch.value : '');
        doMangaSearch();
      });
      mangaActiveTagPills.appendChild(pill);
    });

    mdSelectedExcludedTags.forEach(tagId => {
      const tagObj = mdFullTags.find(t => t.id === tagId);
      const name = tagObj ? tagObj.name : 'Tag';
      const pill = document.createElement('span');
      pill.className = 'manga-active-pill exclude';
      pill.innerHTML = `<span>− ${name}</span><span class="pill-remove-btn" title="Remove tag">✕</span>`;
      pill.querySelector('.pill-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        mdSelectedExcludedTags.delete(tagId);
        updateMangaTagsUI();
        renderMangaModalTags(mangaModalTagSearch ? mangaModalTagSearch.value : '');
        doMangaSearch();
      });
      mangaActiveTagPills.appendChild(pill);
    });
  }
}

// Tag Drawer Event Listeners
if (mangaTagsTriggerBtn) {
  mangaTagsTriggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mangaTagsModal) {
      const isVisible = mangaTagsModal.style.display !== 'none';
      if (isVisible) {
        mangaTagsModal.style.display = 'none';
        mangaTagsTriggerBtn.classList.toggle('active', (mdSelectedIncludedTags.size + mdSelectedExcludedTags.size) > 0);
      } else {
        renderMangaModalTags(mangaModalTagSearch ? mangaModalTagSearch.value : '');
        mangaTagsModal.style.display = 'block';
        mangaTagsTriggerBtn.classList.add('active');
        if (mangaModalTagSearch) mangaModalTagSearch.focus();
      }
    }
  });
}

if (mangaTagsModalClose) {
  mangaTagsModalClose.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mangaTagsModal) {
      mangaTagsModal.style.display = 'none';
      if (mangaTagsTriggerBtn) {
        mangaTagsTriggerBtn.classList.toggle('active', (mdSelectedIncludedTags.size + mdSelectedExcludedTags.size) > 0);
      }
    }
  });
}

if (mangaModalTagSearch) {
  mangaModalTagSearch.addEventListener('input', debounce(() => {
    renderMangaModalTags(mangaModalTagSearch.value);
  }, 150));
}

document.querySelectorAll('input[name="manga-tag-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    mdTagMode = radio.value;
    doMangaSearch();
  });
});

if (mangaModalTagsClear) {
  mangaModalTagsClear.addEventListener('click', (e) => {
    e.stopPropagation();
    mdSelectedIncludedTags.clear();
    mdSelectedExcludedTags.clear();
    renderMangaModalTags(mangaModalTagSearch ? mangaModalTagSearch.value : '');
    updateMangaTagsUI();
    doMangaSearch();
  });
}

// 2. Content Rating Popover Controller
function updateRatingUI() {
  const checked = document.querySelectorAll('input[name="manga-rating"]:checked');
  const count = checked.length;
  if (mangaRatingBadge) {
    mangaRatingBadge.textContent = `+${count}`;
    mangaRatingBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
  if (mangaRatingTriggerText) {
    if (count === 0) {
      mangaRatingTriggerText.textContent = 'Rating';
    } else if (count === 4) {
      mangaRatingTriggerText.textContent = 'All Ratings';
    } else {
      const labels = Array.from(checked).map(c => {
        const val = c.value;
        return val.charAt(0).toUpperCase() + val.slice(1);
      });
      mangaRatingTriggerText.textContent = labels.length <= 2 ? labels.join(', ') : `${labels[0]}+`;
    }
  }
}

if (mangaRatingTriggerBtn) {
  mangaRatingTriggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mangaRatingDropdown) {
      const isShown = mangaRatingDropdown.style.display === 'flex';
      mangaRatingDropdown.style.display = isShown ? 'none' : 'flex';
      mangaRatingTriggerBtn.classList.toggle('active', !isShown);
    }
  });
}

if (mangaRatingDropdown) {
  mangaRatingDropdown.addEventListener('click', (e) => e.stopPropagation());
  document.querySelectorAll('input[name="manga-rating"]').forEach(cb => {
    cb.addEventListener('change', () => {
      updateRatingUI();
      doMangaSearch();
    });
  });
}

// Global click outside to dismiss rating popover
document.addEventListener('click', (e) => {
  if (mangaRatingDropdown && mangaRatingDropdown.style.display === 'flex') {
    if (!mangaRatingDropdown.contains(e.target) && e.target !== mangaRatingTriggerBtn) {
      mangaRatingDropdown.style.display = 'none';
    }
  }
});

// 3. Year Stepper Buttons
if (mangaYearMinus && mangaYearInput) {
  mangaYearMinus.addEventListener('click', () => {
    const val = parseInt(mangaYearInput.value, 10);
    if (!isNaN(val)) {
      mangaYearInput.value = val - 1;
    } else {
      mangaYearInput.value = new Date().getFullYear() - 1;
    }
    doMangaSearch();
  });
}

if (mangaYearPlus && mangaYearInput) {
  mangaYearPlus.addEventListener('click', () => {
    const val = parseInt(mangaYearInput.value, 10);
    if (!isNaN(val)) {
      mangaYearInput.value = val + 1;
    } else {
      mangaYearInput.value = new Date().getFullYear();
    }
    doMangaSearch();
  });
}

if (mangaYearInput) {
  mangaYearInput.addEventListener('change', () => {
    doMangaSearch();
  });
}

if (mangaAuthorInput) {
  mangaAuthorInput.addEventListener('change', () => {
    doMangaSearch();
  });
}

if (mangaArtistInput) {
  mangaArtistInput.addEventListener('change', () => {
    doMangaSearch();
  });
}

// 4. Toggle Filters Panel
function initFiltersToggle() {
  const isExpanded = localStorage.getItem('manga_filters_expanded') === 'true';
  if (mangaFiltersPanel && mangaToggleFiltersBtn) {
    mangaFiltersPanel.style.display = isExpanded ? 'block' : 'none';
    mangaToggleFiltersBtn.classList.toggle('active', isExpanded);
  }
}
initFiltersToggle();

if (mangaToggleFiltersBtn && mangaFiltersPanel) {
  mangaToggleFiltersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isCurrentlyOpen = mangaFiltersPanel.style.display !== 'none';
    mangaFiltersPanel.style.display = isCurrentlyOpen ? 'none' : 'block';
    mangaToggleFiltersBtn.classList.toggle('active', !isCurrentlyOpen);
    localStorage.setItem('manga_filters_expanded', !isCurrentlyOpen);
  });
}

// 5. Search Bar Inputs, Autocomplete & Clear Button
const mangaAutocompleteBox = document.getElementById('manga-autocomplete-box');
let mangaAutocompleteTimer = null;

if (mangaAdvancedSearchInput) {
  mangaAdvancedSearchInput.addEventListener('input', () => {
    const val = mangaAdvancedSearchInput.value.trim();
    if (mangaSearchClearBtn) {
      mangaSearchClearBtn.style.display = val ? 'flex' : 'none';
    }

    clearTimeout(mangaAutocompleteTimer);
    if (!mangaAutocompleteBox) return;

    if (val.length < 2) {
      mangaAutocompleteBox.classList.remove('show');
      mangaAutocompleteBox.innerHTML = '';
      return;
    }

    mangaAutocompleteTimer = setTimeout(async () => {
      try {
        const res = await throttledFetch(PROXY + encodeURIComponent(`${MD_API_BASE}/manga?title=${encodeURIComponent(val)}&limit=6&includes[]=cover_art`), mdFetchOptions);
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
          mangaAutocompleteBox.innerHTML = '';
          data.data.forEach(item => {
            const title = getMdTitle(item);
            const row = document.createElement('div');
            row.className = 'autocomplete-item';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.padding = '8px 14px';
            row.style.cursor = 'pointer';
            
            const yr = (item.attributes && item.attributes.year) ? `(${item.attributes.year})` : '';
            row.innerHTML = `<span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📖 ${title}</span><span style="font-size: 0.75rem; color: var(--muted); margin-left: 8px;">${yr}</span>`;
            
            row.addEventListener('click', (e) => {
              e.stopPropagation();
              mangaAdvancedSearchInput.value = title;
              mangaAutocompleteBox.classList.remove('show');
              mangaAutocompleteBox.innerHTML = '';
              doMangaSearch();
            });
            mangaAutocompleteBox.appendChild(row);
          });
          mangaAutocompleteBox.classList.add('show');
        } else {
          mangaAutocompleteBox.classList.remove('show');
          mangaAutocompleteBox.innerHTML = '';
        }
      } catch (e) {
        // silently handle autocomplete error
      }
    }, 250);
  });

  mangaAdvancedSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (mangaAutocompleteBox) {
        mangaAutocompleteBox.classList.remove('show');
        mangaAutocompleteBox.innerHTML = '';
      }
      doMangaSearch();
    } else if (e.key === 'Escape') {
      if (mangaAutocompleteBox) {
        mangaAutocompleteBox.classList.remove('show');
        mangaAutocompleteBox.innerHTML = '';
      }
    }
  });
}

if (mangaSearchClearBtn) {
  mangaSearchClearBtn.addEventListener('click', () => {
    if (mangaAdvancedSearchInput) {
      mangaAdvancedSearchInput.value = '';
      mangaAdvancedSearchInput.focus();
    }
    if (mangaAutocompleteBox) {
      mangaAutocompleteBox.classList.remove('show');
      mangaAutocompleteBox.innerHTML = '';
    }
    mangaSearchClearBtn.style.display = 'none';
    doMangaSearch();
  });
}

if (mangaGridSearchBtn) {
  mangaGridSearchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (mangaAutocompleteBox) {
      mangaAutocompleteBox.classList.remove('show');
      mangaAutocompleteBox.innerHTML = '';
    }
    doMangaSearch();
  });
}

// 6. Reset Filters Button
if (mangaResetFiltersBtn) {
  mangaResetFiltersBtn.addEventListener('click', () => {
    if (mangaAdvancedSearchInput) mangaAdvancedSearchInput.value = '';
    if (mangaSearchClearBtn) mangaSearchClearBtn.style.display = 'none';
    if (mangaSortSelect) mangaSortSelect.value = 'relevance';
    if (mangaDemoSelect) mangaDemoSelect.value = 'any';
    if (mangaAuthorInput) mangaAuthorInput.value = '';
    if (mangaArtistInput) mangaArtistInput.value = '';
    if (mangaOrigLangSelect) mangaOrigLangSelect.value = 'all';
    if (mangaYearInput) mangaYearInput.value = '';
    if (mangaStatusSelect) mangaStatusSelect.value = 'any';
    if (mangaHasTranslatedCb) mangaHasTranslatedCb.checked = true;
    if (mangaTransLangSelect) mangaTransLangSelect.value = 'all';

    // Reset Content Rating to default erotica + pornographic
    document.querySelectorAll('input[name="manga-rating"]').forEach(cb => {
      cb.checked = (cb.value === 'erotica' || cb.value === 'pornographic');
    });
    updateRatingUI();

    // Reset tags
    mdSelectedIncludedTags.clear();
    mdSelectedExcludedTags.clear();
    updateMangaTagsUI();
    renderMangaModalTags(mangaModalTagSearch ? mangaModalTagSearch.value : '');

    doMangaSearch();
  });
}

// 7. I'm Feeling Lucky Button (Random Manga)
if (mangaLuckyBtn) {
  mangaLuckyBtn.addEventListener('click', async () => {
    try {
      mangaLuckyBtn.disabled = true;
      mangaLuckyBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:auto;"></div>';

      let ratings = [];
      document.querySelectorAll('input[name="manga-rating"]:checked').forEach(cb => ratings.push(cb.value));
      if (ratings.length === 0) ratings = ['erotica', 'pornographic'];

      let randomUrl = `${MD_API_BASE}/manga/random?includes[]=cover_art`;
      ratings.forEach(r => randomUrl += `&contentRating[]=${r}`);

      const res = await fetch(PROXY + encodeURIComponent(randomUrl), mdFetchOptions);
      const data = await res.json();
      if (data && data.data && data.data.id) {
        if (mangaAdvancedSearchInput) {
          mangaAdvancedSearchInput.value = data.data.id;
          if (mangaSearchClearBtn) mangaSearchClearBtn.style.display = 'flex';
        }
        doMangaSearch();
      }
    } catch (e) {
      console.error("Failed to fetch random manga", e);
    } finally {
      mangaLuckyBtn.disabled = false;
      mangaLuckyBtn.innerHTML = '<span>🎲</span>';
    }
  });
}

// 8. Auto-search on select dropdown change
[mangaSortSelect, mangaDemoSelect, mangaOrigLangSelect, mangaStatusSelect, mangaTransLangSelect, mangaHasTranslatedCb].forEach(el => {
  if (el) {
    el.addEventListener('change', () => {
      doMangaSearch();
    });
  }
});

// Author / Artist / Year enter key triggers search
[mangaAuthorInput, mangaArtistInput, mangaYearInput].forEach(inp => {
  if (inp) {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doMangaSearch();
      }
    });
  }
});

// Global click to close popovers
document.addEventListener('click', () => {
  if (mangaRatingDropdown) mangaRatingDropdown.style.display = 'none';
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
if (mangaLangSelect) mangaLangSelect.value = savedLang;

if (mangaLangSelect) {
  mangaLangSelect.addEventListener('change', () => {
    localStorage.setItem('r34_manga_lang', mangaLangSelect.value);
    if (currentMangaData) {
      fetchAndRenderChapters(currentMangaData.id);
    }
  });
}

async function fetchAndRenderChapters(mangaId) {
  if (mangaChapterList) mangaChapterList.innerHTML = '<div class="spinner"></div><span class="text-muted text-sm">Loading chapters...</span>';
  const lang = mangaLangSelect ? mangaLangSelect.value : (localStorage.getItem('r34_manga_lang') || 'en');
  const feedUrl = `${MD_API_BASE}/manga/${mangaId}/feed?translatedLanguage[]=${lang}&order[volume]=desc&order[chapter]=desc&limit=500`;

  try {
    let feedRes = await throttledFetch(PROXY + encodeURIComponent(feedUrl), mdFetchOptions);
    let feedData = await feedRes.json();
    
    if (!feedData.data || feedData.data.length === 0) {
      const fallbackUrl = `${MD_API_BASE}/manga/${mangaId}/feed?order[volume]=desc&order[chapter]=desc&limit=500`;
      feedRes = await throttledFetch(PROXY + encodeURIComponent(fallbackUrl), mdFetchOptions);
      feedData = await feedRes.json();
    }
    
    currentMangaData.chapters = feedData.data || [];

    if (mangaChapterList) {
        mangaChapterList.innerHTML = '';
        if (currentMangaData.chapters.length === 0) {
          mangaChapterList.innerHTML = `<span class="text-muted text-sm">No chapters found for selected language.</span>`;
          return;
        }
    }


    const progressObj = (await localforage.getItem('r34_manga_progress')) || {};
    const progressEntry = progressObj[mangaId];
    const lastReadChapId = typeof progressEntry === 'object' && progressEntry !== null ? progressEntry.chapterId : progressEntry;

    currentMangaData.chapters.forEach(chap => {
      const vol = chap.attributes.volume || '-';
      const chNum = chap.attributes.chapter || '?';
      const title = chap.attributes.title ? ` - ${chap.attributes.title}` : '';
      const isLastRead = chap.id === lastReadChapId;

      const btn = document.createElement('button');
      btn.style.cssText = `background: var(--bg); color: var(--text); border: 1px solid ${isLastRead ? 'var(--accent-purple)' : 'var(--border)'}; padding: 12px; border-radius: 6px; text-align: left; cursor: pointer; transition: background 0.2s; position: relative;`;

      let html = `<strong>Vol ${vol} Ch ${chNum}</strong><span class="text-muted">${title}</span>`;
      if (isLastRead) {
        html += `<span class="badge-purple-outline float-right">Resume</span>`;
      }
      btn.innerHTML = html;

      btn.onmouseover = () => btn.style.background = 'var(--surface)';
      btn.onmouseout = () => btn.style.background = 'var(--bg)';
      btn.onclick = () => {
        loadMangaChapter(chap.id);
      };
      if (mangaChapterList) mangaChapterList.appendChild(btn);
    });
  } catch (err) {
    console.error('Chapters fetch error:', err);
    if (mangaChapterList) mangaChapterList.innerHTML = `<span class="icon">?</span> Error fetching chapters`;
  }
}

if (mangaFetchBtn) {
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
}

if (mangaLikeBtn) {
  mangaLikeBtn.addEventListener('click', () => {
  if (!currentMangaData) return;
  if (typeof togglePostLikeStatus === 'function') togglePostLikeStatus(currentMangaData.id);
  const isLiked = likedPosts.includes(String(currentMangaData.id));
  mangaLikeBtn.textContent = isLiked ? '♥ Liked' : '♡ Like';
  mangaLikeBtn.style.color = isLiked ? '#ff3366' : 'var(--text)';
  mangaLikeBtn.style.borderColor = isLiked ? '#ff3366' : 'var(--border)';
});
}

if (mangaSaveBtn) {
  mangaSaveBtn.addEventListener('click', (e) => {
  if (!currentMangaData) return;
  if (typeof openFolderMenu === 'function') {
    openFolderMenu(e, currentMangaData, mangaSaveBtn, (isSavedNow) => {
      mangaSaveBtn.textContent = isSavedNow ? '💖 Saved' : '🤍 Save';
      mangaSaveBtn.style.color = isSavedNow ? '#8b5cf6' : 'var(--text)';
      mangaSaveBtn.style.borderColor = isSavedNow ? '#8b5cf6' : 'var(--border)';
    });
  }
});
}

async function loadMangaChapter(chapterId) {
  mangaPagesContainer.dataset.chapterId = chapterId;
  mangaPagesContainer.innerHTML = '<div class="spinner"></div><p class="text-white">Loading chapter pages...</p>';
  mangaReader.style.display = 'block';
  document.body.style.overflow = 'hidden';

  try {
    // Save progress tracker
    if (currentMangaData && currentMangaData.id) {
      const progressObj = (await localforage.getItem('r34_manga_progress')) || {};
      progressObj[currentMangaData.id] = {
        chapterId: chapterId,
        title: currentMangaData.title,
        coverUrl: currentMangaData.coverUrl,
        timestamp: Date.now()
      };
      await localforage.setItem('r34_manga_progress', progressObj);
      if (typeof renderMangaHistory === 'function') renderMangaHistory();
    }

    const pageUrl = `${MD_API_BASE}/at-home/server/${chapterId}`;
    let pageData;

    try {
      const pageRes = await fetch(pageUrl);
      pageData = await pageRes.json();
    } catch (err) {
      console.warn("Direct at-home/server fetch failed due to CORS.");
      mangaPagesContainer.innerHTML = '<p class="text-danger mt-4"><strong>CORS Error:</strong> MangaDex restricts local development IPs. Please change your address bar from <code>127.0.0.1</code> to <code>localhost</code> and try again. (Note: This issue only happens locally and will not happen once you publish the site to a real domain!).</p>';
      return;
    }

    mangaPagesContainer.innerHTML = '';
    const baseUrl = pageData.baseUrl;
    const hash = pageData.chapter.hash;
    const isHQ = mangaHqToggle && mangaHqToggle.checked;
    const pages = isHQ ? pageData.chapter.data : pageData.chapter.dataSaver;
    const qualityFolder = isHQ ? 'data' : 'data-saver';

    window.currentMangaPreloadSession = Date.now();
    const mySession = window.currentMangaPreloadSession;
    let preloadQueue = [];

    const isPaged = mangaPagedToggle && mangaPagedToggle.checked;

    pages.forEach((p, idx) => {
      let url = `${baseUrl}/${qualityFolder}/${hash}/${p}`;

      const img = document.createElement('img');
      // Instantly load first 3 pages. For the rest, only set data-src
      if (idx < 3) {
        img.src = url;
        img.loading = 'eager';
      } else {
        img.dataset.src = url;
        preloadQueue.push(img);
      }

      if (isPaged) {
        if (idx !== 0) img.style.display = 'none';
        img.style.maxHeight = 'calc(100vh - 40px)';
        img.style.objectFit = 'contain';
        img.style.cursor = 'pointer';
        
        img.onclick = (e) => {
          const rect = img.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          if (clickX > rect.width / 2) {
             const nextImg = mangaPagesContainer.querySelectorAll('img')[idx + 1];
             if (nextImg) {
                img.style.display = 'none';
                nextImg.style.display = 'block';
                if (nextImg.dataset.src) {
                    nextImg.src = nextImg.dataset.src;
                    nextImg.dataset.src = '';
                }
             } else {
                const nextBtn = navContainer.querySelector('button.manga-nav-next');
                if(nextBtn) nextBtn.click();
             }
          } else {
             const prevImg = mangaPagesContainer.querySelectorAll('img')[idx - 1];
             if (prevImg) {
                img.style.display = 'none';
                prevImg.style.display = 'block';
             } else {
                const prevBtn = navContainer.querySelector('button.manga-nav-prev');
                if(prevBtn) prevBtn.click();
             }
          }
        };
      } else {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.marginBottom = '10px';
      }

      img.onerror = () => {
        // Fallback to high quality if data-saver is missing/404s
        if (img.src && img.src.includes('/data-saver/')) {
          console.log("Data-saver failed (404), falling back to high quality data...");
          const hqFile = pageData.chapter.data[idx];
          img.src = `${baseUrl}/data/${hash}/${hqFile}`;
          return;
        }

        // If QUIC or connection fails, attempt a retry to force a new TCP connection
        if (img.src && !img.src.includes('?retry') && img.src !== window.location.href) {
          console.log("Retrying image load to bypass potential QUIC protocol drop...");
          const retryUrl = img.src.split('?')[0];
          setTimeout(() => { img.src = retryUrl + "?retry=1"; }, 1000);
        }
      };

      // If user scrolls to a page that hasn't preloaded yet, load it instantly
      const scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && img.dataset.src) {
            img.src = img.dataset.src;
            img.dataset.src = '';
          }
        });
      }, { rootMargin: '1000px' });
      scrollObserver.observe(img);

      mangaPagesContainer.appendChild(img);
    });

    // Add Chapter Navigation Controls
    const navContainer = document.createElement('div');
    navContainer.style.display = 'flex';
    navContainer.style.justifyContent = 'center';
    navContainer.style.gap = '20px';
    navContainer.style.marginTop = '40px';
    navContainer.style.marginBottom = '60px';
    navContainer.style.width = '100%';

    const currentIndex = currentMangaData.chaptersQueue.indexOf(chapterId);
    const prevId = currentIndex > 0 ? currentMangaData.chaptersQueue[currentIndex - 1] : null;
    const nextId = currentIndex < currentMangaData.chaptersQueue.length - 1 ? currentMangaData.chaptersQueue[currentIndex + 1] : null;

    const btnStyle = 'background: #8b5cf6; color: white; border: none; padding: 12px 24px; border-radius: 30px; cursor: pointer; font-weight: bold; font-size: 1rem; transition: background 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);';

    if (prevId) {
      const prevBtn = document.createElement('button');
      prevBtn.textContent = '← Previous Chapter';
      prevBtn.className = 'manga-nav-prev';
      prevBtn.style.cssText = btnStyle;
      prevBtn.onmouseover = () => prevBtn.style.background = '#7c3aed';
      prevBtn.onmouseout = () => prevBtn.style.background = '#8b5cf6';
      prevBtn.onclick = () => {
        mangaReader.scrollTo({top: 0, behavior: 'smooth'});
        loadMangaChapter(prevId);
      };
      navContainer.appendChild(prevBtn);
    }
    
    if (nextId) {
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next Chapter →';
      nextBtn.className = 'manga-nav-next';
      nextBtn.style.cssText = btnStyle;
      nextBtn.onmouseover = () => nextBtn.style.background = '#7c3aed';
      nextBtn.onmouseout = () => nextBtn.style.background = '#8b5cf6';
      nextBtn.onclick = () => {
        mangaReader.scrollTo({top: 0, behavior: 'smooth'});
        loadMangaChapter(nextId);
      };
      navContainer.appendChild(nextBtn);
    } else {
      const finishBtn = document.createElement('button');
      finishBtn.textContent = 'End of Available Chapters';
      finishBtn.style.cssText = btnStyle;
      finishBtn.style.background = '#374151';
      finishBtn.style.cursor = 'default';
      navContainer.appendChild(finishBtn);
    }

    mangaPagesContainer.appendChild(navContainer);

    // Background sequential preloader
    async function processMangaQueue() {
      while (preloadQueue.length > 0 && window.currentMangaPreloadSession === mySession) {
        const imgEl = preloadQueue.shift();
        if (!imgEl || !imgEl.dataset.src) continue; // Already loaded via scroll

        await new Promise(resolve => {
          imgEl.onload = resolve;
          imgEl.onerror = resolve; // Continue even if one fails
          imgEl.src = imgEl.dataset.src;
          imgEl.dataset.src = '';
        });
      }
    }

    // Start background preloader without blocking
    processMangaQueue();

    // Chapter Chaining Button
    if (currentMangaData && currentMangaData.chaptersQueue) {
        const queue = currentMangaData.chaptersQueue;
        const currentIndex = queue.indexOf(chapterId);
        if (currentIndex !== -1 && currentIndex < queue.length - 1) {
            const nextChapId = queue[currentIndex + 1];
            
            const nextBtn = document.createElement('button');
            nextBtn.className = 'expanded-btn';
            nextBtn.style.cssText = 'display: block; width: 100%; max-width: 400px; margin: 40px auto; padding: 20px; font-size: 1.2rem; background: var(--accent-purple); color: white; border: none; border-radius: 12px; cursor: pointer; box-shadow: 0 10px 20px rgba(0,0,0,0.5); font-family: "Space Grotesk", sans-serif;';
            nextBtn.textContent = 'Next Chapter →';
            nextBtn.onclick = () => {
                mangaPagesContainer.scrollTop = 0;
                loadMangaChapter(nextChapId);
            };
            
            mangaPagesContainer.appendChild(nextBtn);
        } else if (currentIndex === queue.length - 1) {
            const endMsg = document.createElement('div');
            endMsg.style.cssText = 'text-align: center; color: var(--muted); margin: 40px 0; font-style: italic;';
            endMsg.textContent = 'End of available chapters.';
            mangaPagesContainer.appendChild(endMsg);
        }
    }

  } catch (e) {
    mangaPagesContainer.innerHTML = '<p class="text-danger">Failed to load chapter pages.</p>';
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

async function renderMangaHistory() {
  const historyContainer = document.getElementById('manga-history');
  const historyList = document.getElementById('manga-history-list');
  if (!historyContainer || !historyList) return;

  const progressObj = (await localforage.getItem('r34_manga_progress')) || {};
  
  // Convert object to array and filter out old format strings
  const historyItems = Object.entries(progressObj)
    .filter(([mangaId, data]) => typeof data === 'object' && data !== null)
    .map(([mangaId, data]) => ({
      mangaId,
      ...data
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (historyItems.length === 0) {
    historyContainer.style.display = 'none';
    return;
  }

  historyContainer.style.display = 'block';
  historyList.innerHTML = '';

  historyItems.forEach(item => {
    const card = document.createElement('div');
    card.style.cssText = 'background: var(--surface); border-radius: 8px; border: 1px solid var(--border); overflow: hidden; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; padding: 8px; gap: 12px;';
    card.onmouseover = () => { card.style.background = 'var(--surface-hover)'; };
    card.onmouseout = () => { card.style.background = 'var(--surface)'; };
    
    card.onclick = () => {
      const searchInput = document.getElementById('manga-grid-search-input');
      const searchBtn = document.getElementById('manga-grid-search-btn');
      if (searchInput && searchBtn) {
        searchInput.value = item.mangaId;
        searchBtn.click();
      }
    };

    const img = document.createElement('img');
    img.src = item.coverUrl;
    img.style.cssText = 'width: 60px; height: 80px; object-fit: cover; border-radius: 4px; flex-shrink: 0;';
    img.onerror = () => { img.src = 'https://via.placeholder.com/60x80?text=No+Cover'; };

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size: 0.85rem; font-weight: bold; color: var(--text); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.3; flex: 1;';
    titleEl.textContent = item.title || 'Unknown Title';

    card.appendChild(img);
    card.appendChild(titleEl);
    historyList.appendChild(card);
  });
}

// Initial render
document.addEventListener('DOMContentLoaded', () => {
  renderMangaHistory();
  renderMangaLibrary();
});

async function renderMangaLibrary() {
    const libBox = document.getElementById('manga-library');
    const libList = document.getElementById('manga-library-list');
    if (!libBox || !libList) return;
    
    const favsObj = (await localforage.getItem('r34_manga_favorites')) || {};
    const favsArr = Object.values(favsObj).sort((a, b) => b.timestamp - a.timestamp);
    
    if (favsArr.length === 0) {
        libBox.style.display = 'none';
        return;
    }
    
    libBox.style.display = 'block';
    libList.innerHTML = '';
    
    favsArr.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = 'background: var(--surface); border-radius: 8px; border: 1px solid var(--border); overflow: hidden; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; padding: 8px; gap: 12px;';
        card.onmouseover = () => { card.style.background = 'var(--surface-hover)'; };
        card.onmouseout = () => { card.style.background = 'var(--surface)'; };
        
        card.onclick = () => {
            const searchInput = document.getElementById('manga-grid-search-input');
            const searchBtn = document.getElementById('manga-grid-search-btn');
            if (searchInput && searchBtn) {
              searchInput.value = item.id;
              searchBtn.click();
            }
        };

        const img = document.createElement('img');
        img.src = item.coverUrl;
        img.style.cssText = 'width: 60px; height: 80px; object-fit: cover; border-radius: 4px; flex-shrink: 0;';
        img.onerror = () => { img.src = 'https://via.placeholder.com/60x80?text=No+Cover'; };

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size: 0.85rem; font-weight: bold; color: var(--text); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.3; flex: 1;';
        titleEl.textContent = item.title || 'Unknown Title';

        card.appendChild(img);
        card.appendChild(titleEl);
        libList.appendChild(card);
    });
}

// Ensure library is rendered when navigating to Manga tab
const mangaViewObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target.id === 'view-manga' && mutation.target.style.display !== 'none') {
       if (typeof renderMangaHistory === 'function') renderMangaHistory();
       if (typeof renderMangaLibrary === 'function') renderMangaLibrary();
    }
  });
});
const viewMangaEl = document.getElementById('view-manga');
if (viewMangaEl) {
  mangaViewObserver.observe(viewMangaEl, { attributes: true, attributeFilter: ['style'] });
}