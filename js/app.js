let currentTags = '';
let currentPage = 0;
let cachedPosts = [];    
let currentPostIndex = -1; 

let tagsArray = [];
let autocompleteTimeout;
let activeSuggestionIdx = -1;
let activePrefixModifier = ''; 
const tagCategoriesMap = new Map();
let isViewingVault  = false;
let isLoading = false; // State to prevent multiple simultaneous loads
let hasMore = true; // State to track if there are more results to load

const searchContainer   = document.getElementById('search-container');
const tagPillsList      = document.getElementById('tag-pills-list');
const input             = document.getElementById('search-input');
const autocompleteBox   = document.getElementById('autocomplete-box');
const btn              = document.getElementById('search-btn');
const timeframeSelect   = document.getElementById('timeframe-select');
const sortSelect        = document.getElementById('sort-select');
const grid             = document.getElementById('grid');
const statusEl         = document.getElementById('status');
const metaRow          = document.getElementById('meta-row');
const resultCount      = document.getElementById('result-count');
const activeFilters    = document.getElementById('active-filters'); // Keep this for filter badges
const paginationBox    = document.getElementById('pagination-controls-box');
const scrollSentinel   = document.getElementById('scroll-sentinel'); // Element to observe for infinite scroll
const vaultToggleBtn   = document.getElementById('vault-toggle');

const lightbox         = document.getElementById('lightbox');
const lbContainer      = document.getElementById('lightbox-media-container');
const lbClose          = document.getElementById('lightbox-close');
const lbPrevBtn        = document.getElementById('lb-prev-btn');
const lbNextBtn        = document.getElementById('lb-next-btn');
const lbScore          = document.getElementById('lb-score');
const lbSize           = document.getElementById('lb-size');
const lbFavBtn         = document.getElementById('lb-fav-btn');
const lbDlBtn          = document.getElementById('lb-dl-btn');
const lbTagsStreamBox  = document.getElementById('lb-tags-stream-box');
const toast            = document.getElementById('toast');

let toastTimer;
function triggerToastNotification(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

/** Masonry Calculation Engine **/
function resizeGridItem(item) {
  const rowHeight = 10; // Matches grid-auto-rows in CSS
  const rowGap = 16;    // Matches gap in CSS
  
  // Calculate how many 10px rows the card needs to fit its content
  const rowSpan = Math.ceil((item.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap));
  item.style.gridRowEnd = `span ${rowSpan}`;
}

const masonryObserver = new ResizeObserver(entries => {
  for (let entry of entries) {
    resizeGridItem(entry.target);
  }
});

/** Infinite Scroll Observer **/
const handleScroll = debounce((entries) => {
  if (entries[0].isIntersecting && !isLoading && hasMore && !isViewingVault && currentTags !== '') {
    if(typeof loadNextPage === 'function') loadNextPage();
  }
}, 250);

const scrollObserver = new IntersectionObserver(handleScroll, { 
  rootMargin: '400px' 
});

scrollObserver.observe(scrollSentinel);

searchContainer.addEventListener('click', (e) => {
  if(e.target === searchContainer || e.target === tagPillsList) {
    input.focus();
  }
});

function renderPills() {
  tagPillsList.innerHTML = '';
  tagsArray.forEach((tag, index) => {
    const pill = document.createElement('div');
    pill.className = 'tag-pill';
    
    const pureCleanTag = tag.replace(/^[-]/, '').replace(/[~*]$/, '');
    const categoryType = tagCategoriesMap.get(pureCleanTag) || 'general';
    pill.classList.add(`type-${categoryType}`);
    
    pill.textContent = tag + ' ';

    const closeBtn = document.createElement('span');
    closeBtn.className = 'pill-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePill(index);
    });
    pill.appendChild(closeBtn);

    const menu = document.createElement('div');
    menu.className = 'tag-menu';
    
    const modifiers = [
      { label: 'Normal', prefix: '', suffix: '' },
      { label: 'Exclude (-)', prefix: '-', suffix: '' },
      { label: 'Fuzzy (~)', prefix: '', suffix: '~' },
      { label: 'Wildcard (*)', prefix: '', suffix: '*' }
    ];

    modifiers.forEach(mod => {
      const item = document.createElement('button');
      item.className = 'tag-menu-item';
      item.textContent = mod.label;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        applyModifier(index, mod.prefix, mod.suffix);
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
    tagPillsList.appendChild(pill);
  });
  input.placeholder = tagsArray.length > 0 ? '' : 'Add tags...';
}

function addPill(value) {
  let clean = value.trim();
  if (!clean) return;
  const parts = clean.split(/\s+/);
  parts.forEach(p => {
    if (p && !tagsArray.includes(p)) {
      tagsArray.push(p);
    }
  });
  renderPills();
  input.value = '';
  hideAutocomplete();
}

function removePill(index) {
  tagsArray.splice(index, 1);
  renderPills();
}

function applyModifier(index, prefix, suffix) {
  let pureTag = tagsArray[index].replace(/^[-]/, '').replace(/[~*]$/, '');
  tagsArray[index] = `${prefix}${pureTag}${suffix}`;
  renderPills();
}

input.addEventListener('input', () => {
  clearTimeout(autocompleteTimeout);
  let text = input.value.trim();
  activePrefixModifier = '';
  if (text.startsWith('-') || text.startsWith('~')) {
    activePrefixModifier = text.charAt(0);
    text = text.slice(1).trim();
  }
  if (text.length < 2) {
    hideAutocomplete();
    return;
  }
  autocompleteTimeout = setTimeout(() => queryAutocomplete(text), 200);
});

function renderSuggestions(items) {
  autocompleteBox.innerHTML = '';
  if (!items || items.length === 0) {
    hideAutocomplete();
    return;
  }
  activeSuggestionIdx = -1;
  items.forEach((item) => {
    const value = item.value || item.name || item;
    const labelStr = item.label || '';
    const countLabel = labelStr.includes('(') ? `(${labelStr.split('(').pop()}` : '';
    let category = item.type || 'general';
    if(labelStr.includes('(character)')) category = 'character';
    else if(labelStr.includes('(artist)')) category = 'artist';
    else if(labelStr.includes('(copyright)')) category = 'copyright';
    tagCategoriesMap.set(value, category);
    const row = document.createElement('div');
    row.className = 'autocomplete-item';
    const textSpan = document.createElement('span');
    textSpan.textContent = value;
    row.appendChild(textSpan);
    if (countLabel) {
      const countSpan = document.createElement('span');
      countSpan.style.color = 'var(--muted)';
      countSpan.style.fontSize = '0.8rem';
      countSpan.textContent = countLabel;
      row.appendChild(countSpan);
    }
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      addPill(activePrefixModifier + value);
      input.focus();
    });
    autocompleteBox.appendChild(row);
  });
  autocompleteBox.classList.add('show');
}

