window.searchRequestVersion = 0;
let currentTags = '';
let currentPage = 0;
let cachedPosts = [];
window.cachedVaultPosts = [];
let currentPostIndex = -1;

let tagsArray = [];
let autocompleteTimeout;
let activeSuggestionIdx = -1;
let activePrefixModifier = '';
const tagCategoriesMap = new Map();
let isViewingVault = false;
let isLoading = false; // State to prevent multiple simultaneous loads
let hasMore = true; // State to track if there are more results to load

// --- Background Tag Resolver for Coloring ---
const tagResolverQueue = new Set();
let isResolvingTags = false;

async function processTagResolverQueue() {
  if (tagResolverQueue.size === 0) {
    isResolvingTags = false;
    return;
  }
  isResolvingTags = true;

  const tag = tagResolverQueue.values().next().value;
  tagResolverQueue.delete(tag);

  if (typeof algoTagsCache !== 'undefined' && !algoTagsCache[tag] && typeof fetchTagType === 'function') {
    await fetchTagType(tag);
    if (typeof localforage !== 'undefined') {
      localforage.setItem('r34_tag_types', algoTagsCache);
    }

    // Re-color DOM elements dynamically if they are still visible
    document.querySelectorAll(`.lb-stream-tag[data-tag="${tag}"]`).forEach(el => {
      const type = algoTagsCache[tag];
      if (type === 'character') el.style.borderColor = '#34d399';
      if (type === 'artist') el.style.borderColor = '#fbbf24';
      if (type === 'copyright') el.style.borderColor = '#a78bfa';
    });
  }

  setTimeout(processTagResolverQueue, 1500); // Very slow to avoid rate limits (1.5s)
}

window.queueTagForResolution = function (tag) {
  if (typeof algoTagsCache !== 'undefined' && !algoTagsCache[tag]) {
    tagResolverQueue.add(tag);
    if (!isResolvingTags) processTagResolverQueue();
  }
};

const searchContainer = document.getElementById('search-container');
const tagPillsList = document.getElementById('tag-pills-list');
const input = document.getElementById('search-input');
const autocompleteBox = document.getElementById('autocomplete-box');
const btn = document.getElementById('search-btn');
const timeframeSelect = document.getElementById('timeframe-select');
const sortSelect = document.getElementById('sort-select');
const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const metaRow = document.getElementById('meta-row');
const resultCount = document.getElementById('result-count');
const activeFilters = document.getElementById('active-filters'); // Keep this for filter badges
const paginationBox = document.getElementById('pagination-controls-box');
const scrollSentinel = document.getElementById('scroll-sentinel'); // Element to observe for infinite scroll
const vaultToggleBtn = document.getElementById('vault-toggle');


const toast = document.getElementById('toast');

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
  const isAlgo = (sortSelect && sortSelect.value === 'algo:discover');
  const isAlgoLoadingSafe = (typeof isAlgoLoading !== 'undefined') ? isAlgoLoading : false;
  const loading = isAlgo ? isAlgoLoadingSafe : isLoading;

  if (entries[0].isIntersecting && !loading && hasMore && !isViewingVault) {
    if (typeof loadNextPage === 'function') loadNextPage();
  }
}, 250);

const scrollObserver = new IntersectionObserver(handleScroll, {
  rootMargin: '400px'
});

scrollObserver.observe(scrollSentinel);



let likedPosts = JSON.parse(localStorage.getItem('r34_liked_v2') || '[]');

function togglePostLikeStatus(postId) {
  const idx = likedPosts.indexOf(String(postId));
  if (idx > -1) {
    likedPosts.splice(idx, 1);
  } else {
    likedPosts.push(String(postId));
  }
  localStorage.setItem('r34_liked_v2', JSON.stringify(likedPosts));
}

let currentVaultFolder = 'All';

function getVaultFolders() {
  const folders = new Set(vaultedFolders);
  vaultedPosts.forEach(p => { if (p.folder) folders.add(p.folder); });

  const newFoldersArray = Array.from(folders);
  if (newFoldersArray.length !== vaultedFolders.length) {
    vaultedFolders = newFoldersArray;
    localforage.setItem('r34_folders_v2', vaultedFolders);
  }
  return newFoldersArray;
}

