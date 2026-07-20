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

function openLightbox(index) {
  currentPostIndex = index; const post = cachedPosts[index];
  lbContainer.innerHTML = ''; lbTagsStreamBox.innerHTML = '';
  const originalExt = (post.file_url || '').split('.').pop().toLowerCase();
  const isVideo = ['mp4','webm'].includes(originalExt);
  const fileUrl = isVideo ? post.file_url : (post.sample_url || post.file_url);
  
  if (isVideo) {
    const v = document.createElement('video'); v.src = fileUrl; v.controls = true; v.autoplay = true; v.loop = true; v.playsInline = true; v.disablePictureInPicture = true; v.controlsList = "nodownload noplaybackrate"; lbContainer.appendChild(v);
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

lbClose.addEventListener('click', closeLightbox);
lbPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(-1); });
lbNextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(1); });
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => { 
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
});