function hideAutocomplete() {
  autocompleteBox.classList.remove('show');
  autocompleteBox.innerHTML = '';
  activeSuggestionIdx = -1;
}

function highlightSuggestion(items) {
  items.forEach((item, idx) => {
    item.classList.toggle('active', idx === activeSuggestionIdx);
    if(idx === activeSuggestionIdx) item.scrollIntoView({ block: 'nearest' });
  });
}

input.addEventListener('keydown', (e) => {
  const items = autocompleteBox.querySelectorAll('.autocomplete-item');
  const isDropdownVisible = autocompleteBox.classList.contains('show') && items.length > 0;
  if (isDropdownVisible) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeSuggestionIdx = (activeSuggestionIdx + 1) % items.length;
      highlightSuggestion(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeSuggestionIdx = (activeSuggestionIdx - 1 + items.length) % items.length;
      highlightSuggestion(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIdx >= 0) {
        const chosenText = items[activeSuggestionIdx].querySelector('span').textContent;
        addPill(activePrefixModifier + chosenText);
      } else {
        addPill(input.value);
      }
    } else if (e.key === 'Escape') hideAutocomplete();
  } else {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      addPill(input.value);
    } else if (e.key === 'Backspace' && input.value === '' && tagsArray.length > 0) {
      removePill(tagsArray.length - 1);
    }
  }
});

const helpersToggle = document.getElementById('helpers-toggle');
const helpersPanel  = document.getElementById('helpers-panel');
const historyToggle = document.getElementById('history-toggle');
const historyPanel  = document.getElementById('history-panel');

helpersToggle.addEventListener('click', () => {
  historyPanel.classList.remove('open');
  historyToggle.classList.remove('open');
  const open = helpersPanel.classList.toggle('open');
  helpersToggle.classList.toggle('open', open);
});

historyToggle.addEventListener('click', () => {
  helpersPanel.classList.remove('open');
  helpersToggle.classList.remove('open');
  const open = historyPanel.classList.toggle('open');
  historyToggle.classList.toggle('open', open);
  if(open) renderHistoryAndPins();
});