function renderVaultFoldersNav() {
  const nav = document.getElementById('vault-folders-nav');
  if (!nav) return;
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
      if (url) {
        imgHTML += `<img src="${url}" class="stack-img-${4 - i}" loading="lazy" />`;
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

  if (typeof renderHomeFolderTabs === 'function') {
    renderHomeFolderTabs();
  }
}

function renderHomeFolderTabs() {
  if (typeof window.invalidateAlgoDnaCache === 'function') {
    window.invalidateAlgoDnaCache();
  }
  const container = document.getElementById('home-folders-nav');
  if (!container) return;
  container.innerHTML = '';

  const folders = ['All', ...getVaultFolders()];
  
  folders.forEach(f => {
    // Determine active status: window.algoTargetFolder matches f, or f === 'All' and window.algoTargetFolder is null
    const isActive = (f === 'All' && !window.algoTargetFolder) || (window.algoTargetFolder === f);
    
    // Calculate post count in this folder to verify if it has saved content
    let folderCount = 0;
    if (f === 'All') {
      folderCount = vaultedPosts.length;
    } else if (f === 'Default') {
      folderCount = vaultedPosts.filter(p => !p.folder || p.folder === 'Default').length;
    } else {
      folderCount = vaultedPosts.filter(p => p.folder === f).length;
    }
    
    // Only display folder tab if it actually contains items (All is always shown)
    if (f !== 'All' && folderCount === 0) return;

    const tab = document.createElement('div');
    tab.className = 'home-folder-tab' + (isActive ? ' active' : '');
    tab.textContent = f;
    tab.title = f === 'All' ? 'Personalized algorithm feed' : `Recommendations matching ${f}`;

    tab.addEventListener('click', () => {
      // If clicking already active folder tab, toggle back to 'All'
      if (isActive) {
        if (f === 'All') return; // Clicking All again does nothing
        window.algoTargetFolder = null;
      } else {
        window.algoTargetFolder = f === 'All' ? null : f;
      }

      // Clear search query
      tagsArray = [];
      if (typeof renderPills === 'function') renderPills();
      if (input) input.value = '';
      currentTags = '';

      // Force sort select to algo:discover
      if (sortSelect) {
        sortSelect.value = 'algo:discover';
      }
      if (typeof updateSortButtonsUI === 'function') {
        updateSortButtonsUI('algo:discover');
      }

      renderHomeFolderTabs(); // Re-render tabs to reflect active highlight
      doSearch();
    });

    container.appendChild(tab);
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
  if (!saveModalFolders) return;
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
      if (idx > -1) vaultedPosts.splice(idx, 1);

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
      if (viewVault && viewVault.style.display !== 'none') {
        renderVaultGridToDedicatedView();
        renderVaultFoldersNav();
      }
    });
    saveModalFolders.appendChild(item);
  });
}

if (saveModalClose) saveModalClose.addEventListener('click', () => saveModalOverlay.style.display = 'none');
if (saveModalSearch) saveModalSearch.addEventListener('input', (e) => renderSaveModalFolders(e.target.value));
if (saveModalOverlay) saveModalOverlay.addEventListener('click', (e) => { if (e.target === saveModalOverlay) saveModalOverlay.style.display = 'none'; });

if (saveModalNewBtn) {
  saveModalNewBtn.addEventListener('click', () => {
    const newFolder = saveModalNewInput.value.trim();
    if (newFolder) {
      if (!vaultedFolders.includes(newFolder)) {
        vaultedFolders.push(newFolder);
        localforage.setItem('r34_folders_v2', vaultedFolders);
      }

      const idx = vaultedPosts.findIndex(p => String(p.id) === String(currentSavePost.id));
      if (idx > -1) vaultedPosts.splice(idx, 1);

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
      if (viewVault && viewVault.style.display !== 'none') {
        renderVaultGridToDedicatedView();
        renderVaultFoldersNav();
      }
    }
  });
}

if (saveModalNewInput) {
  saveModalNewInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveModalNewBtn.click();
  });
}

