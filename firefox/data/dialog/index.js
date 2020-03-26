'use strict';

const args = new URLSearchParams(location.search);

const prefs = {
  sessions: []
};
chrome.storage.sync.get({
  sessions: []
}, ps => Object.assign(prefs.sessions, ps.sessions));

document.addEventListener('input', ({target}) => {
  if (target.type === 'password') {
    const password = document.querySelector('[name="password"]');
    const confirm = document.querySelector('[name="password-confirm"]');

    confirm.setCustomValidity(
      confirm.value === password.value ? '' : 'Does not match with password'
    );
  }
  if (target.name === 'name') {
    const bol = prefs.sessions.indexOf('session.' + target.value) === -1;
    target.setCustomValidity(bol ? '' : 'This session name is already taken');
  }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({
    method: 'store',
    name: document.querySelector('[name=name]').value,
    password: document.querySelector('[name=password]').value,
    rule: args.get('method'),
    pinned: document.querySelector('[name=pinned]').checked,
    internal: document.querySelector('[name=internal]').checked,
    permanent: document.querySelector('[name=permanent]').checked
  }, bol => {
    window.top.document.querySelector('iframe').dataset.visible = false;
    if (bol) {
      window.top.close();
      window.top.location.reload();
    }
  });
});

document.getElementById('cancel').addEventListener('click', () => {
  window.top.document.querySelector('iframe').dataset.visible = false;
});
// Firefox issue
document.addEventListener('DOMContentLoaded', () => {
  const name = document.querySelector('[name=name]');
  name.value = 'session - ' + Math.random().toString(36).substring(7);
  name.focus();
});
// init
{
  const internal = document.querySelector('[name=internal]');
  const permanent = document.querySelector('[name=permanent]');
  const pinned = document.querySelector('[name=pinned]');
  chrome.storage.local.get({
    'pinned': true,
    'internal': false,
    'permanent': false
  }, prefs => {
    pinned.checked = prefs.pinned;
    permanent.checked = prefs.permanent;
    internal.checked = prefs.internal;
    if (args.get('silent') === 'true') {
      document.dispatchEvent(new Event('submit'));
    }
  });
  permanent.addEventListener('change', e => chrome.storage.local.set({
    'permanent': e.target.checked
  }));
  pinned.addEventListener('change', e => chrome.storage.local.set({
    'pinned': e.target.checked
  }));
  internal.addEventListener('change', e => chrome.storage.local.set({
    'internal': e.target.checked
  }));
}
