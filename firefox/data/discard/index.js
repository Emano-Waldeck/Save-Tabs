'use strict';

const args = new URLSearchParams(location.search);

document.title = args.get('title') || args.get('href');

if (document.hidden) {
  document.addEventListener('visibilitychange', () => {
    location.replace(args.get('href'));
  });
}
else {
  location.replace(args.get('href'));
}
