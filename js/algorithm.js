// Recommendation Engine Logic

window.algoTargetFolder = null;
window.algoRequestVersion = 0;
let algoTagsCache = {}; // { tag: type }
let algoGridPage = 0;
let isAlgoLoading = false;

// DOM Elements
const algoWeightChar = document.getElementById('algo-weight-char');
const algoWeightArtist = document.getElementById('algo-weight-artist');
const algoWeightSeries = document.getElementById('algo-weight-series');
const algoWeightGeneral = document.getElementById('algo-weight-general');

const algoValChar = document.getElementById('algo-val-char');
const algoValArtist = document.getElementById('algo-val-artist');
const algoValSeries = document.getElementById('algo-val-series');
const algoValGeneral = document.getElementById('algo-val-general');

const algoWeightBatch = document.getElementById('algo-weight-batch');
const algoWeightRatio = document.getElementById('algo-weight-ratio');
const algoWeightFreshness = document.getElementById('algo-weight-freshness');
const algoWeightFetches = document.getElementById('algo-weight-fetches');
const algoValBatch = document.getElementById('algo-val-batch');
const algoValRatio = document.getElementById('algo-val-ratio');
const algoValFreshness = document.getElementById('algo-val-freshness');
const algoValFetches = document.getElementById('algo-val-fetches');
const algoBaseSearch = document.getElementById('algo-base-search');

const algoGenerateBtn = document.getElementById('algo-generate-btn');
const algoStatus = document.getElementById('algo-status');
const algoInsights = document.getElementById('algo-insights');
const algoGrid = document.getElementById('algo-grid');
const algoDnaTableBody = document.getElementById('algo-dna-table-body');

function loadAlgoSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('algo_settings'));
        if (settings) {
            if (algoValChar && settings.char) { algoValChar.value = settings.char; algoWeightChar.value = settings.char; }
            if (algoValArtist && settings.artist) { algoValArtist.value = settings.artist; algoWeightArtist.value = settings.artist; }
            if (algoValSeries && settings.series) { algoValSeries.value = settings.series; algoWeightSeries.value = settings.series; }
            if (algoValGeneral && settings.general) { algoValGeneral.value = settings.general; algoWeightGeneral.value = settings.general; }
            if (algoValBatch && settings.batch) { algoValBatch.value = settings.batch; algoWeightBatch.value = settings.batch; }
            if (algoValRatio && settings.ratio) { algoValRatio.value = settings.ratio; algoWeightRatio.value = settings.ratio; }
            if (algoValFreshness && settings.freshness !== undefined) { algoValFreshness.value = settings.freshness; algoWeightFreshness.value = settings.freshness; }
            if (algoValFetches && settings.fetches) { algoValFetches.value = settings.fetches; algoWeightFetches.value = settings.fetches; }
            if (algoBaseSearch && settings.baseSearch !== undefined) { algoBaseSearch.value = settings.baseSearch; }
        }
    } catch(e) {}
}

function saveAlgoSettings() {
    const settings = {
        char: algoValChar ? algoValChar.value : 2.5,
        artist: algoValArtist ? algoValArtist.value : 2.0,
        series: algoValSeries ? algoValSeries.value : 1.0,
        general: algoValGeneral ? algoValGeneral.value : 0.3,
        batch: algoValBatch ? algoValBatch.value : 30,
        ratio: algoValRatio ? algoValRatio.value : 50,
        freshness: algoValFreshness ? algoValFreshness.value : 30,
        fetches: algoValFetches ? algoValFetches.value : 9,
        baseSearch: algoBaseSearch ? algoBaseSearch.value : ''
    };
    localStorage.setItem('algo_settings', JSON.stringify(settings));
}

