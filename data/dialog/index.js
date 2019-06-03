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
    permanent: document.querySelector('[name=permanent]').checked
  }, bol => {
    if (bol) {
      window.top.close();
    }
    else {
      window.top.document.querySelector('iframe').dataset.visible = false;
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
  const permanent = document.querySelector('[name=permanent]');
  chrome.storage.local.get({
    'permanent': false
  }, prefs => {
    permanent.checked = prefs.permanent;
    if (args.get('silent') === 'true') {
      document.dispatchEvent(new Event('submit'));
    }
  });
  permanent.addEventListener('change', e => chrome.storage.local.set({
    'permanent': e.target.checked
  }));
}
