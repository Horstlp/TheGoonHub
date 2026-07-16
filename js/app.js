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
  if (entries[0].isIntersecting && !isLoading && hasMore && !isViewingVault) {
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

let currentVaultFolder = 'All';

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
  const folders = ['All', ...getVaultFolders()];
  
  folders.forEach(f => {
    const btn = document.createElement('div');
    btn.className = 'folder-stack-btn' + (f === currentVaultFolder ? ' active' : '');
    
    // Find images for this stack
    let stackImages = [];
    let count = 0;
    
    if (f === 'All') {
        stackImages = vaultedPosts.slice(0, 4);
        count = vaultedPosts.length;
    } else if (f === 'Default') {
        const defPosts = vaultedPosts.filter(p => !p.folder || p.folder === 'Default');
        stackImages = defPosts.slice(0, 4);
        count = defPosts.length;
    } else {
        const customPosts = vaultedPosts.filter(p => p.folder === f);
        stackImages = customPosts.slice(0, 4);
        count = customPosts.length;
    }
    
    let imgHTML = '';
    stackImages.forEach((p, i) => {
        const url = p.preview_url || p.sample_url || p.file_url;
        if(url) {
            imgHTML += `<img src="${url}" class="stack-img-${4-i}" loading="lazy" />`;
        }
    });
    
    if (stackImages.length === 0) {
        imgHTML = `<div style="width:76px;height:76px;background:var(--surface);border-radius:10px;border:1px dashed var(--border);position:absolute;top:4px;left:17px;z-index:1;"></div>`;
    }
    
    btn.innerHTML = `
      <div class="stack-images">
        ${imgHTML}
        <div class="glass-folder-overlay"></div>
        <svg class="glass-folder-border" viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">
          <path d="M 15 5 L 35 5 Q 40 5 43 12 L 47 20 Q 50 25 55 25 L 85 25 Q 95 25 95 35 L 95 65 Q 95 75 85 75 L 15 75 Q 5 75 5 65 L 5 15 Q 5 5 15 5 Z" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
        </svg>
      </div>
      <div style="display:flex; align-items:center; gap: 4px;">
        <div class="folder-stack-title">${f}</div>
        ${f !== 'All' && f !== 'Default' ? `<button class="folder-edit-btn" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:1.1rem; padding:0 4px;" title="Folder Settings">⋮</button>` : ''}
      </div>
      <div class="folder-stack-count">${count} items</div>
    `;
    
    const editBtn = btn.querySelector('.folder-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nameField = document.getElementById('new-folder-name');
            nameField.value = f;
            nameField.readOnly = true;
            nameField.style.opacity = '0.6';
            document.getElementById('new-folder-title').textContent = 'Folder Settings';
            
            const settings = vaultFolderSettings[f] || { isPublic: false, useInAlgo: true };
            document.getElementById('new-folder-visibility').value = settings.isPublic ? 'public' : 'private';
            document.getElementById('new-folder-algo').checked = settings.useInAlgo !== false;
            
            document.getElementById('new-folder-submit').textContent = 'Save Settings';
            newFolderModal.style.display = 'flex';
        });
    }
    
    btn.addEventListener('click', () => {
      currentVaultFolder = f;
      renderVaultGridToDedicatedView();
      renderVaultFoldersNav();
    });
    nav.appendChild(btn);
  });

}

// New Folder Modal Logic
const newFolderModal = document.getElementById('new-folder-modal');
const newFolderBtn = document.getElementById('vault-new-folder-btn');
const newFolderCloseBtn = document.getElementById('new-folder-close');
const newFolderCancelBtn = document.getElementById('new-folder-cancel');
const newFolderSubmitBtn = document.getElementById('new-folder-submit');

if (newFolderBtn) {
  newFolderBtn.addEventListener('click', () => {
    const nameField = document.getElementById('new-folder-name');
    nameField.value = '';
    nameField.readOnly = false;
    nameField.style.opacity = '1';
    document.getElementById('new-folder-title').textContent = 'Create New Folder';
    document.getElementById('new-folder-visibility').value = 'private';
    document.getElementById('new-folder-algo').checked = true;
    document.getElementById('new-folder-submit').textContent = 'Create Folder';
    newFolderModal.style.display = 'flex';
  });
}

function closeNewFolderModal() {
  newFolderModal.style.display = 'none';
}

if (newFolderCloseBtn) newFolderCloseBtn.addEventListener('click', closeNewFolderModal);
if (newFolderCancelBtn) newFolderCancelBtn.addEventListener('click', closeNewFolderModal);

if (newFolderSubmitBtn) {
  newFolderSubmitBtn.addEventListener('click', () => {
    const nameInput = document.getElementById('new-folder-name').value.trim();
    const visibility = document.getElementById('new-folder-visibility').value;
    const useAlgo = document.getElementById('new-folder-algo').checked;
    
    if (!nameInput) {
      alert("Please enter a folder name.");
      return;
    }
    
    // Save to settings
    vaultFolderSettings[nameInput] = {
      isPublic: visibility === 'public',
      useInAlgo: useAlgo
    };
    localforage.setItem('r34_folder_settings_v1', vaultFolderSettings);

    if (!vaultedFolders.includes(nameInput)) {
      vaultedFolders.push(nameInput);
      localforage.setItem('r34_folders_v2', vaultedFolders);
    }
    
    currentVaultFolder = nameInput;
    renderVaultGridToDedicatedView();
    renderVaultFoldersNav();
    closeNewFolderModal();
  });
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
  const fragment = document.createDocumentFragment();
  const newCards = []; // Store references for batch layout calculation

  data.forEach((post, index) => {
    const fileUrl = post.file_url || post.sample_url || post.preview_url;
    const previewUrl = post.preview_url || post.sample_url || post.file_url;
    if (!fileUrl) return;
    const ext = fileUrl.split('.').pop().toLowerCase();
    const isVideo = ['mp4','webm'].includes(ext);
    const card = document.createElement('div');
    card.className = 'card';
    
    // Detect extreme vertical aspect ratios (comic strips) to prevent layout breakage
    if (post.height && post.width && (post.height / post.width > 2.5)) {
      card.classList.add('comic-strip');
    }
    
    const img = document.createElement('img');
    img.src = previewUrl; 
    img.loading = 'lazy';
    img.decoding = 'async'; // Offload image decoding from main thread
    
    // Performance: Pre-allocate image height using aspect-ratio so the DOM 
    // doesn't have to wait for the image to download to calculate the layout.
    if (post.width && post.height) {
        img.style.aspectRatio = `${post.width} / ${post.height}`;
    }
    
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
    card.addEventListener('click', (e) => {
      const isVaultView = targetContainer && targetContainer.id === 'vault-grid';
      if (typeof isVaultBulkMode !== 'undefined' && isVaultBulkMode && isVaultView) {
        const postIdStr = String(post.id);
        if (selectedVaultPosts.has(postIdStr)) {
           selectedVaultPosts.delete(postIdStr);
           card.classList.remove('bulk-selected');
        } else {
           selectedVaultPosts.add(postIdStr);
           card.classList.add('bulk-selected');
        }
        const countEl = document.getElementById('bulk-selection-count');
        if (countEl) countEl.textContent = `${selectedVaultPosts.size} items selected`;
        return;
      }

      const targetArray = cachedPosts; // cachedPosts handles Vault mode dynamically
      const actualIndex = targetArray.findIndex(p => String(p.id) === String(post.id));
      if (actualIndex > -1) openLightbox(actualIndex);
    });
    
    // Observe card for width changes (responsiveness) to update rowSpan
    masonryObserver.observe(card);
    fragment.appendChild(card);
    newCards.push(card);
  });

  // Inject all 50 cards at once (1 Reflow instead of 50)
  targetContainer.appendChild(fragment);

  // Synchronized Batch Read-then-Write to completely eliminate layout thrashing
  // Phase 1: Read Phase
  const cardHeights = newCards.map(card => card.getBoundingClientRect().height);
  
  // Phase 2: Write Phase
  const rowHeight = 10;
  const rowGap = 16;
  newCards.forEach((card, i) => {
      const rowSpan = Math.ceil((cardHeights[i] + rowGap) / (rowHeight + rowGap));
      card.style.gridRowEnd = `span ${rowSpan}`;
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

let activeVaultTab = 'images';

document.getElementById('vault-main-tabs')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('vault-tab-btn')) {
        document.querySelectorAll('.vault-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeVaultTab = e.target.dataset.tab;
        
        // Toggle UI elements if needed
        const folderNav = document.getElementById('vault-folders-nav');
        // We keep folder nav for both!
        
        renderVaultGridToDedicatedView();
    }
});

function renderVaultGridToDedicatedView() {
  const vaultGrid = document.getElementById('vault-grid');
  const vaultStatus = document.getElementById('vault-status');
  vaultGrid.innerHTML = '';
  
  // Apply Tab filter first
  let tabFilteredPosts = vaultedPosts.filter(p => {
      const isManga = !!p.mangaObject;
      if (activeVaultTab === 'bookshelf') return isManga;
      return !isManga;
  });

  const delBtn = document.getElementById('vault-delete-folder-btn');
  if (delBtn) {
     delBtn.style.display = (currentVaultFolder === 'Default' || currentVaultFolder === 'All') ? 'none' : 'block';
  }

  if (tabFilteredPosts.length === 0) {
    vaultStatus.style.display = 'block';
    vaultStatus.innerHTML = activeVaultTab === 'bookshelf' 
      ? '<span class="icon">📚</span>Your bookshelf is empty. Save some manga!'
      : '<span class="icon">💔</span>Your media vault is empty.';
    return;
  }
  
  let filteredPosts = currentVaultFolder === 'All' 
    ? tabFilteredPosts
    : currentVaultFolder === 'Default' 
      ? tabFilteredPosts.filter(p => !p.folder || p.folder === 'Default')
      : tabFilteredPosts.filter(p => p.folder === currentVaultFolder);

  // Apply Vault Local Search filter
  const searchInput = document.getElementById('vault-search-input');
  if (searchInput && searchInput.value.trim() !== '') {
    const query = searchInput.value.trim().toLowerCase();
    const queryParts = query.split(/\s+/);
    filteredPosts = filteredPosts.filter(p => {
      if (!p.tags) return false;
      const t = p.tags.toLowerCase();
      // All search parts must match
      return queryParts.every(part => t.includes(part));
    });
  }

  if (filteredPosts.length === 0) {
    vaultStatus.style.display = 'block';
    vaultStatus.innerHTML = `<span class="icon">📁</span>No matching media found in ${currentVaultFolder} folder.`;
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
  
  if (activeVaultTab === 'bookshelf' && typeof injectPhysicalBookshelf === 'function') {
      injectPhysicalBookshelf(filteredPosts, vaultGrid);
  } else {
      vaultGrid.className = 'vault-grid-layout'; // restore original class if switching back
      injectPostCardsIntoGrid(filteredPosts, vaultGrid);
  }
}

document.getElementById('vault-sort-select')?.addEventListener('change', renderVaultGridToDedicatedView);
document.getElementById('vault-search-input')?.addEventListener('input', debounce(renderVaultGridToDedicatedView, 300));

let isVaultBulkMode = false;
const selectedVaultPosts = new Set();

const bulkEditBtn = document.getElementById('vault-bulk-edit-btn');
const bulkActionsFooter = document.getElementById('vault-bulk-actions');
const bulkCancelBtn = document.getElementById('bulk-cancel-btn');

function toggleBulkMode() {
    isVaultBulkMode = !isVaultBulkMode;
    selectedVaultPosts.clear();
    
    if (bulkEditBtn) {
        bulkEditBtn.style.background = isVaultBulkMode ? 'rgba(239, 68, 68, 0.15)' : '';
        bulkEditBtn.style.borderColor = isVaultBulkMode ? '#ef4444' : '';
    }
    
    if (bulkActionsFooter) {
        bulkActionsFooter.style.display = isVaultBulkMode ? 'flex' : 'none';
        if (isVaultBulkMode) {
            const folderSelect = document.getElementById('bulk-folder-select');
            if (folderSelect) {
                folderSelect.innerHTML = '';
                getVaultFolders().forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f;
                    opt.textContent = f;
                    folderSelect.appendChild(opt);
                });
            }
        }
    }
    
    const countEl = document.getElementById('bulk-selection-count');
    if (countEl) countEl.textContent = `0 items selected`;
    
    renderVaultGridToDedicatedView(); // Re-render to clear any active selections visually
}

if (bulkEditBtn) bulkEditBtn.addEventListener('click', toggleBulkMode);
if (bulkCancelBtn) bulkCancelBtn.addEventListener('click', toggleBulkMode);

document.getElementById('bulk-move-btn')?.addEventListener('click', () => {
    if (selectedVaultPosts.size === 0) return triggerToastNotification("No items selected.");
    const folderSelect = document.getElementById('bulk-folder-select');
    const targetFolder = folderSelect ? folderSelect.value : 'Default';
    
    vaultedPosts.forEach(p => {
        if (selectedVaultPosts.has(String(p.id))) {
            p.folder = targetFolder;
        }
    });
    
    localforage.setItem('r34_vault_v2', vaultedPosts);
    triggerToastNotification(`Moved ${selectedVaultPosts.size} items to ${targetFolder}.`);
    toggleBulkMode();
});

document.getElementById('bulk-delete-btn')?.addEventListener('click', () => {
    if (selectedVaultPosts.size === 0) return triggerToastNotification("No items selected.");
    if (!confirm(`Are you sure you want to delete ${selectedVaultPosts.size} items from your vault?`)) return;
    
    vaultedPosts = vaultedPosts.filter(p => !selectedVaultPosts.has(String(p.id)));
    localforage.setItem('r34_vault_v2', vaultedPosts);
    
    triggerToastNotification(`Deleted ${selectedVaultPosts.size} items.`);
    syncVaultCounterDisplay();
    toggleBulkMode();
});

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

let preloadedPagesQueue = [];
let isPreloading = false;
let currentPreloadTags = '';
let currentPreloadPage = 0;
const PRELOAD_BUFFER_SIZE = 3;

async function fetchStandardBatch(tagsParam, page) {
  const url = `${API}&tags=${encodeURIComponent(tagsParam).replace(/%2B/g,'+')}&limit=${PER_PAGE}&pid=${page}&json=1`;
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(url));
    const responseText = await res.text();
    if (!res.ok || !responseText.trim()) return null;
    return JSON.parse(responseText);
  } catch (err) {
    return null;
  }
}

async function startContinuousPreload(tagsParam, startPage) {
    // If already preloading for this EXACT query ahead of the requested start page, let it keep running
    if (isPreloading && currentPreloadTags === tagsParam && currentPreloadPage >= startPage) return;
    
    isPreloading = true;
    currentPreloadTags = tagsParam;
    currentPreloadPage = startPage;
    
    while(isPreloading && currentPreloadTags === tagsParam) {
        if (preloadedPagesQueue.length < PRELOAD_BUFFER_SIZE && hasMore) {
            const data = await fetchStandardBatch(tagsParam, currentPreloadPage);
            
            // If the search was cancelled or changed while fetching, discard
            if (!isPreloading || currentPreloadTags !== tagsParam) break;
            
            if (data && data.length > 0) {
                preloadedPagesQueue.push(data);
                currentPreloadPage++;
                if (data.length < PER_PAGE) {
                    hasMore = false;
                    break;
                }
            } else {
                hasMore = false;
                break;
            }
        } else if (!hasMore) {
            break;
        } else {
            // Buffer is full, wait a bit before checking again
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

async function search(tags, page, append = false) {
  if (isLoading) return; // Prevent multiple simultaneous requests
  isLoading = true;
  btn.disabled = true; // Disable search button during loading

  const bottomStatusEl = document.getElementById('bottom-status');

  if (!append) {
    grid.innerHTML = ''; // Clear grid only for new searches
    cachedPosts = []; // Clear cached posts for new searches
    metaRow.style.display = 'none';
    statusEl.style.display = 'block';
    if(bottomStatusEl) bottomStatusEl.style.display = 'none';
    statusEl.innerHTML = '<div class="spinner"></div>Crunching requested parameters...';
    hasMore = true; // Assume there's more for a new search
    
    // STOP OLD PRELOAD LOOP AND CLEAR QUEUE
    isPreloading = false;
    preloadedPagesQueue = [];
  } else {
    if(bottomStatusEl) bottomStatusEl.style.display = 'block'; // Show spinner at bottom
  }
  
  const days = timeframeSelect.value;
  const sortVal = sortSelect.value;
  let tagParts = tags.trim() ? tags.trim().split(/\s+/) : [];
  if (sortVal) tagParts.push(sortVal);
  
  if (typeof globalBlacklist !== 'undefined' && globalBlacklist.length > 0) {
    globalBlacklist.forEach(t => tagParts.push(`-${t}`));
  }
  if (typeof globalWhitelist !== 'undefined' && globalWhitelist.length > 0) {
    globalWhitelist.forEach(t => tagParts.push(t));
  }
  if (days !== 'all') {
    if (!append) statusEl.innerHTML = '<div class="spinner"></div>Calibrating target timeframe offsets...';
    let range = await getIdRange(parseInt(days));
    if (range) { tagParts.push(`id:>=${range.min}`); tagParts.push(`id:<=${range.max}`); }
  }
  const tagsParam = tagParts.join('+') || 'all';
  
  let data = null;
  
  try {
    if (append && preloadedPagesQueue.length > 0) {
      // PROMISE BUFFER ARCHITECTURE: Instantly resolve from the memory queue!
      data = preloadedPagesQueue.shift();
    } else {
      // Fallback or Initial fetch (if we scrolled faster than the buffer, or it's a new search)
      data = await fetchStandardBatch(tagsParam, page);
    }
  } catch (err) {
    data = null;
  }

  if (!data || data.length === 0) {
    if (!append) statusEl.innerHTML = cachedPosts.length === 0 ? '<span class="icon">😶</span>No matching vectors found.' : '';
    if (bottomStatusEl) bottomStatusEl.style.display = 'none';
    hasMore = false; // No more data to load
  } else {
    cacheSuccessfulSearch(tags);
    cachedPosts = append ? cachedPosts.concat(data) : data; // Append or replace cached posts
    statusEl.style.display = 'none'; 
    if (bottomStatusEl) bottomStatusEl.style.display = 'none';
    metaRow.style.display = 'flex';
    resultCount.textContent = `${cachedPosts.length} items loaded dynamically`; // Update total count
    hasMore = data.length === PER_PAGE; // If less than PER_PAGE, assume no more pages
    
    renderFilterBadges(days, sortVal);
    injectPostCardsIntoGrid(data);

    // KICK OFF OR RESUME BACKGROUND PRELOAD FOR THE NEXT PAGES
    if (hasMore) {
        startContinuousPreload(tagsParam, page + 1);
    }
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
  if (sortSelect && sortSelect.value === 'algo:discover') {
    if (typeof pullBlendedBatch === 'function') {
      pullBlendedBatch(true, true);
      return;
    }
  }
  search(currentTags, currentPage, true); // Pass true for append
}

function doSearch() {
  if(input.value.trim() !== '') addPill(input.value);
  disableVaultViewMode();
  scrollSentinel.style.display = 'flex'; // Ensure sentinel is visible for new searches
  currentTags = tagsArray.join(' ');
  currentPage = 0; // Reset page for a new search
  
  // Auto-switch away from algorithm if user is making a specific custom search
  if (sortSelect && sortSelect.value === 'algo:discover' && currentTags !== '') {
      sortSelect.value = ''; // switch to default order
  }
  
  if (sortSelect && sortSelect.value === 'algo:discover') {
    if (typeof pullBlendedBatch === 'function') {
      pullBlendedBatch(false, true);
      return;
    }
  }
  
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
  if (typeof initAlgoCache === 'function') await initAlgoCache(); // Preload algorithm cache
  doSearch(); // Automatically generate the feed on startup
});

const vaultExportBtn = document.getElementById('vault-export-btn');
const vaultImportBtn = document.getElementById('vault-import-btn');
const vaultImportInput = document.getElementById('vault-import-input');

if(vaultExportBtn) vaultExportBtn.addEventListener('click', exportVault);
if(vaultImportBtn) vaultImportBtn.addEventListener('click', () => vaultImportInput.click());
if(vaultImportInput) vaultImportInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) importVault(e.target.files[0]);
});

// Global Settings Modal Logic
const globalSettingsModal = document.getElementById('global-settings-modal');
const vaultSettingsBtn = document.getElementById('vault-settings-btn');
const globalSettingsClose = document.getElementById('global-settings-close');

if (vaultSettingsBtn) {
  vaultSettingsBtn.addEventListener('click', () => {
    renderBlacklist();
    renderWhitelist();
    globalSettingsModal.style.display = 'flex';
  });
}

if (globalSettingsClose) {
  globalSettingsClose.addEventListener('click', () => {
    globalSettingsModal.style.display = 'none';
  });
}

function renderWhitelist() {
  const container = document.getElementById('whitelist-tags');
  if(!container) return;
  container.innerHTML = '';
  globalWhitelist.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'meta-badge';
    pill.style.background = 'rgba(16,185,129,0.15)';
    pill.style.color = '#10b981';
    pill.style.borderColor = '#059669';
    pill.style.cursor = 'pointer';
    pill.textContent = tag + ' ✕';
    pill.onclick = async () => {
      globalWhitelist = globalWhitelist.filter(t => t !== tag);
      await localforage.setItem('r34_whitelist', globalWhitelist);
      renderWhitelist();
    };
    container.appendChild(pill);
  });
}

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

function renderSettingsAutocomplete(items, targetBox, inputElement, listType) {
  targetBox.innerHTML = '';
  if (!items || items.length === 0) {
    targetBox.style.display = 'none';
    return;
  }
  items.slice(0, 8).forEach((item) => {
    const value = item.value || item.name || item;
    const row = document.createElement('div');
    row.style.padding = '10px 12px';
    row.style.cursor = 'pointer';
    row.style.borderBottom = '1px solid var(--border)';
    row.style.color = 'var(--text)';
    row.style.transition = 'background 0.2s';
    row.textContent = value;
    row.onmouseover = () => row.style.background = 'var(--surface)';
    row.onmouseout = () => row.style.background = 'transparent';
    row.onclick = async () => {
      targetBox.style.display = 'none';
      inputElement.value = ''; // clear input immediately
      
      if (listType === 'whitelist') {
         if (!globalWhitelist.includes(value)) {
           globalWhitelist.push(value);
           await localforage.setItem('r34_whitelist', globalWhitelist);
           renderWhitelist();
         }
      } else if (listType === 'blacklist') {
         if (!globalBlacklist.includes(value)) {
           globalBlacklist.push(value);
           await localforage.setItem('r34_blacklist', globalBlacklist);
           renderBlacklist();
         }
      }
    };
    targetBox.appendChild(row);
  });
  targetBox.style.display = 'block';
}

function setupSettingsAutocomplete(inputId, boxId, listType) {
  const input = document.getElementById(inputId);
  const box = document.getElementById(boxId);
  if(!input || !box) return;
  let timeout;
  
  input.addEventListener('input', (e) => {
    clearTimeout(timeout);
    let text = e.target.value.trim();
    if(text.startsWith('-')) text = text.slice(1);
    if(text.length < 2) {
      box.style.display = 'none';
      return;
    }
    timeout = setTimeout(() => {
      if (typeof queryAutocomplete === 'function') {
        queryAutocomplete(text, (data) => renderSettingsAutocomplete(data, box, input, listType));
      }
    }, 250);
  });
  
  // Hide on click outside
  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== box && !box.contains(e.target)) {
       box.style.display = 'none';
    }
  });
}

setupSettingsAutocomplete('whitelist-input', 'whitelist-autocomplete-box', 'whitelist');
setupSettingsAutocomplete('blacklist-input', 'blacklist-autocomplete-box', 'blacklist');

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