'use strict';

if (location.href.indexOf('mode=vertical') !== -1) {
  document.body.classList.add('vertical');
}

self.counter = number => {
  return number;
};

const prompt = document.getElementById('prompt');
const ask = (msg, type = 'password', value = '') => new Promise((resolve, reject) => {
  const password = prompt.querySelector('[type=password]');
  const text = prompt.querySelector('[type=text]');
  const callback = e => {
    e.preventDefault();
    prompt.reject = '';
    prompt.removeEventListener('submit', callback);
    if (type === 'password') {
      resolve(password.value);
    }
    else if (type === 'prompt') {
      resolve(text.value);
    }
    else {
      resolve(true);
    }
    prompt.close();
  };
  prompt.querySelector('span').textContent = msg;
  prompt.dataset.type = type;
  password[type === 'password' ? 'setAttribute' : 'removeAttribute']('required', true);
  text[type === 'prompt' ? 'setAttribute' : 'removeAttribute']('required', true);
  prompt.addEventListener('submit', callback);
  prompt.reject = reject;
  if (type === 'password') {
    password.focus();
    password.value = value;
  }
  else if (type === 'prompt') {
    text.focus();
    text.value = value;
  }
  prompt.showModal();
});
prompt.addEventListener('click', ({target}) => {
  if (target === prompt) {
    prompt.close();
    if (prompt.reject) {
      prompt.reject();
    }
  }
});
prompt.querySelector('input[type=button]').addEventListener('click', () => {
  prompt.dispatchEvent(new Event('click'));
});
prompt.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    prompt.close();
  }
});

