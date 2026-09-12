// Lightbox Logic for The Better Rule 34
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

function getLightboxPosts() {
  if (window.currentLightboxArray) return window.currentLightboxArray;
  const isVault = (document.getElementById('view-vault') && document.getElementById('view-vault').style.display !== 'none');
  return isVault ? (window.cachedVaultPosts || []) : (window.cachedPosts || cachedPosts || []);
}

window.lightboxOpenInView = null;
window.lightboxHistory = [];

window.pushLightboxHistory = function() {
    // Avoid circular dependencies or incorrect state by capturing values
    window.lightboxHistory.push({
        index: typeof currentPostIndex !== 'undefined' ? currentPostIndex : 0,
        lightboxArray: window.currentLightboxArray,
        algoCurrentPostId: window.lbAlgoCurrentPostId
    });
    const lbBackBtn = document.getElementById('lightbox-back');
    const lbCloseBtn = document.getElementById('lightbox-close');
    const lbSlimCloseBtn = document.getElementById('lightbox-slim-close');
    if (lbBackBtn) lbBackBtn.style.display = 'block';
    if (lbCloseBtn) lbCloseBtn.style.display = 'none';
    if (lbSlimCloseBtn) lbSlimCloseBtn.style.display = 'flex';
};

window.clearLightboxHistory = function() {
    window.lightboxHistory = [];
    const lbBackBtn = document.getElementById('lightbox-back');
    const lbCloseBtn = document.getElementById('lightbox-close');
    const lbSlimCloseBtn = document.getElementById('lightbox-slim-close');
    if (lbBackBtn) lbBackBtn.style.display = 'none';
    if (lbCloseBtn) lbCloseBtn.style.display = 'block';
    if (lbSlimCloseBtn) lbSlimCloseBtn.style.display = 'none';
};

