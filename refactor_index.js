const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const replacements = [
  ['style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); outline: none;"', 'class="modal-input"'],
  ['style="padding: 10px 20px; background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;"', 'class="btn-outline"'],
  ['style="margin: 0 0 12px 0; color: var(--muted); font-size: 0.9rem;"', 'class="modal-desc"'],
  ['style="padding: 10px 16px; background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 8px; cursor: pointer; font-weight: bold; flex: 1;"', 'class="btn-surface-flex"'],
  ['style="margin: 0 0 8px 0; color: var(--muted); font-size: 0.85rem;"', 'class="modal-label"'],
  ['style="border: none; padding: 0; margin: 0;"', 'class="filter-row"'],
  ['style="margin-bottom: 24px;"', 'class="mb-4"'],
  ['style="flex: 1; background: transparent; border: none; color: var(--text); outline: none; min-width: 150px;"', 'class="search-input"'],
  ['style="border: none; padding: 0; margin: 12px 0 0 0; display: flex; gap: 12px; align-items: center;"', 'class="search-options-row"'],
  ['style="position: relative;"', 'class="relative"'],
  ['style="background: var(--surface); color: var(--text); cursor: pointer; text-align: left; min-width: 140px; display: flex; justify-content: space-between; align-items: center;"', 'class="search-dropdown-btn"'],
  ['style="text-align: center; color: var(--muted); padding: 20px;"', 'class="text-center text-muted p-4"'],
  ['style="height: 10px; width: 100%;"', 'class="intersection-observer-target"'],
  ['style="background: var(--surface); padding: 24px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 24px;"', 'class="insight-box"'],
  ['style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text);"', 'class="form-input"'],
  ['style="background: #1e1e1e; color: #34d399; font-family: monospace; font-size: 0.85rem; padding: 12px; border-radius: 8px; height: 150px; overflow-y: auto; margin-bottom: 24px; border: 1px solid #333; display: flex; flex-direction: column; gap: 4px;"', 'class="console-box"'],
  ['style="margin-bottom: 24px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px;"', 'class="settings-group"'],
  ['style="padding: 12px; cursor: pointer; font-weight: bold;"', 'class="settings-row"'],
  ['style="padding: 24px; display: flex; flex-direction: column; align-items: center; border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.1);"', 'class="settings-group-header"'],
  ['style="margin-top: 0; margin-bottom: 4px;"', 'class="mt-0 mb-1"'],
  ['style="font-size: 0.85rem; color: var(--muted); margin-bottom: 20px; text-align: center;"', 'class="settings-desc"'],
  ['style="width: 250px; height: 250px; border-radius: 50%; background: #222; box-shadow: 0 4px 16px rgba(0,0,0,0.4); border: 4px solid var(--surface-light); transition: background 0.3s ease;"', 'class="vault-btn"'],
  ['style="margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; font-size: 0.8rem; max-width: 600px;"', 'class="vault-stats"'],
  ['style="padding: 12px; max-height: 400px; overflow-y: auto;"', 'class="modal-body-scroll"'],
  ['style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;"', 'class="algo-table"'],
  ['style="position: sticky; top: 0; background: var(--surface);"', 'class="sticky-header"'],
  ['style="text-align: center;"', 'class="text-center"'],
  ['style="background: var(--accent-purple); color: white; border: none; border-radius: 30px; padding: 12px 32px; font-size: 1.1rem; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 12px rgba(139,92,246,0.3);"', 'class="btn-primary-large"'],
  ['style="text-align: center; color: var(--muted); padding: 20px; display: none;"', 'class="text-center text-muted p-4 d-none"'],
  ['style="margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 8px;"', 'class="flex-wrap gap-2 mb-4"'],
  ['style="text-align: center; margin-top: 30px; margin-bottom: 30px;"', 'class="text-center my-5"'],
  ['style="padding: 8px 16px; border-radius: 20px; border: none; background: var(--accent-purple); color: white; cursor: pointer; font-weight: bold; transition: 0.2s;"', 'class="btn-pill-primary"'],
  ['style="padding: 8px 16px; border-radius: 20px; border: none; background: var(--surface); color: var(--text); cursor: pointer; font-weight: bold; transition: 0.2s;"', 'class="btn-pill-surface"'],
  ['style="background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 20px; outline: none; width: 200px;"', 'class="input-pill"'],
  ['style="background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 20px; outline: none; cursor: pointer;"', 'class="select-pill"'],
  ['style="text-align: center; color: var(--muted); padding: 40px; display: none;"', 'class="text-center text-muted p-5 d-none"'],
  ['style="font-weight: bold; color: var(--text); margin-right: auto;"', 'class="font-bold mr-auto"'],
  ['style="background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 8px; outline: none; cursor: pointer;"', 'class="btn-bg-outline"'],
  ['style="background: var(--accent-blue); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s;"', 'class="btn-blue"'],
  ['style="background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s;"', 'class="btn-danger"'],
  ['style="background: transparent; color: var(--muted); border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s;"', 'class="btn-outline-muted"'],
  ['style="position: fixed; top: 20px; left: 20px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); padding: 8px 16px; border-radius: 8px; z-index: 1010; backdrop-filter: blur(4px); display: flex; gap: 15px;"', 'class="floating-action-bar-left"'],
  ['style="position: fixed; top: 20px; right: 20px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer; z-index: 1010; backdrop-filter: blur(4px);"', 'class="floating-action-btn-right"'],
  ['style="background: var(--bg); border: 1px solid var(--border); border-radius: 16px; width: 90%; max-width: 320px; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; max-height: 80vh;"', 'class="modal-content-small"'],
  ['style="background: transparent; border: none; color: var(--text); cursor: pointer; font-size: 1.2rem;"', 'class="btn-close"'],
  ['style="margin-bottom: 12px; min-height: 40px; padding: 0 10px;"', 'class="modal-header-spaced"'],
  ['style="width: 100%; background: transparent; border: none; outline: none; color: var(--text);"', 'class="input-transparent"'],
  ['style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; padding-right: 4px;"', 'class="modal-body-flex"'],
  ['style="flex: 1; background: var(--surface); border: 1px solid var(--border); padding: 10px; border-radius: 8px; color: var(--text); outline: none;"', 'class="input-surface-flex"'],
  ['style="background: var(--accent-purple); color: white; border: none; padding: 0 16px; border-radius: 8px; cursor: pointer; font-weight: bold;"', 'class="btn-purple-sm"'],
  ['style="width: 18px; height: 18px; accent-color: var(--accent-purple); cursor: pointer;"', 'class="checkbox-purple"'],
  ['style="color: var(--text); cursor: pointer; font-size: 0.95rem;"', 'class="cursor-pointer text-normal"'],
  ['style="padding: 10px 20px; background: var(--accent-purple); border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;"', 'class="btn-purple"'],
  ['style="margin: 0; font-size: 1.2rem; color: #ef4444;"', 'class="modal-title-danger"'],
  ['style="color: var(--muted); font-size: 0.95rem; margin: 0;"', 'class="modal-subtitle"'],
  ['style="padding: 10px 20px; background: #ef4444; border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;"', 'class="btn-danger"'],
  ['style="background: var(--bg); border: 1px solid var(--border); border-radius: 16px; width: 90%; max-width: 600px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 24px; max-height: 85vh;"', 'class="modal-content-large"'],
  ['style="margin: 0; font-size: 1.4rem;"', 'class="modal-title-large"'],
  ['style="overflow-y: auto; display: flex; flex-direction: column; gap: 24px; padding-right: 8px;"', 'class="modal-body-large"'],
  ['style="padding: 10px 16px; background: var(--accent-purple); border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;"', 'class="btn-purple-md"'],
  ['style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;"', 'class="flex-wrap gap-1 align-center"'],
  ['style="background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 30px; padding: 0 20px; cursor: pointer; transition: all 0.2s;"', 'class="btn-pill-outline"']
];