// Update UI values & render table on change
function attachAlgoListeners() {
    loadAlgoSettings();
    
    const updateTable = () => { 
        saveAlgoSettings();
        if (vaultedPosts.length > 0) renderAlgoTable(); 
    };
    const debouncedUpdateTable = typeof debounce === 'function' ? debounce(updateTable, 300) : updateTable;
    
    const linkInputs = (rangeId, numId, isFloat = true) => {
        const range = document.getElementById(rangeId);
        const num = document.getElementById(numId);
        if (!range || !num) return;
        
        range.addEventListener('input', e => {
            num.value = isFloat ? Number(e.target.value).toFixed(1) : e.target.value;
            debouncedUpdateTable();
        });
        
        num.addEventListener('input', e => {
            range.value = e.target.value;
            debouncedUpdateTable();
        });
    };

    linkInputs('algo-weight-char', 'algo-val-char');
    linkInputs('algo-weight-artist', 'algo-val-artist');
    linkInputs('algo-weight-series', 'algo-val-series');
    linkInputs('algo-weight-general', 'algo-val-general');
    
    linkInputs('algo-weight-batch', 'algo-val-batch', false);
    linkInputs('algo-weight-ratio', 'algo-val-ratio', false);
    linkInputs('algo-weight-freshness', 'algo-val-freshness', false);
    linkInputs('algo-weight-fetches', 'algo-val-fetches', false);
    
    if (algoBaseSearch) {
        algoBaseSearch.addEventListener('input', () => {
            saveAlgoSettings();
        });
    }
}
attachAlgoListeners();

// Load cached types on init
async function initAlgoCache() {
    algoTagsCache = (await localforage.getItem('r34_tag_types')) || {};
}

let algoDnaCache = {}; // { folderKey: sortedTags }

window.invalidateAlgoDnaCache = function() {
    algoDnaCache = {};
};

// Analyze Vault and tally tag frequencies with chronological decay (Recency Bias)
function analyzeVaultTags(folderName = null) {
    const cacheKey = folderName || 'All';
    if (algoDnaCache[cacheKey]) {
        return algoDnaCache[cacheKey];
    }

    const counts = {};
    
    const validPosts = vaultedPosts.filter(post => {
        const f = post.folder || 'Default';
        if (folderName) {
            if (folderName === 'All') return true;
            return f === folderName;
        }
        if (typeof vaultFolderSettings !== 'undefined' && vaultFolderSettings[f]) {
             if (vaultFolderSettings[f].useInAlgo === false) return false;
        }
        return true;
    });

    const total = validPosts.length;
    
    validPosts.forEach((post, index) => {
        if (!post.tags) return;
        
        // Calculate recency weight (Newest post = 1.0, Oldest post = 0.1)
        // This organically prioritizes current interests over older phases.
        const recencyWeight = total > 1 ? 1.0 - (0.9 * (index / (total - 1))) : 1.0;
        
        const tags = post.tags.split(/\s+/).filter(Boolean);
        tags.forEach(t => {
            counts[t] = (counts[t] || 0) + recencyWeight;
        });
    });
    
    const result = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    algoDnaCache[cacheKey] = result;
    return result;
}

// Fetch tag type from Rule34 tags API (Bypasses global 500ms throttle for speed)
async function fetchTagType(tag, retryCount = 0) {
    if (algoTagsCache[tag]) return algoTagsCache[tag];
    try {
        const baseUrl = typeof API !== 'undefined' ? API.replace('s=post', 's=tag') : 'https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index';
        const url = `${baseUrl}&name=${encodeURIComponent(tag)}`;
        
        // Direct fetch to bypass the slow global queue
        const res = await fetch(PROXY + encodeURIComponent(url));
        
        if (res.status === 429) {
            if (retryCount < 3) {
                console.warn(`429 Too Many Requests for tag ${tag}. Retrying in ${500 * (retryCount + 1)}ms...`);
                await new Promise(r => setTimeout(r, 500 * (retryCount + 1)));
                return fetchTagType(tag, retryCount + 1);
            } else {
                console.warn(`Rate limit max retries reached for tag ${tag}`);
                return 'general';
            }
        }
        
        const xmlText = await res.text();
        
        // Use DOMParser to parse the XML
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, "text/xml");
        const tagNode = xml.querySelector('tag');
        
        if (tagNode) {
            const typeInt = parseInt(tagNode.getAttribute('type'), 10);
            let category = 'general';
            if (typeInt === 1) category = 'artist';
            else if (typeInt === 3) category = 'copyright';
            else if (typeInt === 4) category = 'character';
            else if (typeInt === 5) category = 'metadata';
            
            algoTagsCache[tag] = category;
            return category;
        } else {
            console.warn('No tag node found in XML for tag:', tag);
        }
    } catch (e) {
        console.warn('Failed to fetch type for tag:', tag, e);
    }
    algoTagsCache[tag] = 'general';
    return 'general';
}

