/* global Sortable */
'use strict';

const drag = () => {
  const sortable = Sortable.create(document.getElementById('container'), {
    animation: 150,
    ghostClass: 'blue',
    handle: '.handle'
  });
};

document.getElementById('cancel').addEventListener('click', () => {
  const iframe = window.top.document.querySelector('iframe');
  iframe.dataset.visible = false;
  iframe.src = '';
  delete iframe.onload;
});

document.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const container = document.getElementById('container');
  const {session, password} = container;

  const tabs = [...document.querySelectorAll('#container .grid')].map((e, index) => ({
    ...e.tab,
    title: e.querySelector('input[type=text]:first-of-type').value,
    url: e.querySelector('input[type=text]:last-of-type').value,
    index
  }));
  chrome.runtime.sendMessage({
    method: 'update',
    session,
    password,
    tabs
  }, () => {
    document.getElementById('cancel').click();
  });
});

window.build = ({tabs, session, password}) => {
  const container = document.getElementById('container');
  const t = document.querySelector('template');
  for (const tab of tabs) {
    const clone = document.importNode(t.content, true);
    const [title, url] = [...clone.querySelectorAll('input[type=text]')];
    title.value = tab.title;
    url.value = tab.url;
    clone.querySelector('div').tab = tab;

    container.appendChild(clone);
  }
  drag();
  Object.assign(container, {session, password});
};

document.getElementById('container').addEventListener('click', e => {
  const command = e.target.dataset.command;
  if (command === 'remove') {
    e.target.closest('.grid').remove();
  }
});
