let recentSearches = JSON.parse(localStorage.getItem('r34_history_v2') || '[]');
let pinnedSearches = JSON.parse(localStorage.getItem('r34_pinned_v2') || '[]');
let vaultedPosts   = JSON.parse(localStorage.getItem('r34_vault_v2') || '[]');

function cacheSuccessfulSearch(tagsString) {
  let cleanString = tagsString.trim();
  if(!cleanString || cleanString === 'all') return;
  recentSearches = recentSearches.filter(s => s !== cleanString);
  recentSearches.unshift(cleanString);
  if(recentSearches.length > 5) recentSearches.pop();
  localStorage.setItem('r34_history_v2', JSON.stringify(recentSearches));
}

function togglePinSearch(tagsString) {
  if(pinnedSearches.includes(tagsString)){
    pinnedSearches = pinnedSearches.filter(s => s !== tagsString);
    triggerToastNotification("Configuration unpinned!");
  } else {
    pinnedSearches.push(tagsString);
    triggerToastNotification("Configuration pinned to desktop!");
  }
  localStorage.setItem('r34_pinned_v2', JSON.stringify(pinnedSearches));
  renderHistoryAndPins();
}

async function forceBinaryAssetDownload(url, postId) {
  if(!url) return;
  const ext = url.split('.').pop().toLowerCase();
  const targetedFilename = `Hub_Post_${postId}.${ext}`;
  
  triggerToastNotification("Allocating proxy stream connection...");
  lbDlBtn.disabled = true;
  lbDlBtn.textContent = '⚡ Pulling...';

  try {
    const response = await fetch(PROXY + encodeURIComponent(url));
    if(!response.ok) throw new Error("Proxy connection dropped");
    
    const outputBlob = await response.blob();
    const generatedUrl = URL.createObjectURL(outputBlob);
    
    const hiddenAnchor = document.createElement('a');
    hiddenAnchor.href = generatedUrl;
    hiddenAnchor.download = targetedFilename;
    document.body.appendChild(hiddenAnchor);
    hiddenAnchor.click();
    
    document.body.removeChild(hiddenAnchor);
    URL.revokeObjectURL(generatedUrl);
    triggerToastNotification("Asset deployed to desktop! 🎉");
  } catch (err) {
    console.warn("Direct binary blob stream failed, routing via safety layout:", err);
    window.open(url, '_blank');
    triggerToastNotification("Opened original in secondary window");
  } finally {
    lbDlBtn.disabled = false;
    lbDlBtn.textContent = '📥 Download';
  }
}