function renderHistoryAndPins() {
  const recentBox = document.getElementById('recent-chips-box');
  const pinnedBox = document.getElementById('pinned-chips-box');
  recentBox.innerHTML = recentSearches.length === 0 ? '<span style="color:var(--muted); font-size:0.8rem; padding:4px 0;">No searches logged yet</span>' : '';
  pinnedBox.innerHTML = pinnedSearches.length === 0 ? '<span style="color:var(--muted); font-size:0.8rem; padding:4px 0;">No pinned setups setup yet</span>' : '';
  recentSearches.forEach(str => {
    const isPinned = pinnedSearches.includes(str);
    const row = document.createElement('div');
    row.className = 'chip history-item';
    const txt = document.createElement('span');
    txt.className = 'chip-syntax';
    txt.textContent = str;
    txt.addEventListener('click', () => loadSavedSearch(str));
    row.appendChild(txt);
    const pin = document.createElement('span');
    pin.className = 'history-pin-btn';
    pin.textContent = isPinned ? '📌' : '🤍';
    pin.addEventListener('click', (e) => { e.stopPropagation(); togglePinSearch(str); });
    row.appendChild(pin);
    recentBox.appendChild(row);
  });
  pinnedSearches.forEach(str => {
    const row = document.createElement('div');
    row.className = 'chip history-item';
    row.style.borderColor = 'var(--accent)';
    const txt = document.createElement('span');
    txt.className = 'chip-syntax';
    txt.style.color = '#c084fc';
    txt.textContent = str;
    txt.addEventListener('click', () => loadSavedSearch(str));
    row.appendChild(txt);
    const pin = document.createElement('span');
    pin.className = 'history-pin-btn';
    pin.textContent = '❌';
    pin.addEventListener('click', (e) => { e.stopPropagation(); togglePinSearch(str); });
    row.appendChild(pin);
    pinnedBox.appendChild(row);
  });
}

function loadSavedSearch(str) {
  tagsArray = str.split(/\s+/).filter(Boolean);
  renderPills();
  historyPanel.classList.remove('open');
  historyToggle.classList.remove('open');
  disableVaultViewMode();
  doSearch();
}

function renderFilterBadges(days, sortVal) {
  const badges = [];
  if(isViewingVault) {
    badges.push(`🔒 Saved Storage Mode`);
    activeFilters.innerHTML = badges.map(b => `<span class="meta-badge" style="background:rgba(244,63,94,0.15); border-color:#f43f5e; color:#fb7185">${b}</span>`).join(' ');
    return;
  }
  if (days !== 'all') badges.push(`📅 ${timeframeSelect.options[timeframeSelect.selectedIndex].text.replace(/^.+ /,'')}`);
  if (sortVal) badges.push(`⚙️ ${sortSelect.options[sortSelect.selectedIndex].text.replace(/^.+ /,'')}`);
  activeFilters.innerHTML = badges.map(b => `<span class="meta-badge">${b}</span>`).join(' ');
}

let likedPosts = JSON.parse(localStorage.getItem('r34_liked_v2') || '[]');

function togglePostLikeStatus(postId) {
  const idx = likedPosts.indexOf(String(postId));
  if(idx > -1) {
    likedPosts.splice(idx, 1);
  } else {
    likedPosts.push(String(postId));
  }
  localStorage.setItem('r34_liked_v2', JSON.stringify(likedPosts));
}

let currentVaultFolder = 'Default';

function getVaultFolders() {
  const folders = new Set(vaultedFolders);
  vaultedPosts.forEach(p => { if(p.folder) folders.add(p.folder); });
  
  const newFoldersArray = Array.from(folders);
  if (newFoldersArray.length !== vaultedFolders.length) {
      vaultedFolders = newFoldersArray;
      localforage.setItem('r34_folders_v2', vaultedFolders);
  }
  return newFoldersArray;
}

function renderVaultFoldersNav() {
  const nav = document.getElementById('vault-folders-nav');
  if(!nav) return;
  nav.innerHTML = '';
  const folders = getVaultFolders();
  folders.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'folder-btn' + (f === currentVaultFolder ? ' active' : '');
    btn.textContent = f;
    btn.addEventListener('click', () => {
      currentVaultFolder = f;
      renderVaultGridToDedicatedView();
      renderVaultFoldersNav();
    });
    nav.appendChild(btn);
  });

  const newFolderInput = document.createElement('input');
  newFolderInput.className = 'folder-btn';
  newFolderInput.placeholder = '+ New Folder';
  newFolderInput.style.background = 'transparent';
  newFolderInput.style.border = '1px dashed var(--border)';
  newFolderInput.style.outline = 'none';
  newFolderInput.style.color = 'var(--text)';
  newFolderInput.style.width = '120px';
  newFolderInput.style.cursor = 'text';

  newFolderInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && newFolderInput.value.trim()) {
      const newFolder = newFolderInput.value.trim();
      if (!vaultedFolders.includes(newFolder)) {
        vaultedFolders.push(newFolder);
        localforage.setItem('r34_folders_v2', vaultedFolders);
      }
      currentVaultFolder = newFolder;
      renderVaultGridToDedicatedView();
      renderVaultFoldersNav();
    }
  });
  nav.appendChild(newFolderInput);
}