window.suggestFolderForPost = function(post) {
  const folders = typeof getVaultFolders === 'function' ? getVaultFolders() : vaultedFolders;
  if (!folders || folders.length === 0) return 'Saved';
  
  const postTags = (post.tags || '').split(/\s+/).filter(Boolean);
  if (postTags.length === 0) return folders[0] || 'Saved';

  let bestFolder = folders[0] || 'Saved';
  let bestScore = -1;

  folders.forEach(folder => {
    const postsInFolder = vaultedPosts.filter(p => p.folder === folder);
    if (postsInFolder.length === 0) return;

    let score = 0;
    postsInFolder.forEach(fp => {
      const fpTags = (fp.tags || '').split(/\s+/).filter(Boolean);
      const matches = postTags.filter(t => fpTags.includes(t)).length;
      score += matches;
    });

    const normalizedScore = score / postsInFolder.length;

    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestFolder = folder;
    }
  });

  return bestScore > 0 ? bestFolder : (folders[0] || 'Saved');
};

window.savePostToFolder = function(post, folderName, btnElement) {
  if (folderName === '_new_') {
    const newName = prompt("Enter new folder name:");
    if (!newName) return;
    folderName = newName.trim();
  }
  
  if (!vaultedFolders.includes(folderName)) {
    vaultedFolders.push(folderName);
    localforage.setItem('r34_folders_v2', vaultedFolders);
  }

  const idx = vaultedPosts.findIndex(p => String(p.id) === String(post.id));
  if (idx > -1) vaultedPosts.splice(idx, 1);

  post.folder = folderName;
  vaultedPosts.unshift(post);
  localforage.setItem('r34_vault_v2', vaultedPosts);
  
  if (typeof syncVaultCounterDisplay === 'function') syncVaultCounterDisplay();
  
  if (btnElement) {
    btnElement.textContent = 'Saved';
    btnElement.classList.add('saved');
  }

  const viewVault = document.getElementById('view-vault');
  if (viewVault && viewVault.style.display !== 'none') {
    if (typeof renderVaultGridToDedicatedView === 'function') renderVaultGridToDedicatedView();
    if (typeof renderVaultFoldersNav === 'function') renderVaultFoldersNav();
  }
  
  // Re-render home folder nav so new/empty folders show up immediately once an item is added
  if (typeof renderHomeFolderTabs === 'function') renderHomeFolderTabs();
};

function openFolderMenu(e, post, anchorBtn, onUpdateCallback = null) {
  e.stopPropagation();
  currentSavePost = post;
  currentSaveAnchor = anchorBtn;
  currentSaveCallback = onUpdateCallback;

  if (saveModalSearch) saveModalSearch.value = '';
  if (saveModalNewInput) saveModalNewInput.value = '';
  renderSaveModalFolders();

  if (saveModalOverlay) saveModalOverlay.style.display = 'flex';
}

