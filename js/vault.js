let recentSearches = [];
let pinnedSearches = [];
let vaultedPosts   = [];
let vaultedManga   = [];
let vaultedFolders = ["Default"];
let vaultedMangaFolders = ["All"];
let vaultFolderSettings = {};
let globalBlacklist = [];
let globalWhitelist = [];

let vaultReadyResolve;
const vaultReadyPromise = new Promise(r => vaultReadyResolve = r);

async function initVault() {
  try {
    // Migration logic
    const oldVault = localStorage.getItem('r34_vault_v2');
    if (oldVault) {
      triggerToastNotification("Migrating vault to IndexedDB...");
      await localforage.setItem('r34_vault_v2', JSON.parse(oldVault));
      await localforage.setItem('r34_history_v2', JSON.parse(localStorage.getItem('r34_history_v2') || '[]'));
      await localforage.setItem('r34_pinned_v2', JSON.parse(localStorage.getItem('r34_pinned_v2') || '[]'));
      await localforage.setItem('r34_folders_v2', JSON.parse(localStorage.getItem('r34_folders_v2') || '["Default"]'));
      
      localStorage.removeItem('r34_vault_v2');
      localStorage.removeItem('r34_history_v2');
      localStorage.removeItem('r34_pinned_v2');
      localStorage.removeItem('r34_folders_v2');
      triggerToastNotification("Vault migrated successfully.");
    }
    
    vaultedPosts = (await localforage.getItem('r34_vault_v2')) || [];
    vaultedManga = (await localforage.getItem('r34_vault_manga_v2')) || [];
    
    // Clean up vaultedPosts if it has any Manga objects accidentally saved
    let initialPostsCount = vaultedPosts.length;
    const migratedMangas = vaultedPosts.filter(p => !!p.mangaObject);
    vaultedPosts = vaultedPosts.filter(p => !p.mangaObject);
    if (vaultedPosts.length !== initialPostsCount) {
        localforage.setItem('r34_vault_v2', vaultedPosts);
        
        // Add them to vaultedManga
        migratedMangas.forEach(m => {
            if (!vaultedManga.some(vm => String(vm.id) === String(m.id))) {
                vaultedManga.unshift(m);
            }
        });
        localforage.setItem('r34_vault_manga_v2', vaultedManga);
    }
    
    recentSearches = (await localforage.getItem('r34_history_v2')) || [];
    pinnedSearches = (await localforage.getItem('r34_pinned_v2')) || [];
    vaultedFolders = (await localforage.getItem('r34_folders_v2')) || ["Default"];
    vaultedMangaFolders = (await localforage.getItem('r34_manga_folders_v2')) || ["All"];
    const mangaFolderIdx = vaultedFolders.indexOf('Manga');
    if (mangaFolderIdx > -1) {
      vaultedFolders.splice(mangaFolderIdx, 1);
      localforage.setItem('r34_folders_v2', vaultedFolders);
    }
    vaultFolderSettings = (await localforage.getItem('r34_folder_settings_v2')) || {};
    globalBlacklist = (await localforage.getItem('r34_blacklist')) || [];
    globalWhitelist = (await localforage.getItem('r34_whitelist')) || [];
    
    // Resolve promise so other scripts know vault is ready
    if (typeof vaultReadyResolve === 'function') vaultReadyResolve();
    
    if(typeof renderVault === 'function') renderVault();
    if (typeof renderHistoryAndPins === 'function') renderHistoryAndPins();
    if (typeof renderBlacklist === 'function') renderBlacklist();
  } catch (err) {
    console.error("Vault Init Error:", err);
  }
}

function cacheSuccessfulSearch(tagsString) {
  let cleanString = tagsString.trim();
  if(!cleanString || cleanString === 'all') return;
  recentSearches = recentSearches.filter(s => s !== cleanString);
  recentSearches.unshift(cleanString);
  if(recentSearches.length > 5) recentSearches.pop();
  localforage.setItem('r34_history_v2', recentSearches);
}

function togglePinSearch(tagsString) {
  if(pinnedSearches.includes(tagsString)){
    pinnedSearches = pinnedSearches.filter(s => s !== tagsString);
    triggerToastNotification("Configuration unpinned!");
  } else {
    pinnedSearches.push(tagsString);
    triggerToastNotification("Configuration pinned to desktop!");
  }
  localforage.setItem('r34_pinned_v2', pinnedSearches);
  renderHistoryAndPins();
}

async function exportVault() {
  try {
    const data = {
      vaultedPosts,
      vaultedManga,
      vaultedFolders,
      vaultedMangaFolders,
      recentSearches,
      pinnedSearches,
      vaultFolderSettings,
      globalBlacklist,
      globalWhitelist
    };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `R34_Vault_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerToastNotification("Vault exported successfully!");
  } catch (err) {
    triggerToastNotification("Failed to export vault.");
  }
}

async function importVault(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (data.vaultedPosts) {
      vaultedPosts = data.vaultedPosts;
      await localforage.setItem('r34_vault_v2', vaultedPosts);
    }
    if (data.vaultedManga) {
      vaultedManga = data.vaultedManga;
      await localforage.setItem('r34_vault_manga_v2', vaultedManga);
    }
    if (data.vaultedFolders) {
      vaultedFolders = data.vaultedFolders;
      await localforage.setItem('r34_folders_v2', vaultedFolders);
    }
    if (data.vaultedMangaFolders) {
      vaultedMangaFolders = data.vaultedMangaFolders;
      await localforage.setItem('r34_manga_folders_v2', vaultedMangaFolders);
    }
    if (data.recentSearches) {
      recentSearches = data.recentSearches;
      await localforage.setItem('r34_history_v2', recentSearches);
    }
    if (data.pinnedSearches) {
      pinnedSearches = data.pinnedSearches;
      await localforage.setItem('r34_pinned_v2', pinnedSearches);
    }
    if (data.globalBlacklist) {
      globalBlacklist = data.globalBlacklist;
      await localforage.setItem('r34_blacklist', globalBlacklist);
    }
    if (data.globalWhitelist) {
      globalWhitelist = data.globalWhitelist;
      await localforage.setItem('r34_whitelist', globalWhitelist);
    }
    
    triggerToastNotification("Vault imported successfully! Reloading...");
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    triggerToastNotification("Invalid vault backup file.");
  }
}

async function forceBinaryAssetDownload(url, postId) {
  if(!url) return;
  const ext = url.split('.').pop().toLowerCase();
  const targetedFilename = `Hub_Post_${postId}.${ext}`;
  
  triggerToastNotification("Triggering native download via proxy...");

  try {
    const downloadUrl = PROXY + encodeURIComponent(url) + '&download=true';
    
    const hiddenAnchor = document.createElement('a');
    hiddenAnchor.href = downloadUrl;
    hiddenAnchor.download = targetedFilename;
    document.body.appendChild(hiddenAnchor);
    hiddenAnchor.click();
    
    document.body.removeChild(hiddenAnchor);
    triggerToastNotification("Asset deployed to desktop! 🎉");
  } catch (err) {
    console.warn("Direct proxy download failed, routing via safety layout:", err);
    window.open(url, '_blank');
    triggerToastNotification("Opened original in secondary window");
  }
}
window.getVaultMangaFolders = () => vaultedMangaFolders;
window.setVaultMangaFolders = (arr) => { vaultedMangaFolders = arr; localforage.setItem('r34_manga_folders_v2', vaultedMangaFolders); };