let currentSavePost = null;
let currentSaveAnchor = null;
let currentSaveCallback = null;

const saveModalOverlay = document.getElementById('save-modal-overlay');
const saveModalClose = document.getElementById('save-modal-close');
const saveModalSearch = document.getElementById('save-modal-search');
const saveModalFolders = document.getElementById('save-modal-folders');
const saveModalNewInput = document.getElementById('save-modal-new-input');
const saveModalNewBtn = document.getElementById('save-modal-new-btn');

function renderSaveModalFolders(filterText = '') {
  if(!saveModalFolders) return;
  saveModalFolders.innerHTML = '';
  const folders = getVaultFolders();
  
  folders.filter(f => f.toLowerCase().includes(filterText.toLowerCase())).forEach(f => {
    const item = document.createElement('button');
    item.className = 'save-folder-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.width = '100%';
    item.style.padding = '12px 16px';
    item.style.borderRadius = '8px';
    
    const isSavedInHere = vaultedPosts.some(p => String(p.id) === String(currentSavePost.id) && (p.folder || 'Default') === f);
    
    item.innerHTML = `<span>${f}</span><span style="color: ${isSavedInHere ? 'var(--accent-purple)' : 'var(--muted)'}; font-weight: bold;">${isSavedInHere ? 'Saved' : 'Save'}</span>`;
    
    item.addEventListener('click', (ev) => {
       ev.stopPropagation();
       
       const idx = vaultedPosts.findIndex(p => String(p.id) === String(currentSavePost.id));
       if(idx > -1) vaultedPosts.splice(idx, 1);
       
       if (!isSavedInHere) {
         currentSavePost.folder = f;
         vaultedPosts.unshift(currentSavePost);
       }
       
       localforage.setItem('r34_vault_v2', vaultedPosts);
       syncVaultCounterDisplay();
       const isNowSaved = vaultedPosts.some(p => String(p.id) === String(currentSavePost.id));
       
       if (currentSaveCallback) {
           currentSaveCallback(isNowSaved, currentSaveAnchor);
       } else {
           currentSaveAnchor.textContent = isNowSaved ? 'Saved' : 'Save';
           currentSaveAnchor.style.backgroundColor = isNowSaved ? '#8b5cf6' : '#ff5e97';
       }
       
       renderSaveModalFolders(saveModalSearch.value); 
       
       const viewVault = document.getElementById('view-vault');
       if(viewVault && viewVault.style.display !== 'none') {
         renderVaultGridToDedicatedView();
         renderVaultFoldersNav();
       }
    });
    saveModalFolders.appendChild(item);
  });
}

if(saveModalClose) saveModalClose.addEventListener('click', () => saveModalOverlay.style.display = 'none');
if(saveModalSearch) saveModalSearch.addEventListener('input', (e) => renderSaveModalFolders(e.target.value));
if(saveModalOverlay) saveModalOverlay.addEventListener('click', (e) => { if(e.target === saveModalOverlay) saveModalOverlay.style.display = 'none'; });

if(saveModalNewBtn) {
  saveModalNewBtn.addEventListener('click', () => {
      const newFolder = saveModalNewInput.value.trim();
      if (newFolder) {
         if (!vaultedFolders.includes(newFolder)) {
             vaultedFolders.push(newFolder);
             localforage.setItem('r34_folders_v2', vaultedFolders);
         }
         
         const idx = vaultedPosts.findIndex(p => String(p.id) === String(currentSavePost.id));
         if(idx > -1) vaultedPosts.splice(idx, 1);
         
         currentSavePost.folder = newFolder;
         vaultedPosts.unshift(currentSavePost);
         localforage.setItem('r34_vault_v2', vaultedPosts);
         syncVaultCounterDisplay();
         
         if (currentSaveCallback) {
             currentSaveCallback(true, currentSaveAnchor);
         } else {
             currentSaveAnchor.textContent = 'Saved';
             currentSaveAnchor.style.backgroundColor = '#8b5cf6';
         }
         
         saveModalNewInput.value = '';
         renderSaveModalFolders();
         
         const viewVault = document.getElementById('view-vault');
         if(viewVault && viewVault.style.display !== 'none') {
           renderVaultGridToDedicatedView();
           renderVaultFoldersNav();
         }
      }
  });
}

