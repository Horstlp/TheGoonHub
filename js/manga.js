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

async function initMdTags() {
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(`${MD_API_BASE}/manga/tag`), mdFetchOptions);
    const data = await res.json();
    if (data && data.data) {
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
  let url = `${MD_API_BASE}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art`;
  
  // Custom Tag Parsing Engine
  let parsedTitle = titleQuery.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(parsedTitle)) {
      url += `&ids[]=${parsedTitle}`;
  } else {
      let includedTags = [];
      let excludedTags = [];
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
          } else {
              remainingTitleTokens.push(token);
          }
      });

      // Read UI controls
      const sortSelect = document.getElementById('manga-sort-select');
      if (sortSelect) {
          const val = sortSelect.value;
          if (val === 'rating') orderQuery = '&order[rating]=desc';
          else if (val === 'latest') orderQuery = '&order[latestUploadedChapter]=desc';
          else if (val === 'popular') orderQuery = '&order[followedCount]=desc';
          else if (val === 'new') orderQuery = '&order[createdAt]=desc';
          else if (val === 'relevance') orderQuery = '&order[relevance]=desc';
      }

      const ratingCbs = document.querySelectorAll('.manga-rating-cb');
      if (ratingCbs.length > 0) {
          ratingCbs.forEach(cb => {
              if (cb.checked) ratings.push(cb.value);
          });
      }

      if (ratings.length === 0) ratings = ['erotica', 'pornographic'];
      
      ratings.forEach(r => url += `&contentRating[]=${r}`);
      statuses.forEach(s => url += `&status[]=${s}`);
      demos.forEach(d => url += `&publicationDemographic[]=${d}`);
      includedTags.forEach(id => url += `&includedTags[]=${id}`);
      excludedTags.forEach(id => url += `&excludedTags[]=${id}`);
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

    const folderWrapper = document.createElement('div');
    folderWrapper.className = 'custom-select-wrapper';

    const folderBtn = document.createElement('button');
    folderBtn.className = 'pinterest-folder-select';

    const folderList = document.createElement('ul');
    folderList.className = 'custom-options-list card-folder-list';

    const suggestedInit = typeof suggestFolderForPost === 'function'
      ? suggestFolderForPost(post)
      : ((typeof getVaultFolders === 'function' ? getVaultFolders() : (vaultedFolders || []))[0] || 'Saved');

    folderBtn.textContent = suggestedInit;
    folderWrapper.dataset.value = suggestedInit;

    // Helper: (re)build the folder list from the live folder array each time the dropdown opens
    const refreshFolderList = () => {
      const currentFolders = typeof getVaultFolders === 'function' ? getVaultFolders() : (vaultedFolders || []);
      const currentValue = folderWrapper.dataset.value;
      folderList.innerHTML = '';

      const folderSet = new Set(currentFolders);
      folderSet.add(currentValue);

      Array.from(folderSet).forEach(f => {
        let folderPost = null;
        for (let i = vaultedPosts.length - 1; i >= 0; i--) {
          if ((vaultedPosts[i].folder || 'Default') === f) {
            folderPost = vaultedPosts[i];
            break;
          }
        }
        const thumbUrl = folderPost ? (folderPost.preview_url || folderPost.sample_url || folderPost.file_url) : null;

        const li = document.createElement('li');
        li.className = 'folder-dropdown-item';
        if (f === currentValue) li.classList.add('selected');

        const label = document.createElement('span');
        label.className = 'folder-dropdown-label';
        label.textContent = f;
        li.appendChild(label);

        if (thumbUrl) {
          const img = document.createElement('img');
          img.src = thumbUrl;
          img.className = 'folder-dropdown-thumb';
          img.loading = 'lazy';
          img.draggable = false;
          li.appendChild(img);
        } else {
          const placeholder = document.createElement('div');
          placeholder.className = 'folder-dropdown-thumb folder-thumb-placeholder';
          placeholder.textContent = f.charAt(0).toUpperCase();
          li.appendChild(placeholder);
        }

        li.addEventListener('click', (e) => {
          e.stopPropagation();
          folderWrapper.dataset.value = f;
          folderBtn.textContent = f;
          folderList.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
          li.classList.add('selected');
          folderWrapper.classList.remove('open');
          folderList.classList.remove('open');
          
          if (typeof savePostToFolder === 'function') {
            savePostToFolder(post, f, saveBtn);
          }
        });
        folderList.appendChild(li);
      });
    };

    // Initial populate
    refreshFolderList();

    folderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpening = !folderList.classList.contains('open');
      if (isOpening) refreshFolderList(); // always up-to-date when opening
      folderList.classList.toggle('open');
      folderWrapper.classList.toggle('open'); // keep caret animation
    });

    folderWrapper.appendChild(folderBtn);
    // folderList goes on saveWidget so it can stretch full width

    const saveBtn = document.createElement('button');
    saveBtn.className = 'pinterest-save-btn';
    const isSaved = vaultedPosts.some(p => String(p.id) === String(post.id));
    if (isSaved) saveBtn.classList.add('saved');
    saveBtn.textContent = isSaved ? 'Saved' : 'Merken';

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof savePostToFolder === 'function') {
        savePostToFolder(post, folderWrapper.dataset.value, saveBtn);
      }
    });

    saveWidget.appendChild(folderWrapper);
    saveWidget.appendChild(saveBtn);
    saveWidget.appendChild(folderList); // appended last so it layers on top
    card.appendChild(saveWidget);

    card.addEventListener('mouseleave', () => {
      folderList.classList.remove('open');
      folderWrapper.classList.remove('open');
    });

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
  // Clear the container and override its layout class to the bookshelf
  targetContainer.innerHTML = '';
  targetContainer.className = 'bookshelf-container';

  let needsReSave = false;

  for (const post of data) {
    const manga = post.mangaObject;
    if (!manga) continue;

    // Check if we need to fetch volumeCount from MangaDex Aggregate API
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

    // For absurdly long manga (like One Piece with 100+ vols), cap it so it doesn't break UI
    const actualVols = manga.attributes.volumeCount || 1;
    const renderVols = Math.min(actualVols, 30);

    const title = getMdTitle(manga);
    const coverUrl = post.preview_url;

    // Create the group container for this manga series
    const group = document.createElement('div');
    group.className = 'manga-spine-group';

    // Add tooltip showing full cover
    const tooltip = document.createElement('div');
    tooltip.className = 'manga-shelf-tooltip';
    tooltip.innerHTML = `
      <img src="${coverUrl}" alt="Cover">
      <h4>${title}</h4>
      <p>${actualVols} Volume${actualVols !== 1 ? 's' : ''}</p>
    `;
    group.appendChild(tooltip);

    // Render the spines for each volume
    for (let i = 1; i <= renderVols; i++) {
      const spine = document.createElement('div');
      spine.className = 'manga-spine';

      // Darken the background slightly so the white text pops, and shift it
      spine.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${coverUrl})`;
      spine.style.backgroundPosition = `${i * 15}px center`; // Shift background for variety

      const titleEl = document.createElement('div');
      titleEl.className = 'manga-spine-title';
      titleEl.textContent = title;

      const volEl = document.createElement('div');
      volEl.className = 'manga-spine-vol';
      volEl.textContent = i;

      spine.appendChild(titleEl);
      spine.appendChild(volEl);

      spine.addEventListener('click', () => {
         openInlineMangaExpansion(post, group, targetContainer);
       });

      group.appendChild(spine);
    }

    // If it was capped, add a small indicator
    if (actualVols > 30) {
      const ellipsis = document.createElement('div');
      ellipsis.style.color = 'var(--muted)';
      ellipsis.style.marginLeft = '4px';
      ellipsis.style.alignSelf = 'center';
      ellipsis.textContent = `+${actualVols - 30} more...`;
      group.appendChild(ellipsis);
    }

    targetContainer.appendChild(group);
  }

  if (needsReSave && typeof localforage !== 'undefined') {
    localforage.setItem('r34_vault_v2', vaultedPosts);
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

async function openInlineMangaExpansion(post, clickedElement, container) {
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
  const langs = ['en', 'es-la', 'es', 'fr', 'ja', 'zh', 'ko', 'pt-br', 'ru'];
  langs.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l; opt.textContent = l.toUpperCase();
    langSelect.appendChild(opt);
  });
  langSelect.value = localStorage.getItem('r34_manga_lang') || 'en';
  chapHeader.appendChild(langSelect);
  chaptersCol.appendChild(chapHeader);

  const chapList = document.createElement('div');
  chapList.className = 'chapters-list';
  chapList.innerHTML = '<span class="text-muted">Loading chapters...</span>';
  chaptersCol.appendChild(chapList);
  
  expanded.appendChild(chaptersCol);

  // Hide original card and inject inline
  clickedElement.style.display = 'none';
  container.insertBefore(expanded, clickedElement);
  
  if (typeof masonryObserver !== 'undefined') {
    masonryObserver.observe(expanded);
  }
  
  expanded.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 4. Fetch Volumes & Preload Pages
  async function fetchVolumesForExpansion(lang) {
    chapList.innerHTML = '<span class="text-muted">Loading volumes...</span>';
    try {
      // Fetch aggregate for chapters and volumes
      const aggRes = await throttledFetch(PROXY + encodeURIComponent(`https://api.mangadex.org/manga/${post.id}/aggregate?translatedLanguage[]=${lang}`));
      const aggData = await aggRes.json();
      
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

  fetchVolumesForExpansion(langSelect.value);

  langSelect.addEventListener('change', () => {
    localStorage.setItem('r34_manga_lang', langSelect.value);
    fetchVolumesForExpansion(langSelect.value);
  });
}