// Ensure the top N tags have their types resolved (Concurrent Chunking)
async function resolveTopTagTypes(sortedTags, limit = 100) {
    const topTags = sortedTags.slice(0, limit);
    let updated = false;
    
    // Process in smaller chunks to avoid 429s while maintaining speed
    const CHUNK_SIZE = 5;
    for (let i = 0; i < topTags.length; i += CHUNK_SIZE) {
        const chunk = topTags.slice(i, i + CHUNK_SIZE);
        const promises = chunk.map(async ([tag, count]) => {
            if (!algoTagsCache[tag]) {
                await fetchTagType(tag);
                updated = true;
            }
        });
        
        await Promise.all(promises);
        
        // Delay between chunks to prevent proxy bans
        if (i + CHUNK_SIZE < topTags.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }
    
    if (updated) {
        await localforage.setItem('r34_tag_types', algoTagsCache);
    }
}

// Fetch helper that normalizes the Rule34 JSON response
async function fetchR34Posts(query, limit, page = 0, isBackground = false) {
    // We MUST use the API constant from api.js to ensure api_key and user_id are passed, otherwise it 403s.
    const baseUrl = typeof API !== 'undefined' ? API : 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index';
    
    let finalQuery = query || '';
    if (typeof globalBlacklist !== 'undefined' && globalBlacklist.length > 0) {
        const blStr = globalBlacklist.map(t => `-${t}`).join(' ');
        finalQuery = finalQuery ? `${finalQuery} ${blStr}` : blStr;
    }
    
    const url = `${baseUrl}&limit=${limit}&pid=${page}&tags=${encodeURIComponent(finalQuery)}&json=1&cb=${Date.now()}`;
    try {
        const res = await throttledFetch(PROXY + encodeURIComponent(url), {}, isBackground);
        const text = await res.text();
        if (!text.trim()) {
            return null;
        }
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            if (typeof parsed === 'object' && parsed !== null && parsed.id) return [parsed];
            return [];
        }
        return parsed;
    } catch (err) {
        console.error('Fetch error for query:', query, err);
        return [];
    }
}

// Selects tags randomly but weighted by their scores
function selectWeightedTags(weightedTags, count) {
    const selected = [];
    const pool = [...weightedTags];
    
    for (let i = 0; i < count; i++) {
        if (pool.length === 0) break;
        let totalWeight = pool.reduce((sum, t) => sum + t.weight, 0);
        let rand = Math.random() * totalWeight;
        for (let j = 0; j < pool.length; j++) {
            if (rand < pool[j].weight) {
                selected.push(pool[j].tag);
                // Intentionally NOT splicing the pool so high-weight tags can hit multiple times
                break;
            }
            rand -= pool[j].weight;
        }
    }
    return selected;
}

const algoConsole = document.getElementById('algo-console');

function logAlgo(msg) {
    if (!algoConsole) return;
    const div = document.createElement('div');
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    div.innerHTML = `<span class="text-gray">[${time}]</span> > ${msg}`;
    algoConsole.appendChild(div);
    algoConsole.scrollTop = algoConsole.scrollHeight;
}

