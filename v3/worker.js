/* globals safe, importScripts */
importScripts('safe.js');

const storage = {
  get: prefs => new Promise(resolve => chrome.storage.sync.get(prefs, resolve)),
  set: prefs => new Promise(resolve => chrome.storage.sync.set(prefs, resolve)),
  remove: arr => new Promise(resolve => chrome.storage.sync.remove(arr, resolve))
};

const notify = message => chrome.notifications.create({
  type: 'basic',
  title: chrome.runtime.getManifest().name,
  message,
  iconUrl: 'data/icons/48.png'
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'store' || request.method === 'overwrite') {
    recording.perform(request, response, request.method === 'store' ? 'new' : 'update');
    return true;
  }
  else if (request.method === 'update') {
    recording.disk(request.tabs, request, 'update');
    response(true);
  }
  else if (request.method === 'restore' || request.method === 'preview') {
    storage.get({
      [request.session]: {},
      'sessions': []
    }).then(async prefs => {
      const session = prefs[request.session];
      session.protected = session.json.startsWith('data:application/octet-binary;');
      try {
        const tabs = JSON.parse(
          session.protected ? await safe.decrypt(session.json, request.password) : session.json
        );
        if (request.method === 'preview') {
          return response(tabs);
        }
        // remove currents
        const removeTabs = [];
        if (request.clean) {
          await new Promise(resolve => chrome.tabs.query({}, tabs => {
            removeTabs.push(...tabs);
            resolve();
          }));
        }
        // restore
        const create = (tab, props) => new Promise(resolve => {
          const discarded = request.discard && tab.active !== true;
          if (/Firefox/.test(navigator.userAgent)) {
            props = {...props, discarded, url: tab.url};
            if (discarded) {
              props.title = tab.title;
            }
            chrome.tabs.create(props, resolve);
          }
          else {
            let url = tab.url;
            if (discarded && url.startsWith('http')) {
              url = chrome.runtime.getURL('data/discard/index.html?href=' +
                encodeURIComponent(tab.url)) + '&title=' + encodeURIComponent(tab.title);
            }
            chrome.tabs.create({
              ...props,
              url
            }, resolve);
          }
        });
        const groups = {};
        const groupp = {};
        if (request.single) {
          for (const t of tabs) {
            const props = {
              pinned: t.pinned,
              active: t.active
            };
            if ('cookieStoreId' in t) {
              props.cookieStoreId = t.cookieStoreId;
            }
            const tab = await create(t, props);
            if ('groupId' in t) {
              groups[t.groupId] = groups[t.groupId] || [];
              groups[t.groupId].push(tab.id);
              groupp[t.groupId] = t.group;
            }
          }
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
            const tab = windows[id][0];
            const props = {
              incognito: tab.incognito
            };
            if ('window' in tab && tab.window.width) {
              props.left = tab.window.left;
              props.top = tab.window.top;
              props.width = tab.window.width;
              props.height = tab.window.height;
            }
            const win = await new Promise(resolve => chrome.windows.create(props, resolve));
            const toberemoved = win.tabs;
            for (const t of windows[id]) {
              const props = {
                pinned: t.pinned,
                active: t.active,
                windowId: win.id,
                index: t.index
              };
              if ('cookieStoreId' in t) {
                props.cookieStoreId = t.cookieStoreId;
              }
              const tab = await create(t, props);
              if ('groupId' in t) {
                groups[t.groupId] = groups[t.groupId] || [];
                groups[t.groupId].windowId = win.id;
                groups[t.groupId].push(tab.id);
                groupp[t.groupId] = t.group;
              }
            }
            for (const {id} of toberemoved) {
              chrome.tabs.remove(id);
            }
          }
        }
        if ('group' in chrome.tabs) {
          for (let groupId of Object.keys(groups)) {
            groupId = Number(groupId);
            if (isNaN(groupId) === false && groupId > -1) {
              chrome.tabs.group({
                createProperties: {
                  windowId: groups[groupId].windowId
                },
                tabIds: groups[groupId]
              }, id => {
                const p = groupp[groupId];
                if (p) {
                  chrome.tabGroups.update(id, p);
                }
              });
            }
          }
        }
        if (request.remove && session.permanent !== true) {
          const index = prefs.sessions.indexOf(request.session);
          prefs.sessions.splice(index, 1);
          await storage.set({
            sessions: prefs.sessions
          });
          await storage.remove(request.session);
        }
        if (removeTabs.length) {
          chrome.tabs.remove(removeTabs.map(t => t.id));
        }
      }
      catch (e) {
        console.error(e);
        notify('Cannot restore tabs. Wrong password?');
        response(false);
      }
    });

    return request.method === 'restore' ? false : true;
  }
});