// Manga Pill Logic
let mangaTagsArray = [];
const mangaTagPillsList = document.getElementById('manga-tag-pills-list');

function applyMangaModifier(index, prefix) {
  let pureTag = mangaTagsArray[index].replace(/^[-]?tag:/, '');
  if (prefix) {
      mangaTagsArray[index] = `${prefix}${pureTag}`;
  } else {
      mangaTagsArray[index] = pureTag;
  }
  renderMangaPills();
  doMangaSearch();
}

function renderMangaPills() {
  if (!mangaTagPillsList) return;
  mangaTagPillsList.innerHTML = '';
  mangaTagsArray.forEach((tag, index) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    
    if (tag.includes(':') || tag.startsWith('-')) {
        pill.style.background = 'rgba(139, 92, 246, 0.2)';
        pill.style.borderColor = 'var(--accent-purple)';
        pill.style.color = '#c084fc';
    }
    
    const removeBtn = document.createElement('span');
    removeBtn.textContent = '×';
    removeBtn.className = 'remove-btn';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeMangaPill(index);
      doMangaSearch();
    });
    
    pill.appendChild(removeBtn);

    // Interactive Menu
    const menu = document.createElement('div');
    menu.className = 'tag-menu';
    const modifiers = [
      { label: 'Title (Text)', prefix: '' },
      { label: 'Include Tag (+)', prefix: 'tag:' },
      { label: 'Exclude Tag (-)', prefix: '-tag:' }
    ];
    modifiers.forEach(mod => {
      const item = document.createElement('button');
      item.className = 'tag-menu-item';
      item.textContent = mod.label;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        applyMangaModifier(index, mod.prefix);
        menu.classList.remove('show');
      });
      menu.appendChild(item);
    });
    
    pill.appendChild(menu);
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.tag-menu').forEach(m => { if(m !== menu) m.classList.remove('show'); });
      menu.classList.toggle('show');
    });

    mangaTagPillsList.appendChild(pill);
  });

  
  if (mangaGridSearchInput) {
      mangaGridSearchInput.placeholder = mangaTagsArray.length > 0 ? '' : 'Add modifiers (e.g. tag:yuri) or search titles...';
  }
}