// Generate the Algorithm DNA Table
async function renderAlgoTable() {
    if (!algoDnaTableBody) return;
    algoDnaTableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4"><div class="spinner"></div></td></tr>';
    
    logAlgo('Analyzing Vault DNA...');
    const sortedTags = analyzeVaultTags();
    
    logAlgo(`Found ${sortedTags.length} unique tags in vault.`);
    
    // Resolve top 200 tags to populate the table properly without overwhelming the API
    await resolveTopTagTypes(sortedTags, 200);
    logAlgo(`Resolved categories for top 200 tags.`);
    
    const multipliers = {
        'character': parseFloat(algoValChar.value || 2.0),
        'artist': parseFloat(algoValArtist.value || 1.5),
        'copyright': parseFloat(algoValSeries.value || 1.2),
        'general': parseFloat(algoValGeneral.value || 1.0),
        'metadata': parseFloat(algoValGeneral.value || 1.0)
    };
    
    const tableData = [];
    sortedTags.forEach(([tag, count]) => {
        const type = algoTagsCache[tag] || 'general';
        const mult = multipliers[type] !== undefined ? multipliers[type] : 1.0;
        tableData.push({ tag, type, count, mult, score: count * mult });
    });
    
    // Sort table by Final Score descending
    tableData.sort((a,b) => b.score - a.score);
    
    // Calculate total score for % math
    const totalScore = tableData.reduce((sum, row) => sum + row.score, 0);

    let subjectData = tableData.filter(row => row.type !== 'general' && row.type !== 'metadata');
    let modifierData = tableData.filter(row => row.type === 'general' || row.type === 'metadata');
    if (subjectData.length === 0) {
        subjectData = tableData;
        modifierData = [];
    }
    
    const totalSubjectScore = subjectData.reduce((sum, row) => sum + row.score, 0);
    const totalModifierScore = modifierData.reduce((sum, row) => sum + row.score, 0);

    // --- Generate Roulette Visualizer (Top 20 Subjects + Other) ---
    const wheelEl = document.getElementById('algo-roulette-wheel');
    const legendEl = document.getElementById('algo-roulette-legend');
    if (wheelEl && legendEl && totalSubjectScore > 0) {
        const topWheelData = subjectData.slice(0, 20);
        const topWheelScore = topWheelData.reduce((sum, row) => sum + row.score, 0);
        // Vibrant distinct colors for the wheel
        const colors = [
            '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
            '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fb7185', '#38bdf8', '#34d399'
        ];
        
        let conicStops = [];
        let legendHTML = '';
        let currentDeg = 0;
        
        const hasOther = subjectData.length > 20;
        const otherScore = totalSubjectScore - topWheelScore;
        
        topWheelData.forEach((row, i) => {
            const pct = row.score / totalSubjectScore;
            const degrees = pct * 360;
            const color = colors[i % colors.length];
            conicStops.push(`${color} ${currentDeg}deg ${currentDeg + degrees}deg`);
            currentDeg += degrees;
            legendHTML += `<div class="legend-item"><div class="legend-color" style="background:${color};"></div><span>${row.tag} <strong>${(pct * 100).toFixed(1)}%</strong></span></div>`;
        });
        
        if (hasOther) {
            const pct = otherScore / totalSubjectScore;
            conicStops.push(`#444 ${currentDeg}deg 360deg`);
            legendHTML += `<div class="legend-item"><div class="legend-color-gray"></div><span>Other <strong>${(pct * 100).toFixed(1)}%</strong></span></div>`;
        }
        
        wheelEl.style.background = `conic-gradient(${conicStops.join(', ')})`;
        legendEl.innerHTML = legendHTML;
    }
    
    algoDnaTableBody.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    // Render top 200 to keep DOM fast
    tableData.slice(0, 200).forEach(row => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        
        let typeEmoji = '🏷️';
        if (row.type === 'character') typeEmoji = '🧑‍🦰';
        if (row.type === 'artist') typeEmoji = '🎨';
        if (row.type === 'copyright') typeEmoji = '📺';
        
        const isSubject = (row.type !== 'general' && row.type !== 'metadata') || modifierData.length === 0;
        let pctCoverage = 0;
        if (isSubject) {
            pctCoverage = totalSubjectScore > 0 ? ((row.score / totalSubjectScore) * 100).toFixed(1) : 0;
        } else {
            pctCoverage = totalModifierScore > 0 ? ((row.score / totalModifierScore) * 100).toFixed(1) : 0;
        }
        
        tr.innerHTML = `
            <td class="p-2"><strong>${row.tag}</strong></td>
            <td class="p-2">${typeEmoji} <span class="capitalize">${row.type}</span></td>
            <td class="p-2">${row.count}</td>
            <td class="p-2 text-purple">${row.mult.toFixed(1)}x</td>
            <td class="p-2 font-bold text-normal">${row.score.toFixed(1)}</td>
            <td class="p-2 font-bold text-blue">${pctCoverage}%</td>
        `;
        fragment.appendChild(tr);
    });
    
    algoDnaTableBody.appendChild(fragment);
    logAlgo('DNA Table rendered successfully.');
}

