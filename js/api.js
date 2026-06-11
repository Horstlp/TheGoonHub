const PROXY       = 'https://corsproxy.io/?url=';
const API         = 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&api_key=2116381cf8a58c1de26faacfac84d760099e863311a98c1d060028461c82ab831d579f74e72983e6af34adbb661039c6a610d8f422be912fee3cb90b39d38f1a&user_id=6064624';
const AUTOCOMPLETE_API = 'https://api.rule34.xxx/autocomplete.php?q=';
const PER_PAGE    = 40;

let latestPostId = null;
let idCalibrated = false;

async function getLatestId() {
  if (latestPostId !== null) return latestPostId;
  try {
    const url = `${API}&limit=1&json=1`;
    const res = await fetch(PROXY + encodeURIComponent(url));
    const data = await res.json();
    if (data && data[0]) {
      latestPostId = parseInt(data[0].id);
      idCalibrated = true;
    }
  } catch(e) {
    latestPostId = 11200000;
  }
  return latestPostId;
}

const POSTS_PER_DAY = 6000;
async function getIdRange(days) {
  if (days === 'all') return null;
  const latest = await getLatestId();
  const minId  = Math.max(0, latest - (days * POSTS_PER_DAY));
  return { min: minId, max: latest };
}

async function queryAutocomplete(query) {
  const targetUrl = `${AUTOCOMPLETE_API}${encodeURIComponent(query)}`;
  try {
    const res = await fetch(PROXY + encodeURIComponent(targetUrl));
    const data = await res.json();
    renderSuggestions(data);
  } catch(err) {
    console.error('Autocomplete fetch loop fail:', err);
  }
}