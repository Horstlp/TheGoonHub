window.handleViewSwitch = function(view) {
    const validViews = ['images', 'manga', 'vault', 'algo'];
    if (!validViews.includes(view)) view = 'images'; // Default fallback

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
    const targetView = document.getElementById(`view-${view}`);
    if (targetView) {
        targetView.style.display = 'block';
        // Force a reflow so the animation restarts if clicking the same view or navigating
        void targetView.offsetWidth; 
        targetView.classList.add('active-view');
    }


    
    if (view === 'vault') {
        if (typeof renderVaultGridToDedicatedView === 'function') renderVaultGridToDedicatedView();
        if (typeof renderVaultFoldersNav === 'function') renderVaultFoldersNav();
    }
    
    if (view === 'algo') {
        if (typeof renderAlgoTable === 'function') renderAlgoTable();
    }
    
    // Auto-close lightbox if open, so it doesn't leak into other views
    const lightbox = document.getElementById('lightbox');
    if (lightbox && lightbox.style.display === 'flex') {
        if (typeof closeLightbox === 'function') closeLightbox();
        else lightbox.style.display = 'none';
    }
};

document.addEventListener('DOMContentLoaded', () => {
  const views = ['images', 'manga', 'vault', 'algo'];
  
  // Set up click listeners to push state to URL Hash instead of immediate DOM manipulation
  views.forEach(view => {
    const btn = document.getElementById(`nav-${view}`);
    if (btn) {
      btn.addEventListener('click', () => {
          // Setting the hash will automatically trigger the 'hashchange' event listener below
          window.location.hash = view;
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
