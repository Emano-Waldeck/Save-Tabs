'use strict';

var prompt = document.getElementById('prompt');
const ask = (msg, type = 'prompt') => new Promise((resolve, reject) => {
  const password = prompt.querySelector('[type=password]');
  const callback = e => {
    e.preventDefault();
    prompt.reject = '';
    prompt.removeEventListener('submit', callback);
    prompt.dataset.visible = false;
    resolve(password.value);
  };
  prompt.querySelector('span').textContent = msg;
  prompt.dataset.visible = true;
  prompt.dataset.type = type;
  password[type === 'prompt' ? 'setAttribute' : 'removeAttribute']('required', true);
  prompt.addEventListener('submit', callback);
  prompt.reject = reject;
  if (type === 'prompt') {
    password.focus();
    password.value = '';
  }
});
prompt.addEventListener('click', ({target}) => {
  if (target === prompt) {
    prompt.dataset.visible = false;
    if (prompt.reject) {
      prompt.reject();
    }
  }
});
prompt.querySelector('input[type=button]').addEventListener('click', () => {
  prompt.dispatchEvent(new Event('click'));
});

document.addEventListener('click', async e => {
  const target = e.target;
  const method = target.dataset.cmd;
  if (method === 'remove') {
    await ask('The session data will be erased. Are you sure?', 'confirm');
    chrome.storage.sync.get({
      sessions: []
    }, prefs => {
      const tr = target.closest('tr');
      const session = tr.dataset.session;
      const index = prefs.sessions.indexOf(session);
      prefs.sessions.splice(index, 1);
      chrome.storage.sync.set(prefs, () => chrome.storage.sync.remove(session, () => {
        tr.remove();
      }));
    });
  }
  else if (method === 'restore') {
    const tr = target.closest('tr');
    const {locked, session} = tr.dataset;
    chrome.runtime.sendMessage({
      method,
      session,
      password: locked === 'true' ? await ask('Please enter the password') : '',
      remove: e.shiftKey === false,
      single: (e.metaKey || e.ctrlKey)
    });
  }
  else if (method && method.startsWith('save-')) {
    const iframe = document.querySelector('iframe');
    iframe.dataset.visible = true;
    iframe.src = '/data/dialog/index.html?method=' + method + '&silent=' + document.getElementById('silent').checked;
  }
  else if (method) {
    chrome.runtime.sendMessage({
      method
    });
  }
});

chrome.storage.sync.get(null, prefs => {
  const tbody = document.querySelector('tbody');

  prefs.sessions = prefs.sessions || [];
  prefs.sessions.forEach(session => {
    const obj = prefs[session] || {};
    const tr = document.createElement('tr');
    tr.dataset.session = session;
    tr.dataset.locked = obj.protected;
    const name = document.createElement('td');
    name.textContent = session.replace(/^session\./, '');
    name.dataset.session = session;
    name.dataset.cmd = 'restore';
    name.title = 'If session is not permanent, shift + click to restore without removing the session. Ctrl (or Command) + click to restore into the current window';
    tr.appendChild(name);
    tr.appendChild(document.createElement('td'));
    const date = document.createElement('td');
    date.textContent = (new Date(obj.timestamp)).toLocaleString();
    tr.appendChild(date);
    const number = document.createElement('td');
    number.textContent = obj.tabs + ' Tabs';
    tr.appendChild(number);
    const close = document.createElement('td');
    close.textContent = '×';
    close.dataset.cmd = 'remove';
    tr.appendChild(close);
    tr.dataset.permanent = obj.permanent;
    tbody.appendChild(tr);
  });
});
// init
chrome.storage.local.get({
  'silent': false
}, prefs => {
  document.getElementById('silent').checked = prefs.silent;
});
document.getElementById('silent').addEventListener('change', e => chrome.storage.local.set({
  'silent': e.target.checked
}));