function addMangaPill(value) {
  let clean = value.trim();
  if (!clean) return;
  const parts = clean.split(/\s+/);
  parts.forEach(p => {
    if (p && !mangaTagsArray.includes(p)) mangaTagsArray.push(p);
  });
  renderMangaPills();
  if (mangaGridSearchInput) mangaGridSearchInput.value = '';
}

function removeMangaPill(index) {
  mangaTagsArray.splice(index, 1);
  renderMangaPills();
}

function doMangaSearch() {
  if (mangaGridSearchInput.value.trim() !== '') {
      addMangaPill(mangaGridSearchInput.value);
  }
  currentMangaGridTags = mangaTagsArray.join(' ');
  currentMangaGridPage = 1;
  searchMangaGrid(currentMangaGridTags, currentMangaGridPage, false);
}

mangaGridSearchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    doMangaSearch();
});

mangaGridSearchInput.addEventListener('keydown', (e) => {
  const val = mangaGridSearchInput.value;
  if (e.key === 'Enter') {
      e.preventDefault();
      doMangaSearch();
  } else if (e.key === 'Backspace' && val === '' && mangaTagsArray.length > 0) {
      removeMangaPill(mangaTagsArray.length - 1);
      doMangaSearch();
  } else if (e.key === ' ' && val.trim().includes(':')) {
      e.preventDefault();
      addMangaPill(val);
  }
});

