'use strict';

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
    rule: location.search.split('method=')[1]
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