let algoPreloadQueue = [];
let isAlgoPreloading = false;
let currentAlgoPreloadPage = 0;
const ALGO_PRELOAD_BUFFER_SIZE = 3;

async function getAlgoBatchQueries(pageIndex, isBackground = false) {
    const batchSize = parseInt(algoValBatch.value || 30);
    const sortedTags = analyzeVaultTags(window.algoTargetFolder);
    const hasTags = sortedTags.length > 0;
    
    // If a targeted folder is selected, turn down random content to 0 (100% targeted)
    // If vault is empty, set ratio to 1.0 to load general discoveries
    const ratio = hasTags ? (window.algoTargetFolder ? 0 : (parseInt(algoValRatio.value || 50) / 100)) : 1.0;
    const fetchAmount = parseInt(algoValFetches.value || 9);
    const freshnessRatio = window.algoTargetFolder ? 0.1 : (parseInt(algoValFreshness.value || 30) / 100);
    const baseSearch = algoBaseSearch.value.trim();
    
    const randomCount = Math.round(batchSize * ratio);
    const targetedCount = batchSize - randomCount;
    
    logAlgo(`[PRELOAD ${pageIndex}] Split: ${randomCount} random, ${targetedCount} targeted.`);
    
    await resolveTopTagTypes(sortedTags, 100);
    
    const multipliers = {
        'character': parseFloat(algoValChar.value),
        'artist': parseFloat(algoValArtist.value),
        'copyright': parseFloat(algoValSeries.value),
        'general': parseFloat(algoValGeneral.value),
        'metadata': parseFloat(algoValGeneral.value)
    };
    
    const subjectTags = [];
    const modifierTags = [];
    sortedTags.slice(0, 150).forEach(([tag, count]) => {
        const type = algoTagsCache[tag] || 'general';
        const mult = multipliers[type] !== undefined ? multipliers[type] : 1.0;
        if (count * mult > 0) {
            const data = { tag, type, weight: count * mult };
            if (type === 'general' || type === 'metadata') {
                modifierTags.push(data);
            } else {
                subjectTags.push(data);
            }
        }
    });
    
    
    // Update Insights UI (Only visually updates when it resolves, which is fine)
    const allWeighted = [...subjectTags, ...modifierTags].sort((a,b) => b.weight - a.weight);
    algoInsights.innerHTML = '<span class="text-muted text-sm mr-2">Top Weighted Influences:</span>';
    allWeighted.slice(0, 5).forEach(t => {
        const pill = document.createElement('span');
        pill.className = 'lb-stream-tag';
        pill.textContent = `${t.tag} (${t.weight.toFixed(1)})`;
        if (t.type === 'character') pill.style.borderColor = '#34d399';
        if (t.type === 'artist') pill.style.borderColor = '#fbbf24';
        if (t.type === 'copyright') pill.style.borderColor = '#a78bfa';
        algoInsights.appendChild(pill);
    });

    const queries = [];
    
    if (randomCount > 0) {
        const isFresh = Math.random() < freshnessRatio;
        let q = isFresh ? '' : 'sort:random';
        if (baseSearch) q = isFresh ? baseSearch : `${baseSearch} sort:random`;
        q += (q ? ' ' : '') + 'score:>=300';
        queries.push(async () => {
            const res = await fetchR34Posts(q, randomCount, pageIndex, isBackground);
            return res;
        });
    }
    
    if (targetedCount > 0) {
        const primaryPool = subjectTags.length > 0 ? subjectTags : modifierTags;
        const tagsToQuery = selectWeightedTags(primaryPool, fetchAmount);
        
        if (tagsToQuery.length > 0) {
            const countPerTag = Math.ceil(targetedCount / tagsToQuery.length);
            tagsToQuery.forEach(tag => {
                queries.push(async () => {
                    let maxRetries = 3;
                    while (maxRetries > 0) {
                        let q = tag;
                        
                        // Try with modifiers on retries 3 and 2
                        let applyMod = false;
                        if (subjectTags.length > 0 && modifierTags.length > 0 && Math.random() > 0.5) {
                            if (maxRetries > 1) applyMod = true;
                        }
                        
                        if (applyMod) {
                            const mod = selectWeightedTags(modifierTags, 1);
                            if (mod.length > 0) q += ` ${mod[0]}`;
                        }
                        
                        const isFresh = Math.random() < freshnessRatio;
                        if (!isFresh) q += ' sort:random';
                        if (baseSearch) q = `${baseSearch} ${q}`;
                        
                        q += ' score:>=300';
                        const res = await fetchR34Posts(q, countPerTag, pageIndex, isBackground);
                        if (res && res.length > 0) return res;
                        maxRetries--;
                    }
                    return [];
                });
            });
        }
    }
    
    return queries;
}