replacements.forEach(([find, replace]) => {
  html = html.split(find).join(replace);
});

// merge double classes (e.g. class="modal-box" class="modal-content-large" -> class="modal-box modal-content-large")
html = html.replace(/class=\"([^\"]+)\"\s+class=\"([^\"]+)\"/g, 'class="$1 $2"');
html = html.replace(/class=\"([^\"]+)\"\s+class=\"([^\"]+)\"/g, 'class="$1 $2"');
html = html.replace(/class=\"([^\"]+)\"\s+class=\"([^\"]+)\"/g, 'class="$1 $2"');

fs.writeFileSync('index.html', html);

// Generate CSS
const cssToAdd = `
/* ── Refactored Utility & Component Classes ── */
.modal-input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); outline: none; }
.btn-outline { padding: 10px 20px; background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
.modal-desc { margin: 0 0 12px 0; color: var(--muted); font-size: 0.9rem; }
.btn-surface-flex { padding: 10px 16px; background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 8px; cursor: pointer; font-weight: bold; flex: 1; }
.modal-label { margin: 0 0 8px 0; color: var(--muted); font-size: 0.85rem; }
.mb-4 { margin-bottom: 24px; }
.search-input { flex: 1; background: transparent; border: none; color: var(--text); outline: none; min-width: 150px; }
.search-options-row { border: none; padding: 0; margin: 12px 0 0 0; display: flex; gap: 12px; align-items: center; }
.relative { position: relative; }
.search-dropdown-btn { background: var(--surface); color: var(--text); cursor: pointer; text-align: left; min-width: 140px; display: flex; justify-content: space-between; align-items: center; }
.text-center { text-align: center; }
.text-muted { color: var(--muted); }
.p-4 { padding: 20px; }
.p-5 { padding: 40px; }
.my-5 { margin-top: 30px; margin-bottom: 30px; }
.intersection-observer-target { height: 10px; width: 100%; }
.insight-box { background: var(--surface); padding: 24px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 24px; }
.form-input { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
.console-box { background: #1e1e1e; color: #34d399; font-family: monospace; font-size: 0.85rem; padding: 12px; border-radius: 8px; height: 150px; overflow-y: auto; margin-bottom: 24px; border: 1px solid #333; display: flex; flex-direction: column; gap: 4px; }
.settings-group { margin-bottom: 24px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; }
.settings-row { padding: 12px; cursor: pointer; font-weight: bold; }
.settings-group-header { padding: 24px; display: flex; flex-direction: column; align-items: center; border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.1); }
.mt-0 { margin-top: 0; }
.mb-1 { margin-bottom: 4px; }
.settings-desc { font-size: 0.85rem; color: var(--muted); margin-bottom: 20px; text-align: center; }
.vault-btn { width: 250px; height: 250px; border-radius: 50%; background: #222; box-shadow: 0 4px 16px rgba(0,0,0,0.4); border: 4px solid var(--surface-light); transition: background 0.3s ease; }
.vault-stats { margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; font-size: 0.8rem; max-width: 600px; }
.modal-body-scroll { padding: 12px; max-height: 400px; overflow-y: auto; }
.algo-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
.sticky-header { position: sticky; top: 0; background: var(--surface); }
.btn-primary-large { background: var(--accent-purple); color: white; border: none; border-radius: 30px; padding: 12px 32px; font-size: 1.1rem; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 12px rgba(139,92,246,0.3); }
.flex-wrap { display: flex; flex-wrap: wrap; }
.gap-1 { gap: 6px; }
.gap-2 { gap: 8px; }
.align-center { align-items: center; }
.btn-pill-primary { padding: 8px 16px; border-radius: 20px; border: none; background: var(--accent-purple); color: white; cursor: pointer; font-weight: bold; transition: 0.2s; }
.btn-pill-surface { padding: 8px 16px; border-radius: 20px; border: none; background: var(--surface); color: var(--text); cursor: pointer; font-weight: bold; transition: 0.2s; }
.input-pill { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 20px; outline: none; width: 200px; }
.select-pill { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 20px; outline: none; cursor: pointer; }
.font-bold { font-weight: bold; }
.mr-auto { margin-right: auto; }
.btn-bg-outline { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 16px; border-radius: 8px; outline: none; cursor: pointer; }
.btn-blue { background: var(--accent-blue); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
.btn-danger { background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
.btn-outline-muted { background: transparent; color: var(--muted); border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
.floating-action-bar-left { position: fixed; top: 20px; left: 20px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); padding: 8px 16px; border-radius: 8px; z-index: 1010; backdrop-filter: blur(4px); display: flex; gap: 15px; }
.floating-action-btn-right { position: fixed; top: 20px; right: 20px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer; z-index: 1010; backdrop-filter: blur(4px); }
.modal-content-small { background: var(--bg); border: 1px solid var(--border); border-radius: 16px; width: 90%; max-width: 320px; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; max-height: 80vh; }
.btn-close { background: transparent; border: none; color: var(--text); cursor: pointer; font-size: 1.2rem; }
.modal-header-spaced { margin-bottom: 12px; min-height: 40px; padding: 0 10px; }
.input-transparent { width: 100%; background: transparent; border: none; outline: none; color: var(--text); }
.modal-body-flex { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; padding-right: 4px; }
.input-surface-flex { flex: 1; background: var(--surface); border: 1px solid var(--border); padding: 10px; border-radius: 8px; color: var(--text); outline: none; }
.btn-purple-sm { background: var(--accent-purple); color: white; border: none; padding: 0 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
.checkbox-purple { width: 18px; height: 18px; accent-color: var(--accent-purple); cursor: pointer; }
.cursor-pointer { cursor: pointer; }
.text-normal { font-size: 0.95rem; }
.btn-purple { padding: 10px 20px; background: var(--accent-purple); border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
.modal-title-danger { margin: 0; font-size: 1.2rem; color: #ef4444; }
.modal-subtitle { color: var(--muted); font-size: 0.95rem; margin: 0; }
.modal-content-large { background: var(--bg); border: 1px solid var(--border); border-radius: 16px; width: 90%; max-width: 600px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 24px; max-height: 85vh; }
.modal-title-large { margin: 0; font-size: 1.4rem; }
.modal-body-large { overflow-y: auto; display: flex; flex-direction: column; gap: 24px; padding-right: 8px; }
.btn-purple-md { padding: 10px 16px; background: var(--accent-purple); border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: bold; }
.btn-pill-outline { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 30px; padding: 0 20px; cursor: pointer; transition: all 0.2s; }
`;

fs.appendFileSync('css/style.css', cssToAdd);
