document.addEventListener('DOMContentLoaded', () => {
  const views = ['images', 'videos', 'manga', 'vault'];
  
  views.forEach(view => {
    const btn = document.getElementById(`nav-${view}`);
    if (btn) {
      btn.addEventListener('click', () => {
        // Update active nav button
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');

        // Hide all views
        document.querySelectorAll('.app-view').forEach(el => {
          el.style.display = 'none';
          el.classList.remove('active-view');
        });

        // Show targeted view
        const targetView = document.getElementById(`view-${view}`);
        if (targetView) {
          if (view === 'videos') {
            targetView.style.display = 'block'; // Or flex if we want
          } else {
            targetView.style.display = 'block';
          }
          targetView.classList.add('active-view');
        }

        // Trigger specific logic when navigating
        if (view === 'videos' && typeof initVideoScroller === 'function') {
          initVideoScroller();
        }
        
        if (view === 'vault' && typeof renderVaultGridToDedicatedView === 'function') {
          renderVaultGridToDedicatedView();
        }
      });
    }
  });
});
