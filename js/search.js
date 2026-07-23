// Search UI Logic for The Better Rule 34

searchContainer.addEventListener('click', (e) => {
  if(e.target === searchContainer || e.target === tagPillsList) {
    input.focus();
  }
});

function renderPills() {
  tagPillsList.innerHTML = '';
  tagsArray.forEach((tag, index) => {
    const pill = document.createElement('div');
    pill.className = 'tag-pill';
    
    const pureCleanTag = tag.replace(/^[-]/, '').replace(/[~*]$/, '');
    const categoryType = tagCategoriesMap.get(pureCleanTag) || 'general';
    pill.classList.add(`type-${categoryType}`);
    
    pill.textContent = tag + ' ';

    const closeBtn = document.createElement('span');
    closeBtn.className = 'pill-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePill(index);
    });
    pill.appendChild(closeBtn);

    const menu = document.createElement('div');
    menu.className = 'tag-menu';
    
    const modifiers = [
      { label: 'Normal', prefix: '', suffix: '' },
      { label: 'Exclude (-)', prefix: '-', suffix: '' },
      { label: 'Fuzzy (~)', prefix: '', suffix: '~' },
      { label: 'Wildcard (*)', prefix: '', suffix: '*' }
    ];

    modifiers.forEach(mod => {
      const item = document.createElement('button');
      item.className = 'tag-menu-item';
      item.textContent = mod.label;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        applyModifier(index, mod.prefix, mod.suffix);
        menu.classList.remove('show');
      });
      menu.appendChild(item);
    });

    pill.appendChild(menu);
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.tag-menu').forEach(m => { if(m !== menu) m.classList.remove('show'); });
      menu.classList.toggle('show');
    });
    tagPillsList.appendChild(pill);
  });
  input.placeholder = tagsArray.length > 0 ? '' : 'Add tags...';
}

function addPill(value) {
  let clean = value.trim();
  if (!clean) return;
  const parts = clean.split(/\s+/);
  parts.forEach(p => {
    if (p && !tagsArray.includes(p)) {
      tagsArray.push(p);
    }
  });
  renderPills();
  input.value = '';
  hideAutocomplete();
}

function removePill(index) {
  tagsArray.splice(index, 1);
  renderPills();
}

function applyModifier(index, prefix, suffix) {
  let pureTag = tagsArray[index].replace(/^[-]/, '').replace(/[~*]$/, '');
  tagsArray[index] = `${prefix}${pureTag}${suffix}`;
  renderPills();
}

input.addEventListener('input', () => {
  clearTimeout(autocompleteTimeout);
  let text = input.value.trim();
  activePrefixModifier = '';
  if (text.startsWith('-') || text.startsWith('~')) {
    activePrefixModifier = text.charAt(0);
    text = text.slice(1).trim();
  }
  if (text.length < 2) {
    hideAutocomplete();
    return;
  }
  autocompleteTimeout = setTimeout(() => {
    if (typeof queryAutocomplete === 'function') {
      queryAutocomplete(text);
    }
  }, 200);
});

function renderSuggestions(items) {
  autocompleteBox.innerHTML = '';
  if (!items || items.length === 0) {
    hideAutocomplete();
    return;
  }
  activeSuggestionIdx = -1;
  items.forEach((item) => {
    const value = item.value || item.name || item;
    const labelStr = item.label || '';
    const countLabel = labelStr.includes('(') ? `(${labelStr.split('(').pop()}` : '';
    let category = item.type || 'general';
    if(labelStr.includes('(character)')) category = 'character';
    else if(labelStr.includes('(artist)')) category = 'artist';
    else if(labelStr.includes('(copyright)')) category = 'copyright';
    tagCategoriesMap.set(value, category);
    const row = document.createElement('div');
    row.className = 'autocomplete-item';
    const textSpan = document.createElement('span');
    textSpan.textContent = value;
    row.appendChild(textSpan);
    if (countLabel) {
      const countSpan = document.createElement('span');
      countSpan.style.color = 'var(--muted)';
      countSpan.style.fontSize = '0.8rem';
      countSpan.textContent = countLabel;
      row.appendChild(countSpan);
    }
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      addPill(activePrefixModifier + value);
      input.focus();
    });
    autocompleteBox.appendChild(row);
  });
  autocompleteBox.classList.add('show');
}

function hideAutocomplete() {
  autocompleteBox.classList.remove('show');
  autocompleteBox.innerHTML = '';
  activeSuggestionIdx = -1;
}

function highlightSuggestion(items) {
  items.forEach((item, idx) => {
    item.classList.toggle('active', idx === activeSuggestionIdx);
    if(idx === activeSuggestionIdx) item.scrollIntoView({ block: 'nearest' });
  });
}

