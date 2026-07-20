let videoPosts = [];
let isVideoLoading = false;
const tiktokContainer = document.getElementById('tiktok-container');
const videoStatus = document.getElementById('video-status');
let currentVideoObserver = null;

// 🧠 Smart Filter Pipeline: Tracks IDs seen this session so duplicates are instantly killed
const seenVideoIds = new Set();

async function initVideoScroller() {
  if (typeof vaultReadyPromise !== 'undefined') {
      await vaultReadyPromise;
  }
  if (videoPosts.length === 0 && !isVideoLoading) {
    await loadMoreVideos();
  }
}

let videoPageIndex = 0;

async function loadMoreVideos() {
  if (isVideoLoading) return;
  
  if (typeof generateRawAlgoBatch !== 'function') {
      videoStatus.innerHTML = '<span class="icon">⚠️</span>Algorithm engine not ready yet.';
      return;
  }
  
  isVideoLoading = true;
  videoStatus.style.display = 'block';
  
  try {
    console.log(`[TIKTOK-DEBUG] Calling generateRawAlgoBatch(pageIndex=${videoPageIndex}, enforceVideo=true)`);
    const rawBatch = await generateRawAlgoBatch(videoPageIndex, true);
    console.log(`[TIKTOK-DEBUG] generateRawAlgoBatch returned ${rawBatch ? rawBatch.length : 0} items`);
    
    if (rawBatch && rawBatch.length > 0) {
      // Filter out any posts the user has already loaded, AND filter for actual animated extensions
      const uniqueNewVideos = rawBatch.filter(post => {
          if (seenVideoIds.has(String(post.id))) return false;
          const fileUrl = post.file_url || post.sample_url;
          if (!fileUrl) return false;
          const ext = fileUrl.split('.').pop().toLowerCase();
          return ['mp4', 'webm', 'gif'].includes(ext);
      });
      console.log(`[TIKTOK-DEBUG] After deduplication and animated extension filter, ${uniqueNewVideos.length} actual animations remain`);
      
      if (uniqueNewVideos.length > 0) {
        // Register the new items into our session memory bank
        uniqueNewVideos.forEach(post => seenVideoIds.add(String(post.id)));
        
        videoStatus.style.display = 'none';
        videoPosts = videoPosts.concat(uniqueNewVideos);
        appendVideosToScroller(uniqueNewVideos);
        videoPageIndex++; // Increment page on success
      } else {
        // We found posts, but they were all duplicates (already seen).
        // Instead of recursively re-rolling and risking a stack overflow, we just increment and allow the observer to trigger again if needed.
        console.log(`[TIKTOK-DEBUG] All items were duplicates. Halting fetch to prevent loop (pageIndex=${videoPageIndex + 1})`);
        videoPageIndex++;
      }
    } else {
        // Empty batch from API - likely hit the end of results for these tags.
        console.log(`[TIKTOK-DEBUG] Batch was empty. Reached end of algorithm feed for pageIndex=${videoPageIndex}`);
        videoStatus.innerHTML = '<span class="icon">😶</span>No more videos found matching your Vault DNA.';
    }
  } catch(err) {
    console.error(err);
    videoStatus.innerHTML = '<span class="icon">⚠️</span>Network pipeline disruption while fetching videos.';
  }
  
  isVideoLoading = false;
}