function injectPostCardsIntoGrid(data, targetContainer = grid) {
  const fragment = document.createDocumentFragment();
  const newCards = []; // Store references for batch layout calculation

  data.forEach((post, index) => {
    const fileUrl = post.file_url || post.sample_url || post.preview_url;
    const previewUrl = post.preview_url || post.sample_url || post.file_url;
    if (!fileUrl) return;
    const ext = fileUrl.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm'].includes(ext);
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

    card.classList.add('skeleton-loader');
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.3s ease';

    img.onload = () => {
      card.classList.remove('skeleton-loader');
      img.style.opacity = '1';
    };

    img.onerror = () => {
      card.classList.remove('skeleton-loader');
      img.style.display = 'none';
      const errorMsg = document.createElement('div');
      errorMsg.innerHTML = '⚠️ Unavailable';
      errorMsg.style.padding = '40px 20px';
      errorMsg.style.color = 'var(--muted)';
      errorMsg.style.textAlign = 'center';
      card.appendChild(errorMsg);
    };
    card.appendChild(img);
    if (isVideo) {
      const label = document.createElement('div');
      label.className = 'video-badge';
      label.textContent = '🎬 VIDEO';
      card.appendChild(label);
      card.addEventListener('mouseenter', () => {
        const v = document.createElement('video');
        v.src = fileUrl; v.muted = true; v.loop = true; v.playsInline = true; v.disablePictureInPicture = true; v.controlsList = "nodownload noplaybackrate"; v.className = 'hover-video';
        v.style.pointerEvents = 'none'; // Block Opera UI injections
        card.appendChild(v); v.play().catch(() => { });
      });
      card.addEventListener('mouseleave', () => {
        const v = card.querySelector('.hover-video'); if (v) v.remove();
      });
    }

    // Pinterest Save Widget
    const saveWidget = document.createElement('div');
    saveWidget.className = 'pinterest-save-widget';

    const folderWrapper = document.createElement('div');
    folderWrapper.className = 'custom-select-wrapper';

    const folderBtn = document.createElement('button');
    folderBtn.className = 'pinterest-folder-select';

    // folderList is appended to saveWidget (not folderWrapper) so it can
    // span the full width of the widget (folder btn left → Merken btn right)
    const folderList = document.createElement('ul');
    folderList.className = 'custom-options-list card-folder-list';

    const suggestedInit = typeof suggestFolderForPost === 'function'
      ? suggestFolderForPost(post)
      : ((typeof getVaultFolders === 'function' ? getVaultFolders() : vaultedFolders)[0] || 'Saved');

    folderBtn.textContent = suggestedInit;
    folderWrapper.dataset.value = suggestedInit;

    // Helper: (re)build the folder list from the live folder array each time the dropdown opens
    const refreshFolderList = () => {
      const currentFolders = typeof getVaultFolders === 'function' ? getVaultFolders() : vaultedFolders;
      const currentValue = folderWrapper.dataset.value;
      folderList.innerHTML = '';

      // Ensure the currently selected value is always present
      const folderSet = new Set(currentFolders);
      folderSet.add(currentValue);

      Array.from(folderSet).forEach(f => {
        // Find the first (oldest) image added to this folder
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
          
          // Auto-save to the selected folder
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

    // Figure out the best title for the card
    const rawTags = (post.tags || '').split(/\s+/).filter(Boolean);
    let cardTitle = '';

    // Only display Artist or Character on the grid
    const artistTag = rawTags.find(t => typeof algoTagsCache !== 'undefined' && algoTagsCache[t] === 'artist');
    const charTag = rawTags.find(t => typeof algoTagsCache !== 'undefined' && algoTagsCache[t] === 'character');

    if (artistTag) cardTitle = artistTag;
    else if (charTag) cardTitle = charTag;

    if (cardTitle) {
      cardTitle = cardTitle.replace(/_/g, ' ');
      cardTitle = cardTitle.charAt(0).toUpperCase() + cardTitle.slice(1);
    }

    const footer = document.createElement('div');
    footer.className = 'pinterest-card-footer';
    footer.innerHTML = `
      <div class="pinterest-card-title">${cardTitle}</div>
      <button class="pinterest-card-options" aria-label="More options">
         <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
         </svg>
      </button>
      <div class="card-options-dropdown">
         <ul>
           <li onclick="window.open('${post.file_url}', '_blank'); event.stopPropagation();">
             <img src="Icons/icons8-download-48.png" class="dropdown-icon" /> Download Image
           </li>
           <li onclick="navigator.clipboard.writeText('${post.file_url}'); if(typeof triggerToastNotification === 'function') triggerToastNotification('Image URL copied to clipboard!'); event.stopPropagation();">
             <img src="Icons/icons8-link-48.png" class="dropdown-icon" /> Share Link
           </li>
           <li class="text-danger" onclick="document.getElementById('report-modal').style.display='flex'; event.stopPropagation();">
             <img src="Icons/icons8-error-30.png" class="dropdown-icon danger-icon" /> Report Image
           </li>
         </ul>
      </div>
    `;

    const optionsBtn = footer.querySelector('.pinterest-card-options');
    const dropdown = footer.querySelector('.card-options-dropdown');
    
    optionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close all other open dropdowns first
      document.querySelectorAll('.card-options-dropdown.show').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
      });
      dropdown.classList.toggle('show');
    });

    // We can use a global event listener to close all dropdowns when clicking outside
    if (!window.hasCardDropdownListener) {
      document.addEventListener('click', () => {
        document.querySelectorAll('.card-options-dropdown.show').forEach(d => d.classList.remove('show'));
      });
      window.hasCardDropdownListener = true;
    }

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

      const isVaultContainer = (targetContainer && targetContainer.id === 'vault-grid');
      const targetArray = isVaultContainer ? (window.cachedVaultPosts || []) : cachedPosts;
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
    filteredPosts.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else if (sortVal === 'lowest') {
    filteredPosts.sort((a, b) => (a.score || 0) - (b.score || 0));
  }

  vaultStatus.style.display = 'none';
  window.cachedVaultPosts = [...filteredPosts]; // Save in vault-specific array so Images grid cachedPosts is never overwritten

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

async function fetchStandardBatch(tagsParam, page, isBackground = false) {
  const url = `${API}&tags=${encodeURIComponent(tagsParam).replace(/%2B/g, '+')}&limit=${PER_PAGE}&pid=${page}&json=1`;
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(url), {}, isBackground);
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

  while (isPreloading && currentPreloadTags === tagsParam) {
    if (preloadedPagesQueue.length < PRELOAD_BUFFER_SIZE && hasMore) {
      const data = await fetchStandardBatch(tagsParam, currentPreloadPage, true);

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
  if (append && isLoading) return; // Prevent multiple simultaneous page loads
  
  if (!append) {
    isLoading = false;
    if (typeof window.clearBackgroundFetchQueue === 'function') {
      window.clearBackgroundFetchQueue();
    }
  }

  isLoading = true;
  const myVersion = ++window.searchRequestVersion;
  btn.disabled = true; // Disable search button during loading

  const bottomStatusEl = document.getElementById('bottom-status');

  if (!append) {
    grid.innerHTML = ''; // Clear grid only for new searches
    cachedPosts = []; // Clear cached posts for new searches
    if (metaRow) metaRow.style.display = 'none';
    statusEl.style.display = 'block';
    if (bottomStatusEl) bottomStatusEl.style.display = 'none';
    statusEl.innerHTML = '<div class="spinner"></div>Crunching requested parameters...';
    hasMore = true; // Assume there's more for a new search

    // STOP OLD PRELOAD LOOP AND CLEAR QUEUE
    isPreloading = false;
    preloadedPagesQueue = [];
  } else {
    if (bottomStatusEl) bottomStatusEl.style.display = 'block'; // Show spinner at bottom
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
    if (myVersion !== window.searchRequestVersion) {
      isLoading = false;
      btn.disabled = false;
      return;
    }
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
      data = await fetchStandardBatch(tagsParam, page, false);
    }
  } catch (err) {
    data = null;
  }

  if (myVersion !== window.searchRequestVersion) {
    isLoading = false;
    btn.disabled = false;
    return;
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
    if (metaRow) metaRow.style.display = 'flex';
    if (resultCount) resultCount.textContent = `${cachedPosts.length} items loaded dynamically`; // Update total count
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

  setTimeout(() => {
    if (typeof window.checkSentinelVisibility === 'function') {
      window.checkSentinelVisibility();
    }
  }, 300);
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
  if (idx > -1) {
    vaultedPosts.splice(idx, 1); lbFavBtn.classList.remove('favorited'); lbFavBtn.textContent = '🤍 Favorite';
  } else {
    vaultedPosts.unshift(post); lbFavBtn.classList.add('favorited'); lbFavBtn.textContent = '❤️ Favorited';
  }
  localforage.setItem('r34_vault_v2', vaultedPosts);
  syncVaultCounterDisplay();
  if (typeof renderHomeFolderTabs === 'function') {
    renderHomeFolderTabs();
  }

  // Re-render the vault grid if we are currently looking at it
  const viewVault = document.getElementById('view-vault');
  if (viewVault && viewVault.style.display !== 'none' && typeof renderVaultGridToDedicatedView === 'function') {
    renderVaultGridToDedicatedView();
  }
}

window.checkSentinelVisibility = function() {
  if (isViewingVault) return;
  
  const isAlgo = (sortSelect && sortSelect.value === 'algo:discover');
  const isAlgoLoadingSafe = (typeof isAlgoLoading !== 'undefined') ? isAlgoLoading : false;
  const loading = isAlgo ? isAlgoLoadingSafe : isLoading;
  if (loading || !hasMore) return;

  if (scrollSentinel) {
    const rect = scrollSentinel.getBoundingClientRect();
    if (rect.top < window.innerHeight + 150) {
      if (typeof loadNextPage === 'function') {
        loadNextPage();
      }
    }
  }
};

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
  if (input.value.trim() !== '') addPill(input.value);
  disableVaultViewMode();
  scrollSentinel.style.display = 'flex'; // Ensure sentinel is visible for new searches
  currentTags = tagsArray.join(' ');
  currentPage = 0; // Reset page for a new search

  if (currentTags.trim() !== '') {
    window.algoTargetFolder = null;
    if (typeof renderHomeFolderTabs === 'function') renderHomeFolderTabs();
  }

  // Toggle sorting & timeframe capsules visibility based on whether tags/search is active
  const sortContainer = document.getElementById('search-sort-container');
  const timeframeContainer = document.getElementById('search-timeframe-container');
  if (currentTags.trim() === '') {
    if (sortContainer) sortContainer.style.display = 'none';
    if (timeframeContainer) timeframeContainer.style.display = 'none';
  } else {
    if (sortContainer) sortContainer.style.display = 'flex';
    if (timeframeContainer) timeframeContainer.style.display = 'flex';
  }

  // Auto-switch away from algorithm if user is making a specific custom search
  if (sortSelect && sortSelect.value === 'algo:discover' && currentTags !== '') {
    sortSelect.value = ''; // switch to default order
    if (typeof updateSortButtonsUI === 'function') {
      updateSortButtonsUI('');
    }
  }

  if (sortSelect && sortSelect.value === 'algo:discover') {
    if (typeof pullBlendedBatch === 'function') {
      pullBlendedBatch(false, true);
      return;
    }
  }

  search(currentTags, currentPage, false); // Start a new search, not appending
}

// Reset to algorithm feed (triggered when clicking the Images tab again or on load)
function resetToAlgorithmFeed() {
  tagsArray = [];
  if (typeof renderPills === 'function') {
    renderPills();
  }
  if (input) {
    input.value = '';
  }
  currentTags = '';

  window.algoTargetFolder = null;
  if (typeof renderHomeFolderTabs === 'function') {
    renderHomeFolderTabs();
  }

  if (sortSelect) {
    sortSelect.value = 'algo:discover';
  }
  if (typeof updateSortButtonsUI === 'function') {
    updateSortButtonsUI('algo:discover');
  }

  if (timeframeSelect) {
    timeframeSelect.value = 'all';
  }
  if (typeof updateTimeframeUI === 'function') {
    updateTimeframeUI('all');
  }

  const sortContainer = document.getElementById('search-sort-container');
  if (sortContainer) {
    sortContainer.style.display = 'none';
  }

  const timeframeContainer = document.getElementById('search-timeframe-container');
  if (timeframeContainer) {
    timeframeContainer.style.display = 'none';
  }

  doSearch();
}

// The nav-images listener has been moved to navigation.js to allow contextual refreshing

btn.addEventListener('click', doSearch);

// Search Sort Capsule Logic
const sortBtnScore = document.getElementById('sort-btn-score');
const sortBtnTime = document.getElementById('sort-btn-time');
const sortBtnRandom = document.getElementById('sort-btn-random');
const sortToggleBtn = document.getElementById('sort-toggle-btn');
const sortContainer = document.getElementById('search-sort-container');

// Define custom image paths for sorting options
const SORT_ICONS = {
  'algo:discover': 'Icons/icons8-dice-32.png',
  'sort:score:desc': 'Icons/icons8-star-48.png',
  'sort:score:asc': 'Icons/icons8-star-48.png',
  'sort:id:desc': 'Icons/icons8-clock-30.png',
  'sort:id:asc': 'Icons/icons8-clock-30.png',
  'sort:random': 'Icons/icons8-dice-32.png'
};

function updateSortButtonsUI(value) {
  if (!sortBtnScore || !sortBtnTime || !sortBtnRandom || !sortToggleBtn) return;

  if (value !== 'algo:discover') {
    window.algoTargetFolder = null;
    if (typeof renderHomeFolderTabs === 'function') {
      renderHomeFolderTabs();
    }
  }

  // Remove active and reversed classes from all buttons and their child images
  [sortBtnScore, sortBtnTime, sortBtnRandom].forEach(btn => {
    btn.classList.remove('active');
    const img = btn.querySelector('img');
    if (img) img.classList.remove('reversed');
  });

  const toggleImg = sortToggleBtn.querySelector('img');
  if (toggleImg) toggleImg.classList.remove('reversed');

  let activeIconKey = 'sort:id:desc'; // Default fallback

  if (value === 'algo:discover') {
    activeIconKey = 'algo:discover';
  } else if (value.startsWith('sort:score:')) {
    sortBtnScore.classList.add('active');
    activeIconKey = value;
    const img = sortBtnScore.querySelector('img');
    const isReversed = (value === 'sort:score:asc');
    if (img) {
      img.src = SORT_ICONS[value] || SORT_ICONS['sort:score:desc'];
      if (isReversed) img.classList.add('reversed');
    }
  } else if (value.startsWith('sort:id:') || value === '') {
    sortBtnTime.classList.add('active');
    const valKey = value || 'sort:id:desc';
    activeIconKey = valKey;
    const img = sortBtnTime.querySelector('img');
    const isReversed = (valKey === 'sort:id:asc');
    if (img) {
      img.src = SORT_ICONS[valKey] || SORT_ICONS['sort:id:desc'];
      if (isReversed) img.classList.add('reversed');
    }
  } else if (value === 'sort:random') {
    sortBtnRandom.classList.add('active');
    activeIconKey = 'sort:random';
  }

  // Update the toggle button icon
  if (toggleImg) {
    toggleImg.src = SORT_ICONS[activeIconKey] || SORT_ICONS['sort:id:desc'];
    // If the active sort is reversed, flip the toggle button's icon too
    if (activeIconKey === 'sort:score:asc' || activeIconKey === 'sort:id:asc') {
      toggleImg.classList.add('reversed');
    }
  }

  // Update titles
  if (value === 'sort:score:desc') {
    sortBtnScore.title = 'Sort by Score (Highest First)';
  } else if (value === 'sort:score:asc') {
    sortBtnScore.title = 'Sort by Score (Lowest First)';
  }

  if (value === 'sort:id:desc') {
    sortBtnTime.title = 'Sort by Time (Newest First)';
  } else if (value === 'sort:id:asc') {
    sortBtnTime.title = 'Sort by Time (Oldest First)';
  }

  if (sortSelect) {
    sortSelect.value = value;
  }
}

if (sortToggleBtn && sortContainer) {
  sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortContainer.classList.toggle('expanded');
    // Collapse timeframe capsule when sort is opened
    const timeframeContainer = document.getElementById('search-timeframe-container');
    if (timeframeContainer) timeframeContainer.classList.remove('expanded');
  });
}

