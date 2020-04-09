'use strict';

if (location.href.indexOf('mode=vertical') !== -1) {
  document.body.classList.add('vertical');
}

const prompt = document.getElementById('prompt');
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
      const div = target.closest('div[data-session]');
      const {session} = div.dataset;
      const index = prefs.sessions.indexOf(session);
      prefs.sessions.splice(index, 1);
      document.body.dataset.count = prefs.sessions.length;
      chrome.storage.sync.set(prefs, () => chrome.storage.sync.remove(session, () => {
        div.remove();
      }));
    });
  }
  else if (method === 'preview') {
    const div = target.closest('div[data-session]');
    const {locked, session} = div.dataset;
    const password = locked === 'true' ? await ask('Enter the Session Password') : '';

    const iframe = document.querySelector('iframe');
    iframe.onload = () => chrome.runtime.sendMessage({
      method,
      session,
      password
    }, tabs => {
      if (Array.isArray(tabs)) {
        iframe.contentWindow.build({tabs, password, session});
      }
      else {
        iframe.dataset.visible = false;
        delete iframe.onload;
      }
    });
    iframe.dataset.visible = true;
    iframe.src = '/data/editor/index.html';
  }
  else if (method === 'restore') {
    const div = target.closest('div[data-session]');
    const {locked, session, permanent} = div.dataset;
    chrome.runtime.sendMessage({
      method,
      session,
      password: locked === 'true' ? await ask('Enter the Session Password') : '',
      remove: e.shiftKey === false,
      single: document.getElementById('single').checked,
      discard: document.getElementById('discard').checked,
      clean: document.getElementById('clean').checked
    }, () => {
      if (permanent !== 'true') {
        window.close();
        div.remove();
      }
    });
  }
  else if (method && method.startsWith('save-')) {
    const iframe = document.querySelector('iframe');
    iframe.dataset.visible = true;
    iframe.src = '/data/dialog/index.html?method=' + method + '&silent=' + document.getElementById('silent').checked;
  }
  else if (method === 'overwrite') {
    await ask('Your session will be overwritten by open tabs. Are you sure?', 'confirm');
    e.target.classList.add('disabled');
    const div = target.closest('div[data-session]');
    const {session} = div.dataset;
    chrome.storage.local.get({
      'pinned': true,
      'internal': false
    }, prefs => chrome.runtime.sendMessage({
      method: 'overwrite',
      session,
      rule: 'save-tabs',
      ...prefs
    }, length => {
      e.target.classList.remove('disabled');
      if (length) {
        e.target.closest('[data-session]').querySelector('[data-id=count]').textContent = length + ' Tabs';
      }
    }));
  }
  else if (method) {
    chrome.runtime.sendMessage({
      method
    });
  }
});

const format = num => {
  const d = new Date(num);
  return `${d.getFullYear().toString().substr(-2)}.${('00' + (d.getMonth() + 1)).substr(-2)}.${('00' + d.getDate()).substr(-2)} ` +
         `${('00' + d.getHours()).substr(-2)}:${('00' + d.getMinutes()).substr(-2)}`;
};

const build = () => chrome.storage.sync.get(null, prefs => {
  const sessions = document.getElementById('sessions');
  sessions.textContent = '';
  const f = document.createDocumentFragment();

  prefs.sessions = prefs.sessions || [];
  document.body.dataset.count = prefs.sessions.length;
  prefs.sessions.forEach(session => {
    const obj = prefs[session] || {};
    const div = document.createElement('div');
    div.dataset.session = session;
    div.dataset.locked = obj.protected;
    const name = document.createElement('span');
    name.textContent = session.replace(/^session\./, '');
    name.dataset.session = session;
    name.dataset.cmd = 'restore';
    name.title = name.textContent + `

Shift + click: restore without removing the session`;
    div.appendChild(name);
    div.appendChild(document.createElement('span'));
    const number = document.createElement('span');
    number.dataset.id = 'count';
    number.textContent = obj.tabs + ' Tabs';
    div.appendChild(number);
    const preview = document.createElement('span');
    preview.dataset.cmd = 'preview';
    preview.title = 'Preview this Session';
    div.appendChild(preview);
    const date = document.createElement('span');
    date.textContent = format(obj.timestamp);
    div.appendChild(date);
    const overwrite = document.createElement('span');
    overwrite.dataset.cmd = 'overwrite';
    overwrite.title = 'Overwrite this Session with Open Tabs';
    div.appendChild(overwrite);
    const close = document.createElement('span');
    close.dataset.cmd = 'remove';
    close.title = 'Remove this Session';
    div.appendChild(close);
    div.dataset.permanent = obj.permanent;
    f.appendChild(div);
  });
  sessions.appendChild(f);
});
window.build = build;
document.addEventListener('DOMContentLoaded', build);

// persist
document.addEventListener('DOMContentLoaded', () => chrome.storage.local.get({
  'silent': false,
  'single': false,
  'discard': false,
  'clean': false
}, prefs => {
  document.getElementById('silent').checked = prefs.silent;
  document.getElementById('single').checked = prefs.single;
  document.getElementById('normal').checked = prefs.single === false;
  document.getElementById('discard').checked = prefs.discard;
  document.getElementById('clean').checked = prefs.clean;
}));
document.getElementById('silent').addEventListener('change', e => chrome.storage.local.set({
  'silent': e.target.checked
}));
document.getElementById('manager').addEventListener('change', () => chrome.storage.local.set({
  'single': document.getElementById('single').checked,
  'discard': document.getElementById('discard').checked,
  'clean': document.getElementById('clean').checked
}));