if(saveModalNewInput) {
  saveModalNewInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveModalNewBtn.click();
  });
}

function openFolderMenu(e, post, anchorBtn, onUpdateCallback = null) {
  e.stopPropagation();
  currentSavePost = post;
  currentSaveAnchor = anchorBtn;
  currentSaveCallback = onUpdateCallback;
  
  if(saveModalSearch) saveModalSearch.value = '';
  if(saveModalNewInput) saveModalNewInput.value = '';
  renderSaveModalFolders();
  
  if(saveModalOverlay) saveModalOverlay.style.display = 'flex';
}

function injectPostCardsIntoGrid(data, targetContainer = grid) {
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
    // Recalculate masonry span once the image dimensions are known
    img.onload = () => resizeGridItem(card);
    img.onerror = () => { card.style.display = 'none'; };
    card.appendChild(img);
    if (isVideo) {
      const label = document.createElement('div');
      label.className = 'video-badge';
      label.textContent = '🎬 VIDEO';
      card.appendChild(label);
      card.addEventListener('mouseenter', () => {
        const v = document.createElement('video');
        v.src = fileUrl; v.muted = true; v.loop = true; v.playsInline = true; v.className = 'hover-video';
        card.appendChild(v); v.play().catch(() => {});
      });
      card.addEventListener('mouseleave', () => {
        const v = card.querySelector('.hover-video'); if (v) v.remove();
      });
    }

    // Action Badges Container
    const actionBadges = document.createElement('div');
    actionBadges.className = 'action-badges';

    // Like Badge
    const likeBtn = document.createElement('button');
    likeBtn.className = 'grid-action-btn btn-like';
    const isLiked = likedPosts.includes(String(post.id));
    if(isLiked) likeBtn.classList.add('liked');
    likeBtn.textContent = isLiked ? '♥ Liked' : '♡ Like';
    likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePostLikeStatus(post.id);
      const newlyLiked = likedPosts.includes(String(post.id));
      likeBtn.classList.toggle('liked', newlyLiked);
      likeBtn.textContent = newlyLiked ? '♥ Liked' : '♡ Like';
    });

    // Save Badge
    const saveBtn = document.createElement('button');
    saveBtn.className = 'grid-action-btn btn-save';
    const isSaved = vaultedPosts.some(p => String(p.id) === String(post.id));
    saveBtn.textContent = isSaved ? 'Saved' : 'Save';
    if(isSaved) saveBtn.style.backgroundColor = '#8b5cf6';
    
    saveBtn.addEventListener('click', (e) => openFolderMenu(e, post, saveBtn));

    actionBadges.appendChild(likeBtn);
    actionBadges.appendChild(saveBtn);
    card.appendChild(actionBadges);

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.innerHTML = `<span class="score">▲ ${post.score ?? 0}</span><span>${ext.toUpperCase()}</span>`;
    card.appendChild(footer);
    card.addEventListener('click', () => {
      const targetArray = isViewingVault ? vaultedPosts : cachedPosts;
      const actualIndex = targetArray.findIndex(p => String(p.id) === String(post.id));
      if (actualIndex > -1) openLightbox(actualIndex);
    });
    
    // Observe card for width changes (responsiveness) to update rowSpan
    masonryObserver.observe(card);
    targetContainer.appendChild(card);
  });
}

// Global Panic Button (Space + Tab)
let keysPressed = {};
document.addEventListener('keydown', (e) => {
  keysPressed[e.code] = true;
  if (keysPressed['Space'] && keysPressed['Tab']) {
    e.preventDefault();
    window.location.href = 'https://en.wikipedia.org/wiki/Special:Random';
  }
});
document.addEventListener('keyup', (e) => {
  delete keysPressed[e.code];
});

