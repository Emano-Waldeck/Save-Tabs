/* global Sortable */
'use strict';

let counter;

const drag = () => {
  Sortable.create(document.getElementById('container'), {
    animation: 150,
    ghostClass: 'blue',
    handle: '.handle'
  });
};

document.getElementById('cancel').addEventListener('click', () => {
  const dialog = window.top.document.getElementById('popup');
  const iframe = dialog.querySelector('iframe');
  iframe.src = '';
  delete iframe.onload;
  dialog.close();
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
    counter.textContent = top.counter(tabs.length);
    document.getElementById('cancel').click();
  });
});

self.build = ({tabs, session, password, div}) => {
  counter = div.querySelector('[data-id="count"]');

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

  Object.assign(container, {
    session,
    password
  });
};

document.getElementById('container').addEventListener('click', e => {
  const command = e.target.dataset.command;
  if (command === 'remove') {
    e.target.closest('.grid').remove();
  }
  else if (e.detail === 2 && command === 'open') {
    chrome.tabs.create({
      url: e.target.value
    });
  }
});

document.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('cancel').click();
  }
});