if (sortBtnScore) {
  sortBtnScore.addEventListener('click', (e) => {
    e.stopPropagation();
    let currentVal = sortSelect ? sortSelect.value : 'sort:score:desc';
    let newVal = 'sort:score:desc';
    if (currentVal === 'sort:score:desc') {
      newVal = 'sort:score:asc';
    }
    updateSortButtonsUI(newVal);
    doSearch();
  });
}

if (sortBtnTime) {
  sortBtnTime.addEventListener('click', (e) => {
    e.stopPropagation();
    let currentVal = sortSelect ? sortSelect.value : 'sort:id:desc';
    let newVal = 'sort:id:desc';
    if (currentVal === 'sort:id:desc') {
      newVal = 'sort:id:asc';
    }
    updateSortButtonsUI(newVal);
    doSearch();
  });
}

if (sortBtnRandom) {
  sortBtnRandom.addEventListener('click', (e) => {
    e.stopPropagation();
    updateSortButtonsUI('sort:random');
    doSearch();
  });
}

// Search Timeframe Capsule Logic
const timeframeToggleBtn = document.getElementById('timeframe-toggle-btn');
const timeframeContainer = document.getElementById('search-timeframe-container');
const timeframeOptions = document.querySelectorAll('.timeframe-option-btn');

function updateTimeframeUI(value) {
  if (!timeframeContainer || !timeframeToggleBtn || !timeframeSelect) return;

  // Remove active classes from options
  timeframeOptions.forEach(btn => btn.classList.remove('active'));

  // Find the button with this value and activate it
  const targetBtn = Array.from(timeframeOptions).find(btn => btn.dataset.value === value);
  if (targetBtn) {
    targetBtn.classList.add('active');
  }

  // Update backend select dropdown value
  timeframeSelect.value = value;
}