document.addEventListener('click', async e => {
  const target = e.target;
  const method = target.dataset.cmd;
  if (method === 'remove') {
    await ask('The session data will be erased. Are you sure?', 'confirm');

    const div = target.closest('div[data-session]');
    const {session} = div.dataset;

    chrome.storage.sync.get({
      sessions: []
    }, p1 => {
      chrome.storage.local.get({
        sessions: []
      }, p2 => {
        const next = minus => {
          document.body.dataset.count = p1.sessions.length + p2.sessions.length - minus;
          div.remove();
        };

        if (p1.sessions.includes(session)) {
          chrome.storage.sync.set({
            sessions: p1.sessions.filter(a => a !== session)
          }, () => chrome.storage.sync.remove(session, () => {
            next(1);
          }));
        }
        else {
          if (p2.sessions.includes(session)) {
            chrome.storage.local.set({
              sessions: p2.sessions.filter(a => a !== session)
            }, () => chrome.storage.local.remove(session, () => {
              next(1);
            }));
          }
          else {
            next(0);
          }
        }
      });
    });
  }
  else if (method === 'rename') {
    const div = target.closest('div[data-session]');
    const type = div.dataset.synced === 'true' ? 'sync' : 'local';
    const session = div.dataset.session;
    const e = div.querySelector('span');
    chrome.storage[type].get({
      [session]: {}
    }).then(async prefs => {
      const name = await ask('Rename this session?', 'prompt', e.title);

      if (name) {
        prefs[session].name = name;
        e.title = e.textContent = name;
        chrome.storage[type].set(prefs);
      }
    });
  }
  else if (method === 'preview') {
    const div = target.closest('div[data-session]');
    const {locked, session, permanent} = div.dataset;

    const password = locked === 'true' ? await ask('Enter the Session Password', 'password') : '';

    const dialog = document.getElementById('popup');
    const iframe = dialog.querySelector('iframe');
    iframe.addEventListener('load', () => chrome.runtime.sendMessage({
      method,
      session,
      password
    }, tabs => {
      if (Array.isArray(tabs)) {
        iframe.contentWindow.build({
          tabs,
          password,
          session,
          permanent: permanent === 'true',
          div
        });
      }
      else {
        dialog.close();
        delete iframe.onload;
      }
    }), {
      once: true
    });
    dialog.showModal();
    iframe.src = '/data/editor/index.html';
  }
  else if (method === 'restore') {
    const div = target.closest('div[data-session]');
    const {locked, session, permanent} = div.dataset;
    chrome.runtime.sendMessage({
      method,
      session,
      password: locked === 'true' ? await ask('Enter the Session Password', 'password') : '',
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
    const dialog = document.getElementById('popup');
    const iframe = dialog.querySelector('iframe');
    iframe.src = '/data/dialog/index.html?method=' + method + '&silent=' + document.getElementById('silent').checked;
    dialog.showModal();
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
    }, o => {
      if ('error' in o) {
        alert(o.error);
      }
      else {
        e.target.classList.remove('disabled');
        if (o.count) {
          e.target.closest('[data-session]').querySelector('[data-id=count]').textContent = self.counter(o.count);
        }
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
  const yyyy = d.getFullYear().toString();

  return `${yyyy.substr(-2)}.${('00' + (d.getMonth() + 1)).substr(-2)}.${('00' + d.getDate()).substr(-2)} ` +
         `${('00' + d.getHours()).substr(-2)}:${('00' + d.getMinutes()).substr(-2)}`;
};

const build = () => chrome.storage.sync.get(null, p1 => {
  p1.sessions = p1.sessions || [];
  chrome.storage.local.get(null, p2 => {
    p2.sessions = p2.sessions || [];

    const sessions = document.getElementById('sessions');
    sessions.textContent = '';
    const f = document.createDocumentFragment();

    const a = [...p1.sessions, ...p2.sessions];
    a.sort((a, b) => {
      const oa = p1[a] || p2[a] || {};
      const ob = p1[b] || p2[b] || {};

      return oa.timestamp - ob.timestamp;
    });

    document.body.dataset.count = a.length;

    // preview
    {
      const p1 = document.createElement('span');
      p1.textContent = 'Name';
      const p3 = document.createElement('span');
      p3.textContent = 'Permanent';
      p3.title = `Y: Permanent Session
N: Temporary Session`;
      const p2 = document.createElement('span');
      p2.textContent = 'Storage';
      p2.title = `S: Stored in the synced storage
L: Stored in the local storage`;
      const p4 = document.createElement('span');
      p4.textContent = 'Locked';
      p4.title = `Session is password protected or not`;
      const p5 = document.createElement('span');
      p5.textContent = 'Tabs';
      const p6 = document.createElement('span');
      p6.textContent = '-';
      const p7 = document.createElement('span');
      p7.textContent = 'Date';
      const p8 = document.createElement('span');
      p8.textContent = '-';
      const p9 = document.createElement('span');
      p9.textContent = '-';
      const p10 = document.createElement('span');
      p10.textContent = '-';

      const div = document.createElement('div');
      div.classList.add('header');
      div.append(p1, p2, p3, p4, p5, p6, p7, p8, p9, p10);
      sessions.appendChild(div);
    }

    a.forEach(session => {
      const obj = p1[session] || p2[session];
      if (!obj) {
        console.info('session skipped', session, p1, p2);
        return;
      }

      // fix password protected
      obj.protected = obj.json.startsWith('data:application/octet-binary;');

      const div = document.createElement('div');
      div.dataset.session = session;
      div.dataset.locked = obj.protected;
      div.dataset.synced = p1.sessions.includes(session);
      const name = document.createElement('span');
      name.textContent = obj.name || session.replace(/^session\./, '');
      name.dataset.session = session;
      name.dataset.cmd = 'restore';
      name.title = name.textContent;
      if (!obj.permanent) {
        name.title += `

Shift + click: restore without removing the session`;
      }
      div.appendChild(name);

      const synced = document.createElement('span');
      synced.dataset.id = 'synced';
      synced.textContent = p1.sessions.includes(session) ? 'S' : 'L';
      synced.title = p1.sessions.includes(session) ? 'Stored in the synced storage' : 'Stored in the local storage';
      div.appendChild(synced);

      const permanent = document.createElement('span');
      permanent.dataset.id = 'permanent';
      permanent.textContent = obj.permanent ? 'Y' : 'N';
      permanent.title = obj.permanent ? 'This session is permanent' : 'This session is temporary';
      div.appendChild(permanent);

      const lock = document.createElement('span');
      lock.dataset.id = 'lock';
      lock.title = obj.protected ? 'This session is password protected' : 'This session is not protected';
      div.appendChild(lock);
      const number = document.createElement('span');
      number.dataset.id = 'count';
      number.textContent = self.counter(obj.tabs);
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
      const rename = document.createElement('span');
      rename.dataset.cmd = 'rename';
      rename.title = 'Rename this Session';
      div.appendChild(rename);
      const close = document.createElement('span');
      close.dataset.cmd = 'remove';
      close.title = 'Remove this Session';
      div.appendChild(close);
      div.dataset.permanent = obj.permanent;
      f.appendChild(div);
    });
    sessions.appendChild(f);
    sessions.scrollTop = sessions.scrollHeight;
  });
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