const lbBackBtn = document.getElementById('lightbox-back');
if (lbBackBtn) {
    lbBackBtn.addEventListener('click', () => {
        if (window.lightboxHistory.length > 0) {
            const prevState = window.lightboxHistory.pop();
            window.currentLightboxArray = prevState.lightboxArray;
            window.lbAlgoCurrentPostId = prevState.algoCurrentPostId;
            openLightbox(prevState.index);
            
            if (window.lightboxHistory.length === 0) {
                const lbCloseBtn = document.getElementById('lightbox-close');
                const lbSlimCloseBtn = document.getElementById('lightbox-slim-close');
                lbBackBtn.style.display = 'none';
                if (lbCloseBtn) lbCloseBtn.style.display = 'block';
                if (lbSlimCloseBtn) lbSlimCloseBtn.style.display = 'none';
            }
        }
    });
}
function openLightbox(index) {
  const posts = getLightboxPosts();
  currentPostIndex = index; const post = posts[index];
  lbContainer.innerHTML = ''; lbTagsStreamBox.innerHTML = '';
  // Add a shimmer placeholder so the user never sees a blank lightbox
  const lbShimmer = document.createElement('div');
  lbShimmer.className = 'lb-media-shimmer skeleton-loader';
  if (post.width && post.height) {
    lbShimmer.style.aspectRatio = `${post.width} / ${post.height}`;
  } else {
    lbShimmer.style.aspectRatio = '4 / 3';
  }
  lbContainer.appendChild(lbShimmer);

  const originalExt = (post.file_url || '').split('.').pop().toLowerCase();
  const isVideo = ['mp4','webm'].includes(originalExt);
  let fileUrl = isVideo ? post.file_url : (post.sample_url || post.file_url);
  
  if (post._api_source === 'gelbooru') {
    fileUrl = typeof PROXY !== 'undefined' ? PROXY + encodeURIComponent(fileUrl) : fileUrl;
  }
  
  if (isVideo) {
    const v = document.createElement('video'); 
    v.referrerPolicy = 'no-referrer';
    v.src = typeof getOptimizedVideoUrl === 'function' ? getOptimizedVideoUrl(fileUrl) : fileUrl; 
    v.controls = true; 
    v.preload = "metadata";
    v.poster = post.sample_url || post.preview_url || '';
    v.autoplay = false; 
    v.loop = true; 
    v.playsInline = true; 
    v.disablePictureInPicture = true; 
    v.controlsList = "nodownload noplaybackrate"; 
    v.style.backgroundColor = "#000";
    v.style.opacity = '0';
    v.style.transition = 'opacity 0.4s ease';
    lbContainer.appendChild(v);
    v.onloadeddata = () => {
      setTimeout(() => {
        lbShimmer.remove();
        v.style.opacity = '1';
        if (typeof refreshMasonryLayout === 'function') refreshMasonryLayout(document.getElementById('lb-recommendations-grid'));
      }, 100);
    };
    // Fallback: if metadata loads but data event doesn't fire quickly
    v.onloadedmetadata = () => {
      setTimeout(() => {
        if (v.style.opacity === '0') {
          lbShimmer.remove();
          v.style.opacity = '1';
          if (typeof refreshMasonryLayout === 'function') refreshMasonryLayout(document.getElementById('lb-recommendations-grid'));
        }
      }, 300);
    };
  } else {
    const img = document.createElement('img');
    img.referrerPolicy = 'no-referrer';
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.4s ease';
    img.src = fileUrl;
    lbContainer.appendChild(img);
    img.onload = () => {
      setTimeout(() => {
        lbShimmer.remove();
        img.style.opacity = '1';
        if (typeof refreshMasonryLayout === 'function') refreshMasonryLayout(document.getElementById('lb-recommendations-grid'));
      }, 120);
    };
  }
  lbScore.textContent = `Score: ${post.score ?? 0}`;
  lbSize.textContent  = post.width ? `${post.width}×${post.height}` : '';
  const lbFolderWrapper = document.getElementById('lb-folder-select-wrapper');
  const lbFolderBtn = document.getElementById('lb-folder-select');
  const lbFolderOptions = document.getElementById('lb-folder-options');
  const lbSaveBtn = document.getElementById('lb-save-btn');
  
  if (lbFolderWrapper && lbFolderBtn && lbFolderOptions && lbSaveBtn) {
      // Populate options
      lbFolderOptions.innerHTML = '';
      const allFolders = typeof getVaultFolders === 'function' ? getVaultFolders() : (vaultedFolders || []);
      const suggested = typeof suggestFolderForPost === 'function' ? suggestFolderForPost(post) : (allFolders[0] || 'Saved');
      
      const folderSet = new Set(allFolders);
      folderSet.add(suggested);
      
      let selectedFolder = suggested;
      lbFolderBtn.textContent = suggested;
      lbFolderWrapper.dataset.value = suggested;

      const buildOption = (f) => {
        const li = document.createElement('li');
        li.textContent = f;
        if (f === suggested) li.classList.add('selected');
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedFolder = f;
          lbFolderWrapper.dataset.value = f;
          lbFolderBtn.textContent = f;
          lbFolderOptions.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
          li.classList.add('selected');
          lbFolderWrapper.classList.remove('open');
          lbFolderOptions.classList.remove('open');
        });
        lbFolderOptions.appendChild(li);
      };

      Array.from(folderSet).forEach(f => buildOption(f));

      // Toggle open/close
      lbFolderBtn.onclick = (e) => {
        e.stopPropagation();
        lbFolderWrapper.classList.toggle('open');
        lbFolderOptions.classList.toggle('open');
      };

      const isSaved = vaultedPosts.some(p => String(p.id) === String(post.id));
      if (isSaved) lbSaveBtn.classList.add('saved');
      else lbSaveBtn.classList.remove('saved');
      lbSaveBtn.textContent = isSaved ? 'Saved' : 'Merken';

      // Remove old listeners to prevent duplication
      const newSaveBtn = lbSaveBtn.cloneNode(true);
      lbSaveBtn.parentNode.replaceChild(newSaveBtn, lbSaveBtn);
      
      newSaveBtn.onclick = (e) => {
          e.stopPropagation();
          if (typeof savePostToFolder === 'function') {
              savePostToFolder(post, lbFolderWrapper.dataset.value, newSaveBtn);
          }
      };
  }
  lbDlBtn.onclick  = (e) => { e.stopPropagation(); forceBinaryAssetDownload(fileUrl, post.id); };
  const tags = (post.tags || '').split(/\s+/).filter(Boolean);
  
  let artists = [];
  let others = [];
  
  tags.forEach(t => {
      const type = (typeof algoTagsCache !== 'undefined' && algoTagsCache[t]) ? algoTagsCache[t] : null;
      if (type === 'artist') artists.push(t);
      else others.push({ tag: t, type: type || 'general' });
      
      if (!type && typeof window.queueTagForResolution === 'function') {
          window.queueTagForResolution(t);
      }
  });
  
  for (let i = 0; i < artists.length; i++) {
      const t = artists[i];
      const s = document.createElement('span'); 
      s.className = 'lb-stream-tag'; 
      s.dataset.tag = t;
      s.textContent = t;
      s.style.borderColor = '#fbbf24'; // Yellow for artist
      s.onclick = (e) => { e.stopPropagation(); disableVaultViewMode(); addPill(t); };
      lbTagsStreamBox.appendChild(s);
  }
  
  if (artists.length > 0 && others.length > 0) {
      const sep = document.createElement('div');
      sep.style.width = '100%'; sep.style.height = '1px'; sep.style.background = 'rgba(255,255,255,0.1)'; sep.style.margin = '6px 0';
      lbTagsStreamBox.appendChild(sep);
  }
  
  others.forEach(obj => {
      const s = document.createElement('span'); 
      s.className = 'lb-stream-tag'; 
      s.dataset.tag = obj.tag;
      s.textContent = obj.tag;
      if (obj.type === 'character') s.style.borderColor = '#34d399';
      if (obj.type === 'copyright') s.style.borderColor = '#a78bfa';
      s.onclick = (e) => { e.stopPropagation(); disableVaultViewMode(); addPill(obj.tag); };
      lbTagsStreamBox.appendChild(s);
  });
  lbPrevBtn.style.display = currentPostIndex > 0 ? 'flex' : 'none';
  lbNextBtn.style.display = currentPostIndex < posts.length - 1 ? 'flex' : 'none';
  
  const activeView = document.querySelector('.app-view.active-view')?.id?.replace('view-', '') || 'images';
  window.lightboxOpenInView = activeView;
  
  lightbox.classList.add('open'); document.body.style.overflow = 'hidden';
  
  // Trigger recommendations
  const recsContainer = document.getElementById('lightbox-recommendations');
  if (recsContainer) {
      recsContainer.style.display = 'block';
      if (typeof getSimilarPostsForLightbox === 'function') {
          getSimilarPostsForLightbox(post);
      }
  }
  
  // Apply saved tags state
  const lbTagsToggle = document.getElementById('lb-tags-toggle');
  const lbTagsContainer = document.getElementById('lb-tags-collapse-container');
  if (lbTagsToggle && lbTagsContainer) {
      if (window.lightboxTagsOpen) {
          lbTagsContainer.style.display = 'block';
          lbTagsToggle.classList.add('open');
      } else {
          lbTagsContainer.style.display = 'none';
          lbTagsToggle.classList.remove('open');
      }
  }
}

