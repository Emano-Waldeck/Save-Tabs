'use strict';

const args = new URLSearchParams(location.search);


if (args.has('href')) {
  const href = args.get('href');
  document.title = args.get('title') || href;
  if (document.hidden) {
    document.addEventListener('visibilitychange', () => {
      location.replace(href);
    });
    if (/Firefox/.test(navigator.userAgent) === false) {
      document.querySelector('link[rel="icon"]').href = 'chrome://favicon/' + href;
    }
  }
  else {
    location.replace(href);
  }
}