const mangaRandomBtn = document.getElementById('manga-random-btn');
if (mangaRandomBtn) {
  mangaRandomBtn.addEventListener('click', async () => {
    try {
      mangaRandomBtn.disabled = true;
      mangaRandomBtn.textContent = '🎲 ...';
      const url = `${MD_API_BASE}/manga/random?contentRating[]=erotica&contentRating[]=pornographic&includes[]=cover_art`;
      const res = await fetch(PROXY + encodeURIComponent(url), mdFetchOptions);
      const data = await res.json();
      if (data && data.data && data.data.id) {
        mangaGridSearchInput.value = data.data.id;
        doMangaSearch();
      }
    } catch(e) {
      console.error(e);
    } finally {
      mangaRandomBtn.disabled = false;
      mangaRandomBtn.textContent = '🎲 Random';
    }
  });
}

// UI Controls logic
const mangaSortSelect = document.getElementById('manga-sort-select');
if (mangaSortSelect) {
    mangaSortSelect.addEventListener('change', doMangaSearch);
}

const mangaRatingBtn = document.getElementById('manga-rating-btn');
const mangaRatingMenu = document.getElementById('manga-rating-menu');
const mangaRatingCbs = document.querySelectorAll('.manga-rating-cb');

if (mangaRatingBtn) {
    mangaRatingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mangaRatingMenu.style.display = mangaRatingMenu.style.display === 'none' ? 'flex' : 'none';
    });
}
if (mangaRatingMenu) {
    mangaRatingMenu.addEventListener('click', (e) => e.stopPropagation());
    mangaRatingCbs.forEach(cb => {
        cb.addEventListener('change', () => {
            let count = 0;
            mangaRatingCbs.forEach(c => { if(c.checked) count++; });
            mangaRatingBtn.innerHTML = `<span>🔞 Ratings (${count})</span> <span class="text-xs">▼</span>`;
            doMangaSearch();
        });
    });
}
document.addEventListener('click', () => {
    if (mangaRatingMenu) mangaRatingMenu.style.display = 'none';
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
  mangaChapterList.innerHTML = '<div class="spinner"></div><span class="text-muted text-sm">Loading chapters...</span>';
  const lang = mangaLangSelect.value;
  const feedUrl = `${MD_API_BASE}/manga/${mangaId}/feed?translatedLanguage[]=${lang}&order[volume]=desc&order[chapter]=desc&limit=500`;

  try {
    const feedRes = await throttledFetch(PROXY + encodeURIComponent(feedUrl), mdFetchOptions);
    const feedData = await feedRes.json();
    currentMangaData.chapters = feedData.data || [];

    mangaChapterList.innerHTML = '';
    if (currentMangaData.chapters.length === 0) {
      mangaChapterList.innerHTML = `<span class="text-muted text-sm">No chapters found for selected language.</span>`;
      return;
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

      btn.onclick = () => loadMangaChapter(chap.id);

      mangaChapterList.appendChild(btn);
    });
  } catch (e) {
    mangaChapterList.innerHTML = `<span class="text-danger text-sm">Failed to load chapter feed.</span>`;
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
        // If QUIC or connection fails, attempt a retry to force a new TCP connection
        if (img.src && !img.src.includes('?retry') && img.src !== window.location.href) {
          console.log("Retrying image load to bypass potential QUIC protocol drop...");
          setTimeout(() => { img.src = url + "?retry=1"; }, 1000);
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