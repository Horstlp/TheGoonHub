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
  const isVault = (document.getElementById('view-vault') && document.getElementById('view-vault').style.display !== 'none');
  return isVault ? (window.cachedVaultPosts || []) : (window.cachedPosts || cachedPosts || []);
}

window.lightboxOpenInView = null;

function openLightbox(index) {
  const posts = getLightboxPosts();
  currentPostIndex = index; const post = posts[index];
  lbContainer.innerHTML = ''; lbTagsStreamBox.innerHTML = '';
  const originalExt = (post.file_url || '').split('.').pop().toLowerCase();
  const isVideo = ['mp4','webm'].includes(originalExt);
  const fileUrl = isVideo ? post.file_url : (post.sample_url || post.file_url);
  
  if (isVideo) {
    const v = document.createElement('video'); v.src = fileUrl; v.controls = true; v.autoplay = true; v.loop = true; v.playsInline = true; v.disablePictureInPicture = true; v.controlsList = "nodownload noplaybackrate"; lbContainer.appendChild(v);
    v.onloadedmetadata = () => document.getElementById('lightbox-info').style.height = `${v.clientHeight}px`;
  } else {
    const img = document.createElement('img'); img.src = fileUrl; lbContainer.appendChild(img);
    img.onload = () => document.getElementById('lightbox-info').style.height = `${img.clientHeight}px`;
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
        });
        lbFolderOptions.appendChild(li);
      };

      Array.from(folderSet).forEach(f => buildOption(f));

      // Toggle open/close
      lbFolderBtn.onclick = (e) => {
        e.stopPropagation();
        lbFolderWrapper.classList.toggle('open');
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
}

function closeLightbox() {
  lightbox.classList.remove('open'); lbContainer.innerHTML = ''; document.body.style.overflow = '';
  window.lightboxOpenInView = null;
}

function navigateLightbox(dir) {
  const tidx = currentPostIndex + dir;
  if (tidx >= 0 && tidx < getLightboxPosts().length) openLightbox(tidx);
}

lbClose.addEventListener('click', closeLightbox);
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