if (timeframeToggleBtn && timeframeContainer) {
  timeframeToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    timeframeContainer.classList.toggle('expanded');
    // Collapse sort capsule when timeframe is opened
    if (sortContainer) sortContainer.classList.remove('expanded');
  });
}

timeframeOptions.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const val = btn.dataset.value;
    updateTimeframeUI(val);
    timeframeContainer.classList.remove('expanded');
    doSearch();
  });
});

// Close sorting and timeframe capsules on click outside
document.addEventListener('click', (e) => {
  if (sortContainer && !sortContainer.contains(e.target)) {
    sortContainer.classList.remove('expanded');
  }
  if (timeframeContainer && !timeframeContainer.contains(e.target)) {
    timeframeContainer.classList.remove('expanded');
  }
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
  if (sortSelect) {
    updateSortButtonsUI(sortSelect.value);
  }
  doSearch(); // Automatically generate the feed on startup
});

const vaultExportBtn = document.getElementById('vault-export-btn');
const vaultImportBtn = document.getElementById('vault-import-btn');
const vaultImportInput = document.getElementById('vault-import-input');

if (vaultExportBtn) vaultExportBtn.addEventListener('click', exportVault);
if (vaultImportBtn) vaultImportBtn.addEventListener('click', () => vaultImportInput.click());
if (vaultImportInput) vaultImportInput.addEventListener('change', (e) => {
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
  if (!container) return;
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
  if (!container) return;
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
  if (!input || !box) return;
  let timeout;

  input.addEventListener('input', (e) => {
    clearTimeout(timeout);
    let text = e.target.value.trim();
    if (text.startsWith('-')) text = text.slice(1);
    if (text.length < 2) {
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
    if (this.btn) {
      this.btn.addEventListener('click', () => this.toggle());
    }

    // Pause if user interacts with lightbox
    const stopInteract = () => { if (this.isPlaying) this.stop(); };
    if (typeof lbPrevBtn !== 'undefined') lbPrevBtn.addEventListener('click', stopInteract);
    if (typeof lbNextBtn !== 'undefined') lbNextBtn.addEventListener('click', stopInteract);
    if (typeof lbClose !== 'undefined') lbClose.addEventListener('click', stopInteract);
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    const posts = typeof getLightboxPosts === 'function' ? getLightboxPosts() : cachedPosts;
    if (posts.length === 0) {
      triggerToastNotification("No images to play!");
      return;
    }
    this.isPlaying = true;
    if (this.btn) {
      this.btn.innerHTML = '⏸ Stop';
      this.btn.style.background = '#f43f5e';
    }
    triggerToastNotification("Slideshow started");

    if (!lightbox.classList.contains('open')) {
      openLightbox(0);
    }

    this.timer = setInterval(() => {
      if (!lightbox.classList.contains('open')) {
        this.stop();
        return;
      }
      const posts = typeof getLightboxPosts === 'function' ? getLightboxPosts() : cachedPosts;
      if (currentPostIndex < posts.length - 1) {
        lbNextBtn.click();
      } else {
        if (hasMore) {
          loadNextPage();
          // wait a bit for it to load, then next
          setTimeout(() => {
            const updatedPosts = typeof getLightboxPosts === 'function' ? getLightboxPosts() : cachedPosts;
            if (currentPostIndex < updatedPosts.length - 1) lbNextBtn.click();
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
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.btn) {
      this.btn.innerHTML = '▶ Play';
      this.btn.style.background = 'var(--accent-purple)';
    }
  }
}

const slideshow = new Slideshow();