// recording
const recording = {
  async disk(tabs, request, type = 'new') {
    const windowIds = new Set(tabs.map(t => t.windowId));
    const map = new Map();
    for (const windowId of windowIds) {
      const win = await new Promise(resolve => chrome.windows.get(windowId, resolve));
      map.set(windowId, win);
    }

    const o = [];
    for (const t of tabs) {
      let url = t.url;
      if (url.startsWith('chrome-extension://') && url.indexOf(chrome.runtime.id) !== -1) {
        url = (new URLSearchParams(url.split('?')[1])).get('href');
      }
      const win = map.get(t.windowId);
      const me = {
        url,
        title: t.title,
        active: t.active,
        pinned: t.pinned,
        incognito: t.incognito,
        index: t.index,
        windowId: t.windowId,
        window: {
          focused: win.focused,
          type: win.type,
          left: win.left,
          top: win.top,
          width: win.width,
          height: win.height
        },
        cookieStoreId: t.cookieStoreId,
        groupId: t.groupId
      };
      if (me.groupId && me.groupId > -1) {
        try {
          const p = await chrome.tabGroups.get(me.groupId);
          me.group = {
            collapsed: p.collapsed,
            title: p.title,
            color: p.color
          };
        }
        catch (e) {}
      }
      o.push(me);
    }
    let json = JSON.stringify(o);

    if (request.password) {
      json = await safe.encrypt(json, request.password);
    }
    const name = type === 'new' ? 'session.' + request.name : request.session;
    const prefs = await storage.get({
      sessions: [],
      [name]: {}
    });
    if (type === 'new') {
      prefs.sessions.push(name);
    }
    Object.assign(prefs[name], {
      json,
      timestamp: Date.now(),
      tabs: tabs.length
    });
    if (type === 'new') {
      Object.assign(prefs[name], {
        permanent: request.permanent,
        protected: Boolean(request.password),
        query: {
          rule: request.rule,
          pinned: request.pinned,
          internal: request.internal
        }
      });
    }
    await storage.set(prefs);
  },
  perform(request, response, type = 'new') {
    const props = {
      windowType: 'normal'
    };
    if (request.rule.startsWith('save-window')) {
      props.currentWindow = true;
    }
    if (request.rule.startsWith('save-selected')) {
      props.highlighted = true;
    }
    if (request.rule.startsWith('save-other-windows')) {
      props.currentWindow = false;
    }
    if (request.pinned === false) {
      props.pinned = false;
    }
    chrome.tabs.query(props, async tabs => {
      console.log(tabs, props);
      if (request.internal !== true) {
        tabs = tabs.filter(
          ({url}) => url &&
            url.startsWith('file://') === false &&
            url.startsWith('chrome://') === false &&
            (
              url.startsWith('chrome-extension://') === false ||
              (url.startsWith('chrome-extension://') && url.indexOf(chrome.runtime.id) !== -1)
            ) &&
            url.startsWith('moz-extension://') === false &&
            url.startsWith('about:') === false
        );
      }
      if (tabs.length === 0) {
        notify('nothing to save');
        return response(false);
      }
      await recording.disk(tabs, request, type);
      if (request.rule === 'save-tabs-close') {
        chrome.tabs.create({
          url: 'about:blank'
        }, () => chrome.tabs.remove(tabs.map(t => t.id)));
      }
      else if (request.rule.endsWith('-close')) {
        chrome.tabs.remove(tabs.map(t => t.id));
      }
      response(tabs.length);
    });
  }
};

// context menu
{
  const onstartup = () => {
    chrome.contextMenus.create({
      title: 'Append JSON sessions',
      id: 'append',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      title: 'Overwrite JSON sessions',
      id: 'overwrite',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      title: 'Export as JSON',
      id: 'export',
      contexts: ['action']
    });
  };
  chrome.runtime.onStartup.addListener(onstartup);
  chrome.runtime.onInstalled.addListener(onstartup);
}
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'export') {
    storage.get(null).then(prefs => {
      const text = JSON.stringify(prefs, null, '  ');
      chrome.downloads.download({
        filename: 'save-tabs-sessions.json',
        url: 'data:application/json;base64,' + btoa(text)
      });
    });
  }
  else if (info.menuItemId === 'append' || info.menuItemId === 'overwrite') {
    chrome.windows.getCurrent(win => {
      chrome.windows.create({
        url: 'data/drop/index.html?command=' + info.menuItemId,
        width: 600,
        height: 300,
        left: win.left + Math.round((win.width - 600) / 2),
        top: win.top + Math.round((win.height - 300) / 2),
        type: 'popup'
      });
    });
  }
});

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