input.addEventListener('keydown', (e) => {
  const items = autocompleteBox.querySelectorAll('.autocomplete-item');
  const isDropdownVisible = autocompleteBox.classList.contains('show') && items.length > 0;
  if (isDropdownVisible) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeSuggestionIdx = (activeSuggestionIdx + 1) % items.length;
      highlightSuggestion(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeSuggestionIdx = (activeSuggestionIdx - 1 + items.length) % items.length;
      highlightSuggestion(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIdx >= 0) {
        const chosenText = items[activeSuggestionIdx].querySelector('span').textContent;
        addPill(activePrefixModifier + chosenText);
      } else {
        if (input.value.trim() !== '') addPill(input.value);
      }
      if (typeof doSearch === 'function') doSearch();
    } else if (e.key === 'Escape') hideAutocomplete();
  } else {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (input.value.trim() !== '') addPill(input.value);
      if (e.key === 'Enter') {
        if (typeof doSearch === 'function') doSearch();
      }
    } else if (e.key === 'Backspace' && input.value === '' && tagsArray.length > 0) {
      removePill(tagsArray.length - 1);
    }
  }
});

const helpersToggle = document.getElementById('helpers-toggle');
const helpersPanel  = document.getElementById('helpers-panel');

if(helpersToggle) {
  helpersToggle.addEventListener('click', () => {
    const open = helpersPanel.classList.toggle('open');
    helpersToggle.classList.toggle('open', open);
  });
}


function renderHistoryAndPins() {
  const recentBox = document.getElementById('recent-chips-box');
  const pinnedBox = document.getElementById('pinned-chips-box');
  if(!recentBox || !pinnedBox) return;
  recentBox.innerHTML = recentSearches.length === 0 ? '<span class="text-muted text-xs py-1">No searches logged yet</span>' : '';
  pinnedBox.innerHTML = pinnedSearches.length === 0 ? '<span class="text-muted text-xs py-1">No pinned setups setup yet</span>' : '';
  recentSearches.forEach(str => {
    const isPinned = pinnedSearches.includes(str);
    const row = document.createElement('div');
    row.className = 'chip history-item';
    const txt = document.createElement('span');
    txt.className = 'chip-syntax';
    txt.textContent = str;
    txt.addEventListener('click', () => loadSavedSearch(str));
    row.appendChild(txt);
    const pin = document.createElement('span');
    pin.className = 'history-pin-btn';
    pin.textContent = isPinned ? '📌' : '🤍';
    pin.addEventListener('click', (e) => { e.stopPropagation(); togglePinSearch(str); });
    row.appendChild(pin);
    recentBox.appendChild(row);
  });
  pinnedSearches.forEach(str => {
    const row = document.createElement('div');
    row.className = 'chip history-item';
    row.style.borderColor = 'var(--accent)';
    const txt = document.createElement('span');
    txt.className = 'chip-syntax';
    txt.style.color = '#c084fc';
    txt.textContent = str;
    txt.addEventListener('click', () => loadSavedSearch(str));
    row.appendChild(txt);
    const pin = document.createElement('span');
    pin.className = 'history-pin-btn';
    pin.textContent = '❌';
    pin.addEventListener('click', (e) => { e.stopPropagation(); togglePinSearch(str); });
    row.appendChild(pin);
    pinnedBox.appendChild(row);
  });
}

function loadSavedSearch(str) {
  tagsArray = str.split(/\s+/).filter(Boolean);
  renderPills();
  if (typeof disableVaultViewMode === 'function') disableVaultViewMode();
  if (typeof doSearch === 'function') doSearch();
}

function renderFilterBadges(days, sortVal) {
  if (!activeFilters) return;
  const badges = [];
  if(isViewingVault) {
    badges.push(`🔒 Saved Storage Mode`);
    activeFilters.innerHTML = badges.map(b => `<span class="meta-badge badge-danger">${b}</span>`).join(' ');
    return;
  }
  if (days !== 'all') {
    const activeTimeBtn = document.querySelector('.timeframe-option-btn.active');
    const text = activeTimeBtn ? (activeTimeBtn.title || activeTimeBtn.textContent) : days;
    badges.push(`📅 ${text.replace('Last ', '')}`);
  }
  if (sortVal && sortVal !== 'algo:discover') {
    const activeSortBtn = document.querySelector('.sort-option-btn.active');
    const text = activeSortBtn ? (activeSortBtn.title || activeSortBtn.textContent).split('(')[0].replace('Sort by ', '').trim() : sortVal.split(':').pop();
    badges.push(`⚙️ ${text}`);
  }
  activeFilters.innerHTML = badges.map(b => `<span class="meta-badge">${b}</span>`).join(' ');
}