function renderVaultGridToDedicatedView() {
  const vaultGrid = document.getElementById('vault-grid');
  const vaultStatus = document.getElementById('vault-status');
  vaultGrid.innerHTML = '';
  
  const delBtn = document.getElementById('vault-delete-folder-btn');
  if (delBtn) {
     delBtn.style.display = currentVaultFolder === 'Default' ? 'none' : 'block';
  }

  if (vaultedPosts.length === 0) {
    vaultStatus.style.display = 'block';
    vaultStatus.innerHTML = '<span class="icon">💔</span>Your media vault is empty.';
    return;
  }
  
  let filteredPosts = currentVaultFolder === 'Default' 
    ? vaultedPosts.filter(p => !p.folder || p.folder === 'Default')
    : vaultedPosts.filter(p => p.folder === currentVaultFolder);

  if (filteredPosts.length === 0) {
    vaultStatus.style.display = 'block';
    vaultStatus.innerHTML = `<span class="icon">📁</span>No media in ${currentVaultFolder} folder.`;
    return;
  }
  
  const sortSelect = document.getElementById('vault-sort-select');
  const sortVal = sortSelect ? sortSelect.value : 'newest';
  
  if (sortVal === 'oldest') {
      filteredPosts.reverse();
  } else if (sortVal === 'highest') {
      filteredPosts.sort((a,b) => (b.score||0) - (a.score||0));
  } else if (sortVal === 'lowest') {
      filteredPosts.sort((a,b) => (a.score||0) - (b.score||0));
  }
  
  vaultStatus.style.display = 'none';
  cachedPosts = [...filteredPosts]; // Update cachedPosts so lightbox works from Vault
  injectPostCardsIntoGrid(filteredPosts, vaultGrid);
}

document.getElementById('vault-sort-select')?.addEventListener('change', renderVaultGridToDedicatedView);

document.getElementById('vault-delete-folder-btn')?.addEventListener('click', () => {
    if (currentVaultFolder === 'Default') return;
    if (confirm(`Delete the folder "${currentVaultFolder}"? All items will be moved to Default.`)) {
        vaultedPosts.forEach(p => {
            if (p.folder === currentVaultFolder) p.folder = 'Default';
        });
        localforage.setItem('r34_vault_v2', vaultedPosts);
        
        vaultedFolders = vaultedFolders.filter(f => f !== currentVaultFolder);
        localforage.setItem('r34_folders_v2', vaultedFolders);
        
        currentVaultFolder = 'Default';
        renderVaultFoldersNav();
        renderVaultGridToDedicatedView();
    }
});

async function search(tags, page, append = false) {
  if (isLoading) return; // Prevent multiple simultaneous requests
  isLoading = true;
  btn.disabled = true; // Disable search button during loading

  if (!append) {
    grid.innerHTML = ''; // Clear grid only for new searches
    cachedPosts = []; // Clear cached posts for new searches
    metaRow.style.display = 'none';
    statusEl.style.display = 'block';
    statusEl.innerHTML = '<div class="spinner"></div>Crunching requested parameters...';
    hasMore = true; // Assume there's more for a new search
  } else {
    statusEl.style.display = 'block'; // Show spinner for loading more
    statusEl.innerHTML = '<div class="spinner"></div>Loading more posts...';
  }
  const days = timeframeSelect.value;
  const sortVal = sortSelect.value;
  let tagParts = tags.trim() ? tags.trim().split(/\s+/) : [];
  if (sortVal) tagParts.push(sortVal);
  
  if (typeof globalBlacklist !== 'undefined' && globalBlacklist.length > 0) {
    globalBlacklist.forEach(t => tagParts.push(`-${t}`));
  }
  if (days !== 'all') {
    if (!append) statusEl.innerHTML = '<div class="spinner"></div>Calibrating target timeframe offsets...'; // Update status for initial load
    let range = await getIdRange(parseInt(days));
    if (range) { tagParts.push(`id:>=${range.min}`); tagParts.push(`id:<=${range.max}`); }
  }
  const tagsParam = tagParts.join('+') || 'all';
  const url = `${API}&tags=${encodeURIComponent(tagsParam).replace(/%2B/g,'+')}&limit=${PER_PAGE}&pid=${page}&json=1`;
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(url));
    const responseText = await res.text(); // Read as text first

    if (!res.ok || !responseText.trim()) {
      console.warn("API Engine alert: Received an empty or broken server packet.");
      triggerToastNotification("⚠️ No data received from host. Try shifting filters!");
      hasMore = false; // No more data if response is empty or broken
      var data = []; // Provide an empty array backup
    } else {
      var data = JSON.parse(responseText); // Parse safely now
    }

    if (!data || data.length === 0) {
      statusEl.innerHTML = cachedPosts.length === 0 ? '<span class="icon">😶</span>No matching vectors found.' : ''; // Only show "no results" if no posts loaded yet
      hasMore = false; // No more data to load
    } else {
      cacheSuccessfulSearch(tags);
      cachedPosts = append ? cachedPosts.concat(data) : data; // Append or replace cached posts
      statusEl.style.display = 'none'; metaRow.style.display = 'flex';
      resultCount.textContent = `${cachedPosts.length} items loaded dynamically`; // Update total count
      hasMore = data.length === PER_PAGE; // If less than PER_PAGE, assume no more pages
    }
    renderFilterBadges(days, sortVal);
    injectPostCardsIntoGrid(data);
  } catch (err) {
    statusEl.innerHTML = `<span class="icon">⚠️</span>Network pipeline disruption.`;
    cachedPosts = [];
  }
  btn.disabled = false;
  isLoading = false;
}

