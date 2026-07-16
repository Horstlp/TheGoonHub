// Recommendation Engine Logic

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

// Analyze Vault and tally tag frequencies with chronological decay (Recency Bias)
function analyzeVaultTags() {
    const counts = {};
    const total = vaultedPosts.length;
    
    vaultedPosts.forEach((post, index) => {
        if (!post.tags) return;
        
        // Calculate recency weight (Newest post = 1.0, Oldest post = 0.1)
        // This organically prioritizes current interests over older phases.
        const recencyWeight = total > 1 ? 1.0 - (0.9 * (index / (total - 1))) : 1.0;
        
        const tags = post.tags.split(/\s+/).filter(Boolean);
        tags.forEach(t => {
            counts[t] = (counts[t] || 0) + recencyWeight;
        });
    });
    return Object.entries(counts).sort((a,b) => b[1] - a[1]);
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
async function fetchR34Posts(query, limit, page = 0) {
    // We MUST use the API constant from api.js to ensure api_key and user_id are passed, otherwise it 403s.
    const baseUrl = typeof API !== 'undefined' ? API : 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index';
    const url = `${baseUrl}&limit=${limit}&pid=${page}&tags=${encodeURIComponent(query)}&json=1`;
    try {
        const res = await throttledFetch(PROXY + encodeURIComponent(url));
        const text = await res.text();
        if (!text.trim()) return [];
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
    div.innerHTML = `<span style="color: #666;">[${time}]</span> > ${msg}`;
    algoConsole.appendChild(div);
    algoConsole.scrollTop = algoConsole.scrollHeight;
}

// Generate the Algorithm DNA Table
async function renderAlgoTable() {
    if (!algoDnaTableBody) return;
    algoDnaTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;"><div class="spinner"></div></td></tr>';
    
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
            legendHTML += `<div style="display:flex;align-items:center;gap:4px;background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px;"><div style="width:10px;height:10px;background:${color};border-radius:2px;"></div><span>${row.tag} <strong>${(pct * 100).toFixed(1)}%</strong></span></div>`;
        });
        
        if (hasOther) {
            const pct = otherScore / totalSubjectScore;
            conicStops.push(`#444 ${currentDeg}deg 360deg`);
            legendHTML += `<div style="display:flex;align-items:center;gap:4px;background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px;"><div style="width:10px;height:10px;background:#444;border-radius:2px;"></div><span>Other <strong>${(pct * 100).toFixed(1)}%</strong></span></div>`;
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
            <td style="padding: 8px;"><strong>${row.tag}</strong></td>
            <td style="padding: 8px;">${typeEmoji} <span style="text-transform: capitalize;">${row.type}</span></td>
            <td style="padding: 8px;">${row.count}</td>
            <td style="padding: 8px; color: var(--accent-purple);">${row.mult.toFixed(1)}x</td>
            <td style="padding: 8px; font-weight: bold; color: var(--text);">${row.score.toFixed(1)}</td>
            <td style="padding: 8px; font-weight: bold; color: var(--accent-blue);">${pctCoverage}%</td>
        `;
        fragment.appendChild(tr);
    });
    
    algoDnaTableBody.appendChild(fragment);
    logAlgo('DNA Table rendered successfully.');
}

// Pulls a blended batch of images
async function pullBlendedBatch(append = false, isMainGrid = false) {
    if (isAlgoLoading) return;
    if (vaultedPosts.length === 0) {
        triggerToastNotification('Save some images to your vault first to train the algorithm!');
        return;
    }
    isAlgoLoading = true;
    logAlgo(append ? 'Pulling next chunk for infinite scroll...' : 'Initiating feed generation...');
    
    const targetGrid = isMainGrid ? document.getElementById('grid') : algoGrid;
    const targetStatus = isMainGrid ? document.getElementById('status') : algoStatus;
    
    if (!append) {
        targetGrid.innerHTML = '';
        algoGridPage = 0;
        targetStatus.style.display = 'block';
        targetStatus.innerHTML = '<div class="spinner"></div>Analyzing Vault & Generating Feed...';
    } else {
        targetStatus.style.display = 'block';
        targetStatus.innerHTML = '<div class="spinner"></div>Loading more recommendations...';
    }

    const batchSize = parseInt(algoValBatch.value || 50);
    const ratio = parseInt(algoValRatio.value || 20) / 100;
    const fetchAmount = parseInt(algoValFetches.value || 3);
    const freshnessRatio = parseInt(algoValFreshness.value || 10) / 100;
    const baseSearch = algoBaseSearch.value.trim();
    
    const randomCount = Math.round(batchSize * ratio);
    const targetedCount = batchSize - randomCount;
    
    logAlgo(`Calculated batch split: ${randomCount} random discovery posts, ${targetedCount} targeted posts.`);
    
    // Analyze tags
    const sortedTags = analyzeVaultTags();
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
    
    // Update Insights UI
    const allWeighted = [...subjectTags, ...modifierTags].sort((a,b) => b.weight - a.weight);
    algoInsights.innerHTML = '<span style="color:var(--muted); font-size: 0.9rem; margin-right: 10px;">Top Weighted Influences:</span>';
    allWeighted.slice(0, 5).forEach(t => {
        const pill = document.createElement('span');
        pill.className = 'lb-stream-tag';
        pill.textContent = `${t.tag} (${t.weight.toFixed(1)})`;
        if (t.type === 'character') pill.style.borderColor = '#34d399';
        if (t.type === 'artist') pill.style.borderColor = '#fbbf24';
        if (t.type === 'copyright') pill.style.borderColor = '#a78bfa';
        algoInsights.appendChild(pill);
    });

    // Build the concurrent fetch pool
    const fetchPromises = [];
    
    // 1. Fetch Discovery Pool
    if (randomCount > 0) {
        const isFresh = Math.random() < freshnessRatio;
        let q = isFresh ? '' : 'sort:random';
        if (baseSearch) q = isFresh ? baseSearch : `${baseSearch} sort:random`;
        q += (q ? ' ' : '') + 'score:>=300'; // Enforce high-quality score filter
        logAlgo(`Queuing Discovery Fetch: "${q}" for ${randomCount} posts...`);
        fetchPromises.push((async () => {
            const res = await fetchR34Posts(q, randomCount, algoGridPage);
            logAlgo(`✔️ Hit [Discovery]: "${q}" returned ${res.length} posts.`);
            return res;
        })());
    }
    
    // 2. Fetch Targeted Pool
    if (targetedCount > 0) {
        const primaryPool = subjectTags.length > 0 ? subjectTags : modifierTags;
        const tagsToQuery = selectWeightedTags(primaryPool, fetchAmount);
        
        if (tagsToQuery.length > 0) {
            logAlgo(`Selected ${tagsToQuery.length} core subject tags: ${tagsToQuery.join(', ')}`);
            const countPerTag = Math.ceil(targetedCount / tagsToQuery.length);
            
            tagsToQuery.forEach(tag => {
                fetchPromises.push((async () => {
                    let maxRetries = 3;
                    while (maxRetries > 0) {
                        let q = tag;
                        
                        // 50% chance to append a modifier, 50% chance for pure tag
                        // On the final retry, skip modifiers entirely to guarantee hits
                        if (subjectTags.length > 0 && modifierTags.length > 0 && Math.random() > 0.5 && maxRetries > 1) {
                            const mod = selectWeightedTags(modifierTags, 1);
                            if (mod.length > 0) {
                                q += ` ${mod[0]}`;
                            }
                        }
                        
                        const isFresh = Math.random() < freshnessRatio;
                        if (!isFresh) {
                            q += ' sort:random';
                        }
                        
                        if (baseSearch) q = `${baseSearch} ${q}`;
                        q += ' score:>=300'; // Enforce high-quality score filter
                        
                        logAlgo(`Queuing Targeted Fetch (Attempt ${4 - maxRetries}/3): "${q}" for ${countPerTag} posts...`);
                        const res = await fetchR34Posts(q, countPerTag, algoGridPage);
                        
                        if (res.length > 0) {
                            logAlgo(`✔️ Hit [Targeted]: "${q}" returned ${res.length} posts.`);
                            return res;
                        }
                        
                        logAlgo(`❌ Miss [Targeted]: "${q}" returned 0 posts. Retrying...`);
                        maxRetries--;
                    }
                    return [];
                })());
            });
        }
    }
    
    logAlgo(`Executing ${fetchPromises.length} parallel API requests...`);
    const resultsArrays = await Promise.all(fetchPromises);
    
    const allPosts = resultsArrays.flat();
    logAlgo(`Received ${allPosts.length} total raw posts from API.`);
    
    const uniquePostsMap = new Map();
    const existingIds = append ? new Set(cachedPosts.map(p => p.id)) : new Set();
    
    allPosts.forEach(post => {
        // Prevent duplicates within the same batch, AND prevent duplicates across Infinite Scroll batches
        if (!uniquePostsMap.has(post.id) && !existingIds.has(post.id)) {
            uniquePostsMap.set(post.id, post);
        }
    });
    
    let finalBatch = Array.from(uniquePostsMap.values());
    logAlgo(`Deduplicated array: ${finalBatch.length} unique posts remain.`);
    
    // Fisher-Yates Shuffle
    logAlgo('Shuffling final batch...');
    for (let i = finalBatch.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [finalBatch[i], finalBatch[j]] = [finalBatch[j], finalBatch[i]];
    }
    
    targetStatus.style.display = 'none';
    
    if (finalBatch.length === 0 && !append) {
        targetStatus.style.display = 'block';
        targetStatus.innerHTML = 'No results found. Try clearing your Base Search or lowering weights.';
        logAlgo('ERROR: Batch resulted in 0 posts.');
        isAlgoLoading = false;
        return;
    }
    
    if (typeof injectPostCardsIntoGrid === 'function') {
        if (!append) cachedPosts = [];
        cachedPosts = append ? cachedPosts.concat(finalBatch) : finalBatch;
        logAlgo(`Injecting ${finalBatch.length} posts into grid...`);
        injectPostCardsIntoGrid(finalBatch, targetGrid);
    }
    
    logAlgo('Batch successfully completed.');
    const loadMoreBtn = document.getElementById('algo-load-more-btn');
    if (loadMoreBtn) {
        if (finalBatch.length > 0) {
            loadMoreBtn.style.display = 'inline-block';
            loadMoreBtn.innerHTML = '🔄 Load More Discoveries';
            loadMoreBtn.disabled = false;
        } else {
            loadMoreBtn.style.display = 'none';
        }
    }
    
    isAlgoLoading = false;
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
            algoGridPage++;
            loadMoreBtn.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle;"></div> Loading...';
            loadMoreBtn.disabled = true;
            pullBlendedBatch(true);
        }
    });
}

// Init
document.addEventListener('DOMContentLoaded', initAlgoCache);
