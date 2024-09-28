'use strict';

const args = new URLSearchParams(location.search);

document.addEventListener('dragover', e => e.preventDefault());

const read = file => {
  if (file.size > 100e6) {
    console.warn('more than 100MB session file? I don\'t believe you.');
    return;
  }
  const reader = new FileReader();
  reader.onloadend = async event => {
    try {
      const json = JSON.parse(event.target.result);

      const lprefs = await chrome.storage.local.get({
        sessions: []
      });
      const sprefs = await chrome.storage.sync.get({
        sessions: []
      });
      if (args.get('command') === 'overwrite') {
        await chrome.storage.sync.clear();
        sprefs.sessions.length = 0;

        await chrome.storage.local.remove('sessions');
        for (const session of lprefs.sessions || []) {
          await chrome.storage.local.remove(session);
        }
      }
      for (const session of json.sessions || []) {
        try {
          await chrome.storage.sync.set({
            [session]: json[session]
          });
          if (sprefs.sessions.includes(session) === false) {
            sprefs.sessions.push(session);
          }
        }
        catch (e) {
          await chrome.storage.local.set({
            [session]: json[session]
          });
          if (lprefs.sessions.includes(session) === false) {
            lprefs.sessions.push(session);
          }
        }
      }
      await chrome.storage.sync.set({
        sessions: sprefs.sessions
      });
      await chrome.storage.local.set({
        sessions: lprefs.sessions
      });
      // chrome.runtime.reload();
    }
    catch (e) {
      console.error(e);
      alert(e.message);
    }
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