function syncVaultCounterDisplay() {
  const navVault = document.getElementById('nav-vault');
  if (navVault) {
    navVault.title = `Vault (${vaultedPosts.length})`;
    // We can also show the count visually if desired, but for now just title
  }
}

function disableVaultViewMode() {
  isViewingVault = false;
}

function togglePostFavoriteStatus(post) {
  const idx = vaultedPosts.findIndex(p => String(p.id) === String(post.id));
  if(idx > -1) {
    vaultedPosts.splice(idx, 1); lbFavBtn.classList.remove('favorited'); lbFavBtn.textContent = '🤍 Favorite';
  } else {
    vaultedPosts.unshift(post); lbFavBtn.classList.add('favorited'); lbFavBtn.textContent = '❤️ Favorited';
  }
  localforage.setItem('r34_vault_v2', vaultedPosts);
  syncVaultCounterDisplay(); 
  
  // Re-render the vault grid if we are currently looking at it
  const viewVault = document.getElementById('view-vault');
  if(viewVault && viewVault.style.display !== 'none' && typeof renderVaultGridToDedicatedView === 'function') {
    renderVaultGridToDedicatedView();
  }
}

function openLightbox(index) {
  currentPostIndex = index; const post = cachedPosts[index];
  lbContainer.innerHTML = ''; lbTagsStreamBox.innerHTML = '';
  const originalExt = (post.file_url || '').split('.').pop().toLowerCase();
  const isVideo = ['mp4','webm'].includes(originalExt);
  const fileUrl = isVideo ? post.file_url : (post.sample_url || post.file_url);
  
  if (isVideo) {
    const v = document.createElement('video'); v.src = fileUrl; v.controls = true; v.autoplay = true; v.loop = true; v.playsInline = true; lbContainer.appendChild(v);
  } else {
    const img = document.createElement('img'); img.src = fileUrl; lbContainer.appendChild(img);
  }
  lbScore.textContent = `Score: ${post.score ?? 0}`;
  lbSize.textContent  = post.width ? `${post.width}×${post.height}` : '';
  const isSaved = vaultedPosts.some(p => String(p.id) === String(post.id));
  lbFavBtn.classList.toggle('favorited', isSaved); lbFavBtn.textContent = isSaved ? '❤️ Favorited' : '🤍 Favorite';
  lbFavBtn.onclick = (e) => { 
    e.stopPropagation(); 
    openFolderMenu(e, post, lbFavBtn, (isSavedNow) => {
       lbFavBtn.classList.toggle('favorited', isSavedNow); 
       lbFavBtn.textContent = isSavedNow ? '❤️ Favorited' : '🤍 Favorite';
    });
  };
  lbDlBtn.onclick  = (e) => { e.stopPropagation(); forceBinaryAssetDownload(fileUrl, post.id); };
  const tags = (post.tags || '').split(/\s+/).filter(Boolean);
  tags.forEach(t => {
    const s = document.createElement('span'); s.className = 'lb-stream-tag'; s.textContent = t;
    s.onclick = (e) => { e.stopPropagation(); disableVaultViewMode(); addPill(t); };
    lbTagsStreamBox.appendChild(s);
  });
  lbPrevBtn.style.display = currentPostIndex > 0 ? 'flex' : 'none';
  lbNextBtn.style.display = currentPostIndex < cachedPosts.length - 1 ? 'flex' : 'none';
  lightbox.classList.add('open'); document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open'); lbContainer.innerHTML = ''; document.body.style.overflow = '';
}

function navigateLightbox(dir) {
  const tidx = currentPostIndex + dir;
  if (tidx >= 0 && tidx < cachedPosts.length) openLightbox(tidx);
}

function loadNextPage() {
  currentPage++;
  search(currentTags, currentPage, true); // Pass true for append
}

function doSearch() {
  if(input.value.trim() !== '') addPill(input.value);
  disableVaultViewMode();
  scrollSentinel.style.display = 'flex'; // Ensure sentinel is visible for new searches
  currentTags = tagsArray.join(' ');
  currentPage = 0; // Reset page for a new search
  search(currentTags, currentPage, false); // Start a new search, not appending
}

