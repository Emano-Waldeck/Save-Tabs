/* globals safe */
'use strict';

var storage = {
  get: prefs => new Promise(resolve => chrome.storage.sync.get(prefs, resolve)),
  set: prefs => new Promise(resolve => chrome.storage.sync.set(prefs, resolve)),
  remove: arr => new Promise(resolve => chrome.storage.sync.remove(arr, resolve))
};

var notify = message => chrome.notifications.create({
  type: 'basic',
  title: chrome.runtime.getManifest().name,
  message,
  iconUrl: 'data/icons/48.png'
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'store') {
    const props = {
      windowType: 'normal'
    };
    if (request.rule.startsWith('save-window')) {
      props.currentWindow = true;
    }
    if (request.rule.startsWith('save-other-windows')) {
      props.currentWindow = false;
    }
    chrome.tabs.query(props, async(tabs) => {
      tabs = tabs.filter(
        ({url}) => url &&
          url.startsWith('chrome-extension://') === false &&
          url.startsWith('moz-extension://') === false &&
          url.startsWith('about:') === false
      );
      if (tabs.length === 0) {
        notify('nothing to save');

        return response(false);
      }
      let json = JSON.stringify(tabs.map(t => ({
        active: t.active,
        pinned: t.pinned,
        url: t.url,
        incognito: t.incognito,
        index: t.index,
        windowId: t.windowId
      })));
      if (request.password) {
        json = await safe.encrypt(json, request.password);
      }
      const prefs = await storage.get({
        sessions: []
      });
      const name = 'session.' + request.name;
      prefs.sessions.push(name);
      prefs[name] = {
        protected: Boolean(request.password),
        json,
        timestamp: Date.now(),
        tabs: tabs.length
      };
      await storage.set(prefs);
      if (request.rule === 'save-tabs-close') {
        chrome.tabs.create({
          url: 'about:blank'
        }, () => chrome.tabs.remove(tabs.map(t => t.id)));
      }
      else if (request.rule.endsWith('-close')) {
        chrome.tabs.remove(tabs.map(t => t.id));
      }
      response(true);
    });

    return true;
  }
  else if (request.method === 'restore') {
    storage.get({
      sessions: [],
      [request.session]: {}
    }).then(async(prefs) => {
      const session = prefs[request.session];
      try {
        const tabs = JSON.parse(
          session.protected ? await safe.decrypt(session.json, request.password) : session.json
        );
        //
        if (request.single) {
          tabs.forEach(t => chrome.tabs.create({
            url: t.url,
            pinned: t.pinned,
            active: t.active
          }));
        }
        else {
          const windows = {};
          tabs.forEach(t => {
            windows[t.windowId] = windows[t.windowId] || [];
            windows[t.windowId].push(t);
          });
          // sort
          Object.keys(windows).forEach(id => windows[id].sort((a, b) => a.index - b.index));
          // restore
          for (const id of Object.keys(windows)) {
            chrome.windows.create({
              url: windows[id].map(t => t.url),
              incognito: windows[id][0].incognito
            }, ({tabs}) => {
              windows[id].forEach((t, i) => {
                if (t.pinned || t.active) {
                  chrome.tabs.update(tabs[i].id, {
                    pinned: t.pinned,
                    active: t.active
                  });
                }
              });
            });
          }
        }
        if (request.remove) {
          const index = prefs.sessions.indexOf(request.session);
          prefs.sessions.splice(index, 1);
          await storage.set({
            sessions: prefs.sessions
          });
          await storage.remove(request.session);
        }
      }
      catch (e) {
        console.error(e);
        notify('Cannot restore tabs. Wrong password?');
      }
    });
  }
});

// FAQs & Feedback
chrome.storage.local.get({
  'version': null,
  'faqs': true,
  'last-update': 0,
}, prefs => {
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    const now = Date.now();
    const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
    chrome.storage.local.set({
      version,
      'last-update': doUpdate ? Date.now() : prefs['last-update']
    }, () => {
      // do not display the FAQs page if last-update occurred less than 30 days ago.
      if (doUpdate) {
        const p = Boolean(prefs.version);
        window.setTimeout(() => chrome.tabs.create({
          url: chrome.runtime.getManifest().homepage_url + '?version=' + version +
            '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
          active: p === false
        }), 3000);
      }
    });
  }
});

{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL(
    chrome.runtime.getManifest().homepage_url + '?rd=feedback&name=' + name + '&version=' + version
  );
}
