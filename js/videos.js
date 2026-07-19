let videoPosts = [];
let isVideoLoading = false;
const tiktokContainer = document.getElementById('tiktok-container');
const videoStatus = document.getElementById('video-status');
let currentVideoObserver = null;

// 🧠 Smart Filter Pipeline: Tracks IDs seen this session so duplicates are instantly killed
const seenVideoIds = new Set();

async function initVideoScroller() {
  if (videoPosts.length === 0 && !isVideoLoading) {
    await loadMoreVideos();
  }
}

async function loadMoreVideos() {
  if (isVideoLoading) return;
  isVideoLoading = true;
  videoStatus.style.display = 'block';

  // Search for high score videos with a fresh cache-busting timestamp attached
  let tagsParam = 'video sort:random score:>=300';
  
  if (typeof globalBlacklist !== 'undefined' && globalBlacklist.length > 0) {
    globalBlacklist.forEach(t => tagsParam += ` -${t}`);
  }
  if (typeof globalWhitelist !== 'undefined' && globalWhitelist.length > 0) {
    globalWhitelist.forEach(t => tagsParam += ` ${t}`);
  }
  
  // FIXED: Removed incremental pid and added a live timestamp query parameter (&cb=) 
  // We bump limit to 20 to ensure a thick cushion of items after filtering duplicates!
  const url = `${API}&tags=${encodeURIComponent(tagsParam)}&limit=20&json=1&cb=${Date.now()}`;
  
  try {
    const res = await throttledFetch(PROXY + encodeURIComponent(url));
    const data = await res.json();
    
    if (data && data.length > 0) {
      // Filter out any posts the user has already loaded during this session
      const uniqueNewVideos = data.filter(post => !seenVideoIds.has(String(post.id)));
      
      if (uniqueNewVideos.length > 0) {
        // Register the new items into our session memory bank
        uniqueNewVideos.forEach(post => seenVideoIds.add(String(post.id)));
        
        videoStatus.style.display = 'none';
        videoPosts = videoPosts.concat(uniqueNewVideos);
        appendVideosToScroller(uniqueNewVideos);
      } else {
        // If the entire random batch was already seen, silently re-roll the fetch engine!
        isVideoLoading = false;
        await loadMoreVideos();
        return;
      }
    } else {
      if (videoPosts.length === 0) {
        videoStatus.innerHTML = '<span class="icon">😶</span>No videos found matching current score thresholds.';
      }
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
    if (!['mp4', 'webm'].includes(ext)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'tiktok-wrapper';

    const video = document.createElement('video');
    video.src = fileUrl;
    video.className = 'tiktok-video';
    video.loop = true;
    video.playsInline = true;
    video.muted = window.globalTiktokMuted !== undefined ? window.globalTiktokMuted : true;
    if (window.globalTiktokMuted === undefined) window.globalTiktokMuted = true;
    
    let clickTimeout;
    wrapper.addEventListener('click', (e) => {
      if(e.target.closest('.tiktok-actions-right') || e.target.closest('.tiktok-controls')) return;
      
      // Delay single click to allow double click to fire without toggling pause
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      } else {
        clickTimeout = setTimeout(() => {
          if(video.paused) {
            video.play().catch(()=>{});
          } else {
            video.pause();
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

    // Mute Button
    const muteBtn = document.createElement('div');
    muteBtn.className = 'tiktok-circle-btn';
    muteBtn.innerHTML = video.muted ? '🔇' : '🔊';
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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

    // PiP Button
    const pipBtn = document.createElement('div');
    pipBtn.className = 'tiktok-circle-btn';
    pipBtn.innerHTML = '⧉';
    pipBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (err) {
        console.warn("PiP not supported or failed", err);
      }
    });

    actionsRight.appendChild(likeBtn);
    actionsRight.appendChild(saveBtn);
    actionsRight.appendChild(muteBtn);
    actionsRight.appendChild(pipBtn);

    // Timeline Scrubber
    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'tiktok-controls';
    
    const scrubberWrap = document.createElement('div');
    scrubberWrap.className = 'tiktok-scrubber-wrap';
    const scrubberFill = document.createElement('div');
    scrubberFill.className = 'tiktok-scrubber-fill';
    
    scrubberWrap.appendChild(scrubberFill);
    controlsWrap.appendChild(scrubberWrap);

    video.addEventListener('timeupdate', () => {
      if (video.duration) {
        const percent = (video.currentTime / video.duration) * 100;
        scrubberFill.style.width = `${percent}%`;
      }
    });

    scrubberWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = scrubberWrap.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const percent = clickX / width;
      if (video.duration) {
        video.currentTime = percent * video.duration;
      }
    });

    wrapper.dataset.originalSrc = fileUrl;
    wrapper.appendChild(video);
    wrapper.appendChild(info);
    wrapper.appendChild(actionsRight);
    wrapper.appendChild(controlsWrap);
    tiktokContainer.appendChild(wrapper);

    // Attribute Virtualization Observer
    if (!window.virtualizeObserver) {
      window.virtualizeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const v = entry.target.querySelector('video');
          const originalSrc = entry.target.dataset.originalSrc;
          if (entry.isIntersecting) {
            if (!v.getAttribute('src')) {
              v.setAttribute('src', originalSrc);
            }
          } else {
            v.removeAttribute('src');
            v.load();
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
            v.play().catch(()=>console.log("Autoplay blocked by browser policy"));
            
            // Trigger pre-fetch pipeline when user reaches the final card in layout stack
            if (tiktokContainer.lastElementChild === entry.target) {
              loadMoreVideos();
            }
          } else {
            v.pause();
          }
        });
      }, { threshold: 0.6 });
    }
    
    currentVideoObserver.observe(wrapper);
  });
}