btn.addEventListener('click', doSearch);

lbClose.addEventListener('click', closeLightbox);
lbPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(-1); });
lbNextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(1); });
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => { 
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
});

document.querySelectorAll('[data-insert]').forEach(chip => {
  chip.addEventListener('click', () => addPill(chip.dataset.insert));
});

document.addEventListener('DOMContentLoaded', async () => {
  await initVault(); // Wait for IndexedDB migration and load
  getLatestId();
  renderHistoryAndPins();
  syncVaultCounterDisplay();
  if (typeof renderVaultFoldersNav === 'function') renderVaultFoldersNav();
});

const vaultExportBtn = document.getElementById('vault-export-btn');
const vaultImportBtn = document.getElementById('vault-import-btn');
const vaultImportInput = document.getElementById('vault-import-input');

if(vaultExportBtn) vaultExportBtn.addEventListener('click', exportVault);
if(vaultImportBtn) vaultImportBtn.addEventListener('click', () => vaultImportInput.click());
if(vaultImportInput) vaultImportInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) importVault(e.target.files[0]);
});

function renderBlacklist() {
  const container = document.getElementById('blacklist-tags');
  if(!container) return;
  container.innerHTML = '';
  globalBlacklist.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'meta-badge';
    pill.style.background = 'rgba(244,63,94,0.15)';
    pill.style.color = '#fb7185';
    pill.style.borderColor = '#f43f5e';
    pill.style.cursor = 'pointer';
    pill.textContent = tag + ' ✕';
    pill.onclick = async () => {
      globalBlacklist = globalBlacklist.filter(t => t !== tag);
      await localforage.setItem('r34_blacklist', globalBlacklist);
      renderBlacklist();
    };
    container.appendChild(pill);
  });
}

const blacklistInput = document.getElementById('blacklist-input');
const blacklistSaveBtn = document.getElementById('blacklist-save-btn');
if(blacklistSaveBtn) {
  blacklistSaveBtn.addEventListener('click', async () => {
    const tags = blacklistInput.value.trim().split(/\s+/).filter(Boolean);
    let updated = false;
    tags.forEach(t => {
      if(!globalBlacklist.includes(t)) {
        globalBlacklist.push(t);
        updated = true;
      }
    });
    if(updated) {
      await localforage.setItem('r34_blacklist', globalBlacklist);
      renderBlacklist();
    }
    blacklistInput.value = '';
  });
}
if(blacklistInput) {
  blacklistInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') blacklistSaveBtn.click();
  });
}

class Slideshow {
  constructor() {
    this.timer = null;
    this.interval = 4000;
    this.isPlaying = false;
    this.btn = document.getElementById('slideshow-btn');
    if(this.btn) {
      this.btn.addEventListener('click', () => this.toggle());
    }
    
    // Pause if user interacts with lightbox
    const stopInteract = () => { if(this.isPlaying) this.stop(); };
    if(typeof lbPrevBtn !== 'undefined') lbPrevBtn.addEventListener('click', stopInteract);
    if(typeof lbNextBtn !== 'undefined') lbNextBtn.addEventListener('click', stopInteract);
    if(typeof lbClose !== 'undefined') lbClose.addEventListener('click', stopInteract);
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    if (cachedPosts.length === 0) {
      triggerToastNotification("No images to play!");
      return;
    }
    this.isPlaying = true;
    if(this.btn) {
      this.btn.innerHTML = '⏸ Stop';
      this.btn.style.background = '#f43f5e';
    }
    triggerToastNotification("Slideshow started");
    
    if(!lightbox.classList.contains('open')) {
      openLightbox(0);
    }
    
    this.timer = setInterval(() => {
      if (!lightbox.classList.contains('open')) {
        this.stop();
        return;
      }
      if (currentPostIndex < cachedPosts.length - 1) {
        lbNextBtn.click();
      } else {
        if (hasMore) {
          loadNextPage();
          // wait a bit for it to load, then next
          setTimeout(() => {
             if (currentPostIndex < cachedPosts.length - 1) lbNextBtn.click();
          }, 1500);
        } else {
          this.stop();
          triggerToastNotification("Slideshow finished");
        }
      }
    }, this.interval);
  }

  stop() {
    this.isPlaying = false;
    if(this.timer) clearInterval(this.timer);
    this.timer = null;
    if(this.btn) {
      this.btn.innerHTML = '▶ Play';
      this.btn.style.background = 'var(--accent-purple)';
    }
  }
}

const slideshow = new Slideshow();