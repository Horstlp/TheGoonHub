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
  const tagsParam = 'video sort:random score:>=300';
  
  // FIXED: Removed incremental pid and added a live timestamp query parameter (&cb=) 
  // We bump limit to 20 to ensure a thick cushion of items after filtering duplicates!
  const url = `${API}&tags=${encodeURIComponent(tagsParam)}&limit=20&json=1&cb=${Date.now()}`;
  
  try {
    const res = await fetch(PROXY + encodeURIComponent(url));
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
    video.muted = false; 
    
    wrapper.addEventListener('click', (e) => {
      if(e.target.closest('.tiktok-actions-right') || e.target.closest('.tiktok-controls')) return;
      if(video.paused) {
        video.play().catch(()=>{});
      } else {
        video.pause();
      }
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
        // Reset the inner HTML when openFolderMenu updates textContent, so we override it to an icon
        const originalTextContent = saveBtn.textContent;
        openFolderMenu(e, post, saveBtn);

        // Wait for next frame to swap text Content back to icon since openFolderMenu overrides it with text
        setTimeout(() => {
           const currentlySaved = vaultedPosts.some(p => String(p.id) === String(post.id));
           saveBtn.innerHTML = currentlySaved ? '💖' : '🤍';
           saveBtn.classList.toggle('active-save', currentlySaved);
           saveBtn.style.backgroundColor = ''; // reset openFolderMenu inline styles
        }, 10);
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
      video.muted = !video.muted;
      muteBtn.innerHTML = video.muted ? '🔇' : '🔊';
    });

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

    wrapper.appendChild(video);
    wrapper.appendChild(info);
    wrapper.appendChild(actionsRight);
    wrapper.appendChild(controlsWrap);
    tiktokContainer.appendChild(wrapper);

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