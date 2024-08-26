'use strict';

const args = new URLSearchParams(location.search);

if (args.has('href')) {
  const href = args.get('href');
  document.title = args.get('title') || href;
  if (document.hidden) {
    document.addEventListener('visibilitychange', () => location.replace(href));
    document.querySelector('link[rel="icon"]').href =
      `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(href)}&size=32`;
  }
  else {
    location.replace(href);
  }
}