async function startContinuousAlgoPreload(startPage) {
    if (isAlgoPreloading && currentAlgoPreloadPage >= startPage) return;
    
    isAlgoPreloading = true;
    currentAlgoPreloadPage = startPage;
    
    while(isAlgoPreloading) {
        if (algoPreloadQueue.length < ALGO_PRELOAD_BUFFER_SIZE) {
            const queries = await getAlgoBatchQueries(currentAlgoPreloadPage, true);
            const resultsArrays = await Promise.all(queries.map(q => q()));
            const data = resultsArrays.flat().filter(p => p !== null && p !== undefined);
            
            if (!isAlgoPreloading) break;
            
            if (data && data.length > 0) {
                algoPreloadQueue.push(data);
                currentAlgoPreloadPage++;
            } else {
                // If it fails or returns empty, pause to prevent infinite failure loops
                await new Promise(r => setTimeout(r, 2000));
            }
        } else {
            // Queue full
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

async function pullBlendedBatch(append = false, isMainGrid = false) {
    if (append && isAlgoLoading) return;
    if (vaultedPosts.length === 0) {
        triggerToastNotification('Vault is empty. Save some images to train the algorithm!');
    }
    
    if (!append) {
        isAlgoLoading = false;
        if (typeof window.clearBackgroundFetchQueue === 'function') {
            window.clearBackgroundFetchQueue();
        }
    }

    isAlgoLoading = true;
    const myVersion = ++window.algoRequestVersion;
    logAlgo(append ? 'Pulling next chunk for infinite scroll...' : 'Initiating feed generation...');
    
    const targetGrid = isMainGrid ? document.getElementById('grid') : algoGrid;
    const targetStatus = isMainGrid ? document.getElementById('status') : algoStatus;
    const bottomStatusEl = document.getElementById('bottom-status');
    
    try {
        if (!append) {
            targetGrid.innerHTML = '';
            algoGridPage = 0;
            targetStatus.style.display = 'block';
            if(bottomStatusEl) bottomStatusEl.style.display = 'none';
            targetStatus.innerHTML = '<div class="heart-loader"></div>Analyzing Vault & Generating Feed...';
            
            isAlgoPreloading = false;
            algoPreloadQueue = [];
            cachedPosts = [];
        } else {
            if(bottomStatusEl) bottomStatusEl.style.display = 'block';
            algoGridPage++; // Properly increment the central tracking state
        }

        // If we have a preloaded queue element, render it immediately
        if (append && algoPreloadQueue.length > 0) {
            const preloadedPosts = algoPreloadQueue.shift().filter(p => p !== null && p !== undefined);
            if (myVersion !== window.algoRequestVersion) return;

            if (preloadedPosts.length > 0) {
                const uniquePosts = [];
                const renderedIds = new Set(cachedPosts.map(p => p.id));
                const vaultedIds = new Set(typeof vaultedPosts !== 'undefined' ? vaultedPosts.map(vp => vp.id) : []);
                
                preloadedPosts.forEach(post => {
                    if (post && post.id && !renderedIds.has(post.id) && !vaultedIds.has(post.id)) {
                        renderedIds.add(post.id);
                        uniquePosts.push(post);
                    }
                });

                if (uniquePosts.length > 0) {
                    targetStatus.style.display = 'none';
                    if (bottomStatusEl) bottomStatusEl.style.display = 'none';
                    cachedPosts = cachedPosts.concat(uniquePosts);
                    if (typeof injectPostCardsIntoGrid === 'function') {
                        injectPostCardsIntoGrid(uniquePosts, targetGrid);
                    }
                }
            }
            
            isAlgoLoading = false;
            startContinuousAlgoPreload(algoGridPage + 1);
            setTimeout(() => {
                if (typeof window.checkSentinelVisibility === 'function') {
                    window.checkSentinelVisibility();
                }
            }, 300);
            return;
        }

        // Otherwise, fetch progressively
        const queries = await getAlgoBatchQueries(algoGridPage);
        if (myVersion !== window.algoRequestVersion) return;

        if (queries.length === 0) {
            isAlgoLoading = false;
            if (bottomStatusEl) bottomStatusEl.style.display = 'none';
            if (!append) {
                targetStatus.style.display = 'block';
                targetStatus.innerHTML = 'No results found. Try clearing your Base Search or lowering weights.';
            }
            return;
        }

        const renderedIds = new Set(cachedPosts.map(p => p.id));
        let activeRequests = queries.length;
        let hasRenderedFirst = false;

        // Run each fetch query progressively and append as they arrive!
        queries.forEach(async (queryFn) => {
            try {
                const posts = await queryFn();
                if (myVersion !== window.algoRequestVersion) return;

                if (posts && posts.length > 0) {
                    const vaultedIds = new Set(typeof vaultedPosts !== 'undefined' ? vaultedPosts.map(vp => vp.id) : []);
                    const uniquePosts = posts.filter(post => {
                        if (post && post.id && !renderedIds.has(post.id) && !vaultedIds.has(post.id)) {
                            renderedIds.add(post.id);
                            return true;
                        }
                        return false;
                    });

                    if (uniquePosts.length > 0) {
                        if (!hasRenderedFirst && !append) {
                            targetStatus.style.display = 'none';
                            hasRenderedFirst = true;
                        }

                        cachedPosts = cachedPosts.concat(uniquePosts);
                        if (typeof injectPostCardsIntoGrid === 'function') {
                            injectPostCardsIntoGrid(uniquePosts, targetGrid);
                        }
                    }
                }
            } catch (err) {
                console.error("Query execution failed", err);
            } finally {
                activeRequests--;
                // When the final concurrent request resolves, clean up loading states
                if (activeRequests === 0) {
                    isAlgoLoading = false;
                    if (bottomStatusEl) bottomStatusEl.style.display = 'none';
                    if (!hasRenderedFirst && !append && cachedPosts.length === 0) {
                        targetStatus.style.display = 'block';
                        targetStatus.innerHTML = 'No results found. Try clearing your Base Search or lowering weights.';
                    }
                    startContinuousAlgoPreload(algoGridPage + 1);
                    setTimeout(() => {
                        if (typeof window.checkSentinelVisibility === 'function') {
                            window.checkSentinelVisibility();
                        }
                    }, 300);
                }
            }
        });

    } catch (err) {
        console.error("Error inside pullBlendedBatch:", err);
        isAlgoLoading = false;
        if (bottomStatusEl) bottomStatusEl.style.display = 'none';
    }
}

if (algoGenerateBtn) {
    algoGenerateBtn.addEventListener('click', () => {
        algoGridPage = 0;
        const loadMoreBtn = document.getElementById('algo-load-more-btn');
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        pullBlendedBatch(false);
    });
}

const loadMoreBtn = document.getElementById('algo-load-more-btn');
if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
        if (!isAlgoLoading) {
            loadMoreBtn.innerHTML = '<div class="spinner spinner-sm"></div> Loading...';
            loadMoreBtn.disabled = true;
            pullBlendedBatch(true);
        }
    });
}

// Init
document.addEventListener('DOMContentLoaded', initAlgoCache);