function appendVideosToScroller(data) {
  data.forEach((post, index) => {
    const fileUrl = post.file_url || post.sample_url;
    if (!fileUrl) return;
    const ext = fileUrl.split('.').pop().toLowerCase();
    if (!['mp4', 'webm', 'gif'].includes(ext)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'tiktok-wrapper';
    wrapper.dataset.originalSrc = fileUrl;
    
    let mediaEl;
    if (ext === 'gif') {
        mediaEl = document.createElement('img');
        mediaEl.src = fileUrl;
        mediaEl.className = 'tiktok-video tiktok-gif'; // reuse class for styling
        mediaEl.style.objectFit = 'contain';
    } else {
        mediaEl = document.createElement('video');
        mediaEl.src = fileUrl;
        mediaEl.className = 'tiktok-video';
        mediaEl.loop = true;
        mediaEl.playsInline = true;
        mediaEl.disablePictureInPicture = true;
        mediaEl.controlsList = "nodownload noplaybackrate";
        mediaEl.style.pointerEvents = 'none'; // Block Opera UI injections
        mediaEl.muted = window.globalTiktokMuted !== undefined ? window.globalTiktokMuted : true;
        if (window.globalTiktokMuted === undefined) window.globalTiktokMuted = true;
    }
    
    let clickTimeout;
    wrapper.addEventListener('click', (e) => {
      if(e.target.closest('.tiktok-actions-right') || e.target.closest('.tiktok-controls')) return;
      
      // Delay single click to allow double click to fire without toggling pause
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      } else {
        clickTimeout = setTimeout(() => {
          if (ext !== 'gif') {
              if(mediaEl.paused) {
                mediaEl.play().catch(()=>{});
              } else {
                mediaEl.pause();
              }
          }
          clickTimeout = null;
        }, 250);
      }
    });

    wrapper.addEventListener('dblclick', (e) => {
      if(e.target.closest('.tiktok-actions-right') || e.target.closest('.tiktok-controls')) return;
      
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      
      likeBtn.click();
      
      const heart = document.createElement('div');
      heart.innerHTML = '❤️';
      heart.className = 'floating-heart';
      heart.style.left = `${e.clientX - 25}px`;
      heart.style.top = `${e.clientY - 25}px`;
      document.body.appendChild(heart);
      setTimeout(() => heart.remove(), 1000);
    });

    // Info overlay
    const info = document.createElement('div');
    info.className = 'tiktok-info';
    info.style.cssText = 'position: absolute; bottom: 40px; left: 20px; right: 90px; color: white; z-index: 10; text-shadow: 0 1px 4px rgba(0,0,0,0.8); pointer-events: none;';
    
    info.innerHTML = `
      <div class="tiktok-score">Score: ${post.score ?? 0}</div>
      <div class="tiktok-tags" style="font-size: 0.85rem; opacity: 0.9; max-height: 80px; overflow-y: auto; pointer-events: auto; scrollbar-width: none;">${post.tags || ''}</div>
    `;

    // Right Action Buttons
    const actionsRight = document.createElement('div');
    actionsRight.className = 'tiktok-actions-right';

    // Like Button
    const likeBtn = document.createElement('div');
    likeBtn.className = 'tiktok-circle-btn';
    const isLiked = typeof likedPosts !== 'undefined' && likedPosts.includes(String(post.id));
    if(isLiked) likeBtn.classList.add('active-like');
    likeBtn.innerHTML = isLiked ? '♥' : '♡';
    likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(typeof togglePostLikeStatus === 'function') togglePostLikeStatus(post.id);
      const newlyLiked = likedPosts.includes(String(post.id));
      likeBtn.classList.toggle('active-like', newlyLiked);
      likeBtn.innerHTML = newlyLiked ? '♥' : '♡';
    });

    // Save Button
    const saveBtn = document.createElement('div');
    saveBtn.className = 'tiktok-circle-btn';
    const isSaved = vaultedPosts.some(p => String(p.id) === String(post.id));
    if(isSaved) saveBtn.classList.add('active-save');
    saveBtn.innerHTML = isSaved ? '💖' : '🤍';

    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(typeof openFolderMenu === 'function') {
        openFolderMenu(e, post, saveBtn, (isSavedNow) => {
           saveBtn.innerHTML = isSavedNow ? '💖' : '🤍';
           saveBtn.classList.toggle('active-save', isSavedNow);
        });
      } else if(typeof togglePostFavoriteStatus === 'function') {
        togglePostFavoriteStatus(post);
        const currentlySaved = vaultedPosts.some(p => String(p.id) === String(post.id));
        saveBtn.classList.toggle('active-save', currentlySaved);
        saveBtn.innerHTML = currentlySaved ? '💖' : '🤍';
      }
    });

    // Mute Button (only relevant for actual videos, but we'll show it for uniformity and just ignore clicks for gifs)
    const muteBtn = document.createElement('div');
    muteBtn.className = 'tiktok-circle-btn';
    muteBtn.innerHTML = ext === 'gif' ? '🔇' : (mediaEl.muted ? '🔇' : '🔊');
    if (ext === 'gif') muteBtn.style.opacity = '0.5';
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ext === 'gif') return;
      
      window.globalTiktokMuted = !window.globalTiktokMuted;
      
      // Update all currently rendered videos
      document.querySelectorAll('.tiktok-video').forEach(v => {
        v.muted = window.globalTiktokMuted;
      });
      
      // Update all mute buttons
      document.querySelectorAll('.tiktok-circle-btn').forEach(btn => {
        if(btn.innerHTML === '🔇' || btn.innerHTML === '🔊') {
          btn.innerHTML = window.globalTiktokMuted ? '🔇' : '🔊';
        }
      });
    });

    // Remove PiP Button to respect Opera restrictions and keep UI clean

    actionsRight.appendChild(likeBtn);
    actionsRight.appendChild(saveBtn);
    actionsRight.appendChild(muteBtn);

    // Timeline Scrubber
    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'tiktok-controls';
    
    const scrubberWrap = document.createElement('div');
    scrubberWrap.className = 'tiktok-scrubber-wrap';
    const scrubberFill = document.createElement('div');
    scrubberFill.className = 'tiktok-scrubber-fill';
    
    scrubberWrap.appendChild(scrubberFill);
    controlsWrap.appendChild(scrubberWrap);

    if (ext !== 'gif') {
        mediaEl.addEventListener('timeupdate', () => {
          if (mediaEl.duration) {
            const percent = (mediaEl.currentTime / mediaEl.duration) * 100;
            scrubberFill.style.width = `${percent}%`;
          }
        });

        scrubberWrap.addEventListener('click', (e) => {
          e.stopPropagation();
          const rect = scrubberWrap.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const width = rect.width;
          const percent = clickX / width;
          if (mediaEl.duration) {
            mediaEl.currentTime = percent * mediaEl.duration;
          }
        });
    } else {
        controlsWrap.style.display = 'none';
    }

    wrapper.appendChild(mediaEl);
    wrapper.appendChild(info);
    wrapper.appendChild(actionsRight);
    wrapper.appendChild(controlsWrap);
    tiktokContainer.appendChild(wrapper);

    // Attribute Virtualization Observer
    if (!window.virtualizeObserver) {
      window.virtualizeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const v = entry.target.querySelector('.tiktok-video');
          if (!v) return;
          const originalSrc = entry.target.dataset.originalSrc;
          if (entry.isIntersecting) {
            if (!v.getAttribute('src')) {
              v.setAttribute('src', originalSrc);
            }
          } else {
            v.removeAttribute('src');
            if (v.tagName.toLowerCase() === 'video') v.load();
          }
        });
      }, { rootMargin: '2000px 0px' });
    }
    window.virtualizeObserver.observe(wrapper);

    // Observe to play/pause
    if (!currentVideoObserver) {
      currentVideoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const v = entry.target.querySelector('video');
          if (entry.isIntersecting) {
            if (v) v.play().catch(()=>console.log("Autoplay blocked by browser policy"));
            
            // Trigger pre-fetch pipeline when user reaches the final card in layout stack
            if (tiktokContainer.lastElementChild === entry.target) {
              loadMoreVideos();
            }
          } else {
            if (v) v.pause();
          }
        });
      }, { threshold: 0.6 });
    }
    
    currentVideoObserver.observe(wrapper);
  });
}