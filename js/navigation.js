window.viewScrollPositions = window.viewScrollPositions || {};

window.handleViewSwitch = function(view) {
    const validViews = ['images', 'manga', 'vault', 'algo'];
    if (!validViews.includes(view)) view = 'images'; // Default fallback

    const targetView = document.getElementById(`view-${view}`);

    // Save scroll position for the current view before we hide it
    const activeViewEl = document.querySelector('.app-view.active-view');
    if (activeViewEl) {
        const activeViewName = activeViewEl.id.replace('view-', '');
        window.viewScrollPositions[activeViewName] = window.scrollY;
    }

    // Update active nav button
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById(`nav-${view}`);
    if (btn) btn.classList.add('active');

    // Hide all views
    document.querySelectorAll('.app-view').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active-view');
    });

    // Show targeted view
    if (targetView) {
        targetView.style.display = 'block';
        // Force a reflow so the animation restarts if clicking the same view or navigating
        void targetView.offsetWidth; 
        targetView.classList.add('active-view');

        // Restore scroll position instantly
        window.scrollTo({
            top: window.viewScrollPositions[view] || 0,
            behavior: 'instant'
        });
    }


    
    if (view === 'vault') {
        if (typeof renderVaultGridToDedicatedView === 'function') renderVaultGridToDedicatedView();
        if (typeof renderVaultFoldersNav === 'function') renderVaultFoldersNav();
    }
    
    if (view === 'algo') {
        if (typeof renderAlgoTable === 'function') renderAlgoTable();
    }
    
    // Toggle lightbox visibility based on which tab it was opened in so it doesn't deload
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        const v = lightbox.querySelector('video');
        if (window.lightboxOpenInView) {
            if (window.lightboxOpenInView === view) {
                lightbox.classList.add('open');
                document.body.style.overflow = 'hidden';
                if (v) v.play().catch(e => console.log('Auto-play prevented:', e));
            } else {
                lightbox.classList.remove('open');
                document.body.style.overflow = '';
                if (v) v.pause();
            }
        } else {
            lightbox.classList.remove('open');
            document.body.style.overflow = '';
            if (v) v.pause();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
  const views = ['images', 'manga', 'vault', 'algo'];
  
  // Set up click listeners to push state to URL Hash instead of immediate DOM manipulation
  views.forEach(view => {
    const btn = document.getElementById(`nav-${view}`);
    if (btn) {
      btn.addEventListener('click', (e) => {
          e.preventDefault();
          let currentHash = window.location.hash.replace('#', '') || 'images';
          
          if (view === currentHash) {
              // If already on the view, trigger a refresh (currently only Images supports this)
              if (view === 'images' && typeof resetToAlgorithmFeed === 'function') {
                  resetToAlgorithmFeed();
              }
          } else {
              // Setting the hash will automatically trigger the 'hashchange' event listener below
              window.location.hash = view;
          }
      });
    }
  });

  // Listen for browser Back/Forward navigation (Hash Change)
  window.addEventListener('hashchange', () => {
      let hash = window.location.hash.replace('#', '');
      handleViewSwitch(hash || 'images');
  });

  // Handle initial page load
  let initialHash = window.location.hash.replace('#', '');
  handleViewSwitch(initialHash || 'images');
});
