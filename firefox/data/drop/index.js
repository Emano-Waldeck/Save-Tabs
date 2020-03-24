'use strict';

const args = new URLSearchParams(location.search);

document.addEventListener('dragover', e => e.preventDefault());

const read = file => {
  if (file.size > 100e6) {
    console.warn('more than 100MB session file? I don\'t believe you.');
    return;
  }
  const reader = new FileReader();
  reader.onloadend = event => {
    const json = JSON.parse(event.target.result);
    const next = () => chrome.runtime.reload();
    chrome.storage.sync.get(null, prefs => {
      if (args.get('command') === 'append') {
        const sessions = [...(prefs.sessions || []), ...(json.sessions || [])]
          .filter((s, i, l) => s && l.indexOf(s) === i);
        Object.assign(prefs, json);
        prefs.sessions = sessions;
        chrome.storage.sync.set(prefs, next);
      }
      else if (args.get('command') === 'overwrite') {
        chrome.storage.sync.clear(() => chrome.storage.sync.set(json, next));
      }
    });
  };
  reader.readAsText(file, 'utf-8');
};

document.addEventListener('drop', e => {
  e.preventDefault();
  read(e.dataTransfer.files[0]);
});

document.querySelector('input').addEventListener('change', e => {
  read(e.target.files[0]);
});
