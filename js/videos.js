let videoPage = 0;
let videoPosts = [];
let isVideoLoading = false;
const tiktokContainer = document.getElementById('tiktok-container');
const videoStatus = document.getElementById('video-status');
let currentVideoObserver = null;

async function initVideoScroller() {
  if (videoPosts.length === 0 && !isVideoLoading) {
    await loadMoreVideos();
  }
}

async function loadMoreVideos() {
  if (isVideoLoading) return;
  isVideoLoading = true;
  videoStatus.style.display = 'block';

  // Search for 'video' and randomize the results so we never get bored
  const tagsParam = 'video sort:random score:>=300';
  const url = `${API}&tags=${encodeURIComponent(tagsParam)}&limit=10&pid=${videoPage}&json=1`;
  
  try {
    const res = await fetch(PROXY + encodeURIComponent(url));
    const data = await res.json();
    
    if (data && data.length > 0) {
      videoStatus.style.display = 'none';
      videoPosts = videoPosts.concat(data);
      appendVideosToScroller(data);
      videoPage++;
    } else {
      videoStatus.innerHTML = '<span class="icon">😶</span>No more videos found.';
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
    video.muted = false; // Start unmuted, user controls via click
    
    // Allow user to click to toggle pause/play
    wrapper.addEventListener('click', () => {
      if(video.paused) {
        video.play();
      } else {
        video.pause();
      }
    });

    const info = document.createElement('div');
    info.className = 'tiktok-info';
    info.style.cssText = 'position: absolute; bottom: 80px; left: 20px; right: 120px; color: white; z-index: 10; text-shadow: 0 1px 4px rgba(0,0,0,0.8); pointer-events: none;';
    
    info.innerHTML = `
      <div class="tiktok-score">Score: ${post.score ?? 0}</div>
      <div class="tiktok-tags" style="font-size: 0.85rem; opacity: 0.9; max-height: 80px; overflow-y: auto; pointer-events: auto; scrollbar-width: none;">${post.tags || ''}</div>
    `;

    // Inline Save Button for TikTok Videos
    const saveBtn = document.createElement('button');
    const isSaved = vaultedPosts.some(p => String(p.id) === String(post.id));
    saveBtn.className = 'video-save-btn';
    saveBtn.textContent = isSaved ? '💖 Saved' : '🤍 Save';
    saveBtn.style.cssText = 'position: absolute; right: 20px; bottom: 80px; z-index: 20; background: rgba(255, 94, 151, 0.2); border: 1px solid #ff5e97; color: white; padding: 10px 16px; border-radius: 24px; font-weight: bold; cursor: pointer; backdrop-filter: blur(8px); transition: all 0.2s;';
    
    if(isSaved) {
      saveBtn.style.background = 'rgba(139, 92, 246, 0.2)';
      saveBtn.style.borderColor = '#8b5cf6';
    }
    
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(typeof togglePostFavoriteStatus === 'function') {
        togglePostFavoriteStatus(post);
        const currentlySaved = vaultedPosts.some(p => String(p.id) === String(post.id));
        saveBtn.textContent = currentlySaved ? '💖 Saved' : '🤍 Save';
        saveBtn.style.background = currentlySaved ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 94, 151, 0.2)';
        saveBtn.style.borderColor = currentlySaved ? '#8b5cf6' : '#ff5e97';
      }
    });

    wrapper.appendChild(video);
    wrapper.appendChild(info);
    wrapper.appendChild(saveBtn);
    tiktokContainer.appendChild(wrapper);

    // Observe to play/pause
    if (!currentVideoObserver) {
      currentVideoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const v = entry.target.querySelector('video');
          if (entry.isIntersecting) {
            v.play().catch(()=>console.log("Autoplay blocked by browser policy"));
            
            // Check if we are near the end to load more
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