function closeLightbox() {
  lightbox.classList.remove('open'); lbContainer.innerHTML = ''; document.body.style.overflow = '';
  window.lightboxOpenInView = null;
  window.currentLightboxArray = null;
  if (typeof clearLightboxHistory === 'function') clearLightboxHistory();
}

function navigateLightbox(dir) {
  const tidx = currentPostIndex + dir;
  if (tidx >= 0 && tidx < getLightboxPosts().length) openLightbox(tidx);
}

lbClose.addEventListener('click', closeLightbox);
const lbSlimClose = document.getElementById('lightbox-slim-close');
if (lbSlimClose) lbSlimClose.addEventListener('click', closeLightbox);
lbPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(-1); });
lbNextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(1); });
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => { 
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
});

// Close any open custom folder dropdowns when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
  document.querySelectorAll('.card-folder-list.open').forEach(list => list.classList.remove('open'));
});

// Tags Dropdown Toggle Logic
const lbTagsToggleBtn = document.getElementById('lb-tags-toggle');
const lbTagsContainerBox = document.getElementById('lb-tags-collapse-container');

if (lbTagsToggleBtn && lbTagsContainerBox) {
    lbTagsToggleBtn.addEventListener('click', () => {
        const isOpen = lbTagsContainerBox.style.display === 'block';
        if (isOpen) {
            lbTagsContainerBox.style.display = 'none';
            lbTagsToggleBtn.classList.remove('open');
            window.lightboxTagsOpen = false;
        } else {
            lbTagsContainerBox.style.display = 'block';
            lbTagsToggleBtn.classList.add('open');
            window.lightboxTagsOpen = true;
        }
        // Force masonry layout update after toggle animation
        setTimeout(() => {
            if (typeof refreshMasonryLayout === 'function') refreshMasonryLayout(document.getElementById('lb-recommendations-grid'));
        }, 50);
    });
}
