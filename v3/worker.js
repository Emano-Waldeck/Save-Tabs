/* global safe */

if (typeof importScripts !== 'undefined') {
  self.importScripts('safe.js');
}

const notify = message => chrome.notifications.create({
  type: 'basic',
  title: chrome.runtime.getManifest().name,
  message,
  iconUrl: '/data/icons/48.png'
}, id => {
  setTimeout(() => chrome.notifications.clear(id), 5000);
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
    const next = async (session, sessions, type) => {
      session.protected = session.json.startsWith('data:application/octet-binary;');
      try {
        const content = session.protected ? await safe.decrypt(session.json, request.password) : session.json;
        let tabs;
        try {
          tabs = JSON.parse(content);
        }
        // backup plan for old version of "safe.js" that does not handle non-printable characters
        catch (e) {
          tabs = JSON.parse(content.replace(/[^\x20-\x7E]/g, ''));
        }

        if (request.method === 'preview') {
          return response(tabs);
        }
        // remove currents
        const removeTabs = [];
        if (request.clean) {
          await chrome.tabs.query({}).then(tabs => removeTabs.push(...tabs));
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
              url = chrome.runtime.getURL('/data/discard/index.html?href=' +
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
            const win = await chrome.windows.create(props);

            const toberemoved = win.tabs;
            for (const t of windows[id]) {
              const props = {
                pinned: t.pinned,
                active: t.active,
                windowId: win.id,
                index: t.index
              };
              // if ('cookieStoreId' in t) {
              //   props.cookieStoreId = t.cookieStoreId;
              // }
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
          await chrome.storage[type].set({
            sessions: sessions.filter(a => a !== request.session)
          });
          await chrome.storage[type].remove(request.session);
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
    };

    chrome.storage.sync.get({
      'sessions': []
    }, prefs => {
      if (prefs.sessions.includes(request.session)) {
        chrome.storage.sync.get({
          [request.session]: {}
        }, ps => {
          next(ps[request.session], prefs.sessions, 'sync');
        });
      }
      else {
        chrome.storage.local.get({
          [request.session]: {}
        }, ps => {
          next(ps[request.session], prefs.sessions, 'local');
        });
      }
    });

    return request.method === 'restore' ? false : true;
  }
});

// recording
const recording = {
  async disk(tabs, request, type = 'new') {
    const map = new Map();
    for (const tab of tabs) {
      map.set(tab.windowId, tab.window);
    }

    for (const [windowId, oldWin] of map.entries()) {
      // what if we are sorting old list (tabs are not accessible anymore)
      const win = await chrome.windows.get(windowId).catch(() => (oldWin || {}));
      map.set(windowId, win);
    }

    const o = [];
    for (const t of tabs) {
      let url = t.url;
      if (url.startsWith('chrome-extension://') && url.includes(chrome.runtime.id)) {
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

    const psync = await chrome.storage.sync.get({
      sessions: []
    });
    const plocal = await chrome.storage.local.get({
      sessions: []
    });

    const no = {
      timestamp: Date.now()
    };

    if (psync.sessions.includes(name)) {
      const o = (await chrome.storage.sync.get({
        [name]: {}
      }))[name];

      Object.assign(no, o);
    }
    else if (plocal.sessions.includes(name)) {
      const o = (await chrome.storage.local.get({
        [name]: {}
      }))[name];

      Object.assign(no, o);
    }

    Object.assign(no, {
      json,
      tabs: tabs.length
    });
    if (type === 'new') {
      Object.assign(no, {
        permanent: request.permanent,
        protected: Boolean(request.password),
        query: {
          rule: request.rule,
          pinned: request.pinned,
          internal: request.internal
        }
      });
    }

    // try to store in the synced storage if failed, store in the local storage
    try {
      await chrome.storage.sync.set({
        [name]: no
      });
      // stored before in the wrong storage
      if (plocal.sessions.includes(name)) {
        const n = plocal.sessions.indexOf(name);
        plocal.sessions.splice(n, 1);

        await chrome.storage.local.remove(name);
        await chrome.storage.local.set({
          sessions: plocal.sessions
        });
      }

      if (psync.sessions.includes(name) === false) {
        await chrome.storage.sync.set({
          sessions: [...psync.sessions, name]
        });
      }
      return {
        count: tabs.length,
        storage: 'sync',
        new: false,
        origin: 'local.6'
      };
    }
    catch (e) {
      await chrome.storage.local.set({
        [name]: no
      });
      // already stored in the wrong storage
      if (psync.sessions.includes(name)) {
        const n = psync.sessions.indexOf(name);
        psync.sessions.splice(n, 1);

        await chrome.storage.sync.set({
          sessions: psync.sessions
        });
        await chrome.storage.sync.remove(name);
      }
      if (plocal.sessions.includes(name) === false) {
        await chrome.storage.local.set({
          sessions: [...plocal.sessions, name]
        });
      }
      return {
        count: tabs.length,
        storage: 'local',
        new: false,
        origin: 'sync.1'
      };
    }
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
      try {
        if (request.internal !== true) {
          tabs = tabs.filter(
            ({url}) => url &&
              url.startsWith('file://') === false &&
              url.startsWith('chrome://') === false &&
              (
                url.startsWith('chrome-extension://') === false ||
                (url.startsWith('chrome-extension://') && url.includes(chrome.runtime.id))
              ) &&
              url.startsWith('moz-extension://') === false &&
              url.startsWith('about:') === false
          );
        }
        if (tabs.length === 0) {
          notify('nothing to save');
          return response({
            count: 0
          });
        }
        const r = await recording.disk(tabs, request, type);
        if (request.rule === 'save-tabs-close') {
          chrome.tabs.create({
            url: 'about:blank'
          }, () => chrome.tabs.remove(tabs.map(t => t.id)));
        }
        else if (request.rule.endsWith('-close')) {
          chrome.tabs.remove(tabs.map(t => t.id));
        }
        response(r);
      }
      catch (e) {
        console.error(e);
        response({
          error: e.message
        });
      }
    });
  }
};

// context menu
{
  const onstartup = () => {
    if (onstartup.done) {
      return;
    }
    onstartup.done = true;

    chrome.contextMenus.create({
      title: 'Add Sessions from JSON File to Current List',
      id: 'append',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      title: 'Overwrite List with Sessions from JSON File',
      id: 'overwrite',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      title: 'Export Sessions as JSON File',
      id: 'export',
      contexts: ['action']
    });
  };
  chrome.runtime.onStartup.addListener(onstartup);
  chrome.runtime.onInstalled.addListener(onstartup);
}
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'export') {
    chrome.storage.sync.get(null, prefs => {
      prefs.sessions = prefs.sessions || [];
      chrome.storage.local.get(null, ps => {
        if ('sessions' in ps) {
          for (const session of ps.sessions) {
            prefs[session] = ps[session];
            prefs.sessions.push(session);
          }
        }
        const text = JSON.stringify(prefs, null, '  ');
        chrome.downloads.download({
          filename: 'save-tabs-sessions.json',
          url: 'data:application/json;base64,' + btoa(text)
        });
      });
    });
  }
  else if (info.menuItemId === 'append' || info.menuItemId === 'overwrite') {
    chrome.windows.getCurrent(win => {
      chrome.windows.create({
        url: '/data/drop/index.html?command=' + info.menuItemId,
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
    const {homepage_url: page, name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, lastFocusedWindow: true}, tbs => tabs.create({
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
