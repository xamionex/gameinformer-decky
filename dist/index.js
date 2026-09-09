const manifest = {"name":"GameInformer"};
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
    throw new Error('[@decky/api]: Failed to connect to the loader as as the loader API was not initialized. This is likely a bug in Decky Loader.');
}
let api;
try {
    api = internalAPIConnection.connect(API_VERSION, manifest.name);
}
catch {
    api = internalAPIConnection.connect(1, manifest.name);
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version 1. Some features may not work.`);
}
if (api._version != API_VERSION) {
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version ${api._version}. Some features may not work.`);
}
const callable = api.callable;
const routerHook = api.routerHook;
const toaster = api.toaster;
const definePlugin = (fn) => {
    return (...args) => {
        return fn(...args);
    };
};

/**
 * DesktopPatch.ts — Injects PCGW/ProtonDB buttons into the desktop Steam game page.
 * The desktop UI renders in the main "Steam" window tab, where Decky is not
 * injected. We connect to that tab via CDP (same pattern as hollow-decky's
 * StorePatch) and install a persistent MutationObserver script once, so the
 * buttons appear instantly whenever the quick-links row renders.
 *
 * Button clicks log `GAMEINFORMER:<url>` via console.log; the CDP WebSocket
 * catches it and opens the URL in Steam's internal browser through
 * SteamUIStore.ActiveWindowInstance.Navigator.SteamWeb (same mechanism as
 * Steam's own quick-links).
 */
const POLL_MS$1 = 2000;
const TAG$1 = "GAMEINFORMER:";
const discoverDesktopTab = callable("discover_desktop_tab");
const INJECT_SCRIPT$1 = `(function(){
if (window.__gameinformerDesktop) return;
window.__gameinformerDesktop = true;
var PCGW = 'https://www.pcgamingwiki.com/api/appid.php?appid=';
var PDB = 'https://www.protondb.com/app/';
function appId(){
  // Desktop Steam keeps the shell URL; the app id lives in React fiber props.
  var m = location.href.match(/\\/app\\/(\\d+)/);
  if (m) return m[1];
  var el = Array.from(document.querySelectorAll('*')).find(function(e){
    return e.innerText && e.innerText.trim() === 'Support';
  });
  if (!el) return '';
  var key = Object.keys(el).find(function(k){ return k.indexOf('__reactFiber') === 0; });
  var f = key ? el[key] : null;
  var depth = 0;
  while (f && depth < 12) {
    var id = f.memoizedProps && f.memoizedProps.appid;
    if (id !== undefined && id !== null) return String(id);
    f = f.return;
    depth++;
  }
  return '';
}
function leafText(e){
  return e && e.innerText ? e.innerText.trim() : '';
}
function findRow(){
  // The quick-links row is the element whose direct children include both
  // "Store Page" and "Support" as leaf texts. Owned games may have extra
  // links (DLC, Workshop, Market), unowned games have fewer.
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (e.children.length < 2) continue;
    var kids = Array.from(e.children);
    var texts = kids.map(leafText);
    if (texts.indexOf('Store Page') > -1 && texts.indexOf('Support') > -1) {
      return e;
    }
  }
  return null;
}
function makeBtn(label, url, support){
  // Clone Steam's own quick-link structure and class names from the Support
  // link, so hover, high-contrast mode, font size and spacing all match
  // automatically regardless of Steam version.
  var anchor = support.children[0];
  var link = anchor ? anchor.children[0] : null;
  var text = link ? link.children[0] : null;
  var outer = document.createElement('div');
  if (support.className) outer.className = support.className;
  var a = document.createElement('div');
  if (anchor && anchor.className) a.className = anchor.className;
  var l = document.createElement('div');
  if (link && link.className) l.className = link.className;
  var t = document.createElement('span');
  if (text && text.className) t.className = text.className;
  t.textContent = label;
  l.appendChild(t);
  a.appendChild(l);
  outer.appendChild(a);
  outer.setAttribute('data-gameinformer', label === 'PCGW' ? 'pcgw' : 'pdb');
  outer.onclick = function(){ console.log('${TAG$1}' + url); };
  return outer;
}
function positionButtons(){
  var row = findRow();
  if (!row) return;
  var pcgw = row.querySelector('[data-gameinformer=pcgw]');
  var pdb = row.querySelector('[data-gameinformer=pdb]');
  if (!pcgw || !pdb) return;
  var support = null;
  for (var i = 0; i < row.children.length; i++) {
    if (leafText(row.children[i]) === 'Support') { support = row.children[i]; break; }
  }
  if (!support) return;
  var w1 = pcgw.offsetWidth;
  var w2 = pdb.offsetWidth;
  // Support's margin-right (24px) separates it from the next link.
  var gap = 24;
  var total = w1 + gap + w2;
  var under = (support.offsetLeft + support.offsetWidth + gap + total) > row.offsetWidth;
  var left = under ? support.offsetLeft : support.offsetLeft + support.offsetWidth + gap;
  var top = under ? support.offsetTop + support.offsetHeight + 4 : support.offsetTop;
  pcgw.style.left = left + 'px';
  pcgw.style.top = top + 'px';
  pdb.style.left = (left + w1 + gap) + 'px';
  pdb.style.top = top + 'px';
}
function addButtons(){
  var row = findRow();
  if (!row) return;
  var id = appId();
  if (!id) return;
  if (row.querySelector('[data-gameinformer]')) return;
  var support = null;
  for (var i = 0; i < row.children.length; i++) {
    if (leafText(row.children[i]) === 'Support') { support = row.children[i]; break; }
  }
  if (!support) return;
  var pcgw = makeBtn('PCGW', PCGW + id, support);
  var pdb = makeBtn('ProtonDB', PDB + id, support);
  pcgw.style.position = 'absolute';
  pdb.style.position = 'absolute';
  row.appendChild(pcgw);
  row.appendChild(pdb);
  positionButtons();
}
addButtons();
new MutationObserver(function(){
  addButtons();
  positionButtons();
}).observe(document.body, {subtree: true, childList: true});
})();`;
let socket$1 = null;
let pollTimer$1 = null;
let msgId$1 = 1;
let openSteamWeb$2 = () => { };
function initDesktopPatch(onOpen) {
    openSteamWeb$2 = onOpen;
    const wsSend = (obj) => {
        if (!socket$1 || socket$1.readyState !== WebSocket.OPEN)
            return;
        socket$1.send(JSON.stringify(obj));
    };
    const connect = (wsUrl) => {
        if (socket$1) {
            try {
                socket$1.close();
            }
            catch { }
            socket$1 = null;
        }
        socket$1 = new WebSocket(wsUrl);
        socket$1.onopen = () => {
            wsSend({ id: msgId$1++, method: "Runtime.enable" });
            wsSend({ id: msgId$1++, method: "Runtime.evaluate", params: { expression: INJECT_SCRIPT$1 } });
        };
        socket$1.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (data.method === "Runtime.consoleAPICalled" && data.params?.args) {
                    for (const arg of data.params.args) {
                        if (arg.type === "string" && typeof arg.value === "string" && arg.value.startsWith(TAG$1)) {
                            openSteamWeb$2(arg.value.slice(TAG$1.length));
                        }
                    }
                }
                if (data.id === 999 && data.result?.result?.value === "missing") {
                    wsSend({ id: msgId$1++, method: "Runtime.evaluate", params: { expression: INJECT_SCRIPT$1 } });
                }
            }
            catch { }
        };
        socket$1.onerror = () => { socket$1 = null; };
        socket$1.onclose = () => { socket$1 = null; };
    };
    const poll = async () => {
        try {
            const tab = await discoverDesktopTab();
            if (tab?.webSocketDebuggerUrl) {
                if (!socket$1 || socket$1.readyState !== WebSocket.OPEN) {
                    connect(tab.webSocketDebuggerUrl);
                }
                else {
                    // Page may have reloaded and lost our script; check and re-inject.
                    wsSend({ id: 999, method: "Runtime.evaluate", params: { expression: "window.__gameinformerDesktop ? 'ok' : 'missing'" } });
                }
            }
            else if (socket$1) {
                try {
                    socket$1.close();
                }
                catch { }
                socket$1 = null;
            }
        }
        catch { }
    };
    poll();
    pollTimer$1 = setInterval(poll, POLL_MS$1);
    return () => {
        if (pollTimer$1) {
            clearInterval(pollTimer$1);
            pollTimer$1 = null;
        }
        if (socket$1) {
            try {
                socket$1.close();
            }
            catch { }
            socket$1 = null;
        }
    };
}

/**
 * OverlayPatch.ts — Injects PCGW/ProtonDB buttons into the Steam in-game overlay
 * (shift+tab). The overlay is a separate CEF window that only exists while a
 * game is running. We discover it via CDP and install a persistent
 * MutationObserver script, so buttons appear whenever the overlay's game page
 * renders.
 *
 * Button clicks log `GAMEINFORMER:<url>` via console.log; the CDP WebSocket
 * catches it and opens the URL in Steam's internal browser through
 * SteamUIStore.ActiveWindowInstance.Navigator.SteamWeb.
 */
const POLL_MS = 2000;
const TAG = "GAMEINFORMER:";
const discoverOverlayTab = callable("discover_overlay_tab");
const INJECT_SCRIPT = `(function(){
if (window.__gameinformerOverlay) return;
window.__gameinformerOverlay = true;
var PCGW = 'https://www.pcgamingwiki.com/api/appid.php?appid=';
var PDB = 'https://www.protondb.com/app/';
function appId(){
  // The overlay keeps the shell URL; the app id lives in the button row's
  // React fiber props.
  var row = findRow();
  if (!row) return '';
  var key = Object.keys(row).find(function(k){ return k.indexOf('__reactFiber') === 0; });
  var f = key ? row[key] : null;
  var depth = 0;
  while (f && depth < 20) {
    var p = f.memoizedProps || {};
    if (p.appid !== undefined && p.appid !== null) return String(p.appid);
    if (p.overview && p.overview.appid !== undefined) return String(p.overview.appid);
    f = f.return;
    depth++;
  }
  return '';
}
function findRow(){
  // The overlay's game button row: a flex container whose children wrap
  // buttons, one of which is the Game Overview (information) button.
  var all = document.querySelectorAll('button');
  for (var i = 0; i < all.length; i++) {
    var cls = (all[i].className || '').toString();
    if (cls.indexOf('GameOverview') > -1) {
      var row = all[i].parentElement ? all[i].parentElement.parentElement : null;
      if (row && row.children.length >= 2) return row;
    }
  }
  return null;
}
function makeBtn(label, url, template, isPdb){
  // Clone the overlay's icon button (DialogButton) structure so styling,
  // focus and gamepad support match the native buttons.
  var wrap = document.createElement('div');
  if (template.parentElement && template.parentElement.className) {
    wrap.className = template.parentElement.className;
  }
  var b = document.createElement('button');
  b.type = 'button';
  b.className = template.className;
  b.setAttribute('data-gameinformer', label === 'PCGW' ? 'pcgw' : 'pdb');
  b.onclick = function(){ console.log('${TAG}' + url); };
  if (isPdb) {
    // Real ProtonDB logo (transparent PNG, as-is).
    b.innerHTML = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAACWCAMAAAAL34HQAAAAllBMVEVHcEz/AGD1AFj0AFj0AFf3AFj0AFj0AFf3AFj0AFr1AFj0AFf0AFf1AFn1AFj1AFj1AFf2AFn1AFf1AFf1AFf1AFj0AFn3AFn1AFf0AFf////////////////////////2AFf////////////////////1AFf////////////////////////////////////1AFf///+Pk9tTAAAAMHRSTlMAEIBg70DA8CAwoL+QUH/g33DQsM+fXz+vj4AQwFDv8G9/YHAwkE+vv9+g4LBPP4/v6BmEAAAI/ElEQVR42u1c6XLjNgwWdR+WZEu27By7m2z37G5b5f1frmOTIEEJJKWE8Uynxq+MJZIfcREAoQTBjW50oxvd6EY3+t8TOx7Ze809HPbjOI5x1RxXjMqHw3a80Gl4B2hPYvILxYdkGZeGasTDnjyDYtr0Z9oO7kFNPB1VeWUY249zihvrGuxAjBn3PnFVI0nb2jxkzilOB3+owtFEVUGPSLbGIfXa1U2Uw8bLOkmSXZ/hVRpiALvDb3SbOgnyZCOGxb7EWPL5WsmZusTaMmMYZlUb5vBz0fKfIj+oGGdWluPfQsWyeLJOg0BpjwqhkX5gRXy23QQsUrgDkgtyJdmUL2JIsWhZF/V8jZlK5KkSpJKUEuBmNoJxFm+8wBqNc9VSkrHw+pF0Cx3FE66Tex+oEr4MedqwXvLmIrDIwqrLPvhDH7a441OZnkqGNUEg/XpmODKZZYsriTM+NT0Gsx/Hg0TV5aa3u8vz0AMsrtil8TlTmg9elzkm8wFr75yp1FHtLK+GdtavoAUnWYRRWZ24b1h2LY2k4md2XxldFVYg47GT/T3ubeIrwUIRnz2eSqzexjMsLQ614romrEmUaDNaDiu7Biywwwz03mKLydVUPpE2WAO/zNbozxIzu48sYuUZgG+xEZc/v2U/L2SqVgdInsa0i8Pq3x3WSdenjcN99d7ORGsEATA2+tvGlf0d1ZzvdF4ASq6kwjos1BnF3uKt2uwBIYHskCrlkA6SMZe/MDAxG/2eOp4LUHvzXB5QWSIbUKyq0Wg/1TdF3FJbL7DauZrmx6E5GOoliqpDMxw1WW68uS0w6hQANScnngm6UwPg/BmiPImD4NhU8TpEis6lTbYk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" style="width:26px;height:26px;vertical-align:middle;pointer-events:none;margin-top:-2.5px"/>';
  } else {
    b.textContent = label;
  }
  wrap.appendChild(b);
  return wrap;
}
function findIconButton(){
  // Use a normal (non-highlighted) icon button like Achievements as the
  // styling template, so size, colors and focus match the native buttons.
  // Skip the GameOverview button, which is highlighted blue.
  var row = findRow();
  if (!row) return null;
  var kids = Array.from(row.children);
  for (var i = 0; i < kids.length; i++) {
    var b = kids[i].querySelector('button');
    if (!b) continue;
    var cls = (b.className || '').toString();
    if (cls.indexOf('hasSVGIcon') > -1 && cls.indexOf('GameOverview') === -1) {
      return b;
    }
  }
  return null;
}
function addButtons(){
  var row = findRow();
  if (!row) return;
  var id = appId();
  if (!id) return;
  if (row.querySelector('[data-gameinformer]')) return;
  // The first button is Game Overview (information); insert right after it.
  var first = row.children[0];
  if (!first) return;
  var template = findIconButton() || first.querySelector('button');
  if (!template) return;
  var pcgw = makeBtn('PCGW', PCGW + id, template, false);
  var pdb = makeBtn('ProtonDB', PDB + id, template, true);
  row.insertBefore(pdb, row.children[1]);
  row.insertBefore(pcgw, row.children[1]);
}
addButtons();
new MutationObserver(addButtons).observe(document.body, {subtree: true, childList: true});
})();`;
let socket = null;
let pollTimer = null;
let msgId = 1;
let openSteamWeb$1 = () => { };
function initOverlayPatch(onOpen) {
    openSteamWeb$1 = onOpen;
    const wsSend = (obj) => {
        if (!socket || socket.readyState !== WebSocket.OPEN)
            return;
        socket.send(JSON.stringify(obj));
    };
    const connect = (wsUrl) => {
        if (socket) {
            try {
                socket.close();
            }
            catch { }
            socket = null;
        }
        socket = new WebSocket(wsUrl);
        socket.onopen = () => {
            wsSend({ id: msgId++, method: "Runtime.enable" });
            wsSend({ id: msgId++, method: "Runtime.evaluate", params: { expression: INJECT_SCRIPT } });
        };
        socket.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (data.method === "Runtime.consoleAPICalled" && data.params?.args) {
                    for (const arg of data.params.args) {
                        if (arg.type === "string" && typeof arg.value === "string" && arg.value.startsWith(TAG)) {
                            openSteamWeb$1(arg.value.slice(TAG.length));
                        }
                    }
                }
                if (data.id === 999 && data.result?.result?.value === "missing") {
                    wsSend({ id: msgId++, method: "Runtime.evaluate", params: { expression: INJECT_SCRIPT } });
                }
            }
            catch { }
        };
        socket.onerror = () => { socket = null; };
        socket.onclose = () => { socket = null; };
    };
    const poll = async () => {
        try {
            const tab = await discoverOverlayTab();
            if (tab?.webSocketDebuggerUrl) {
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    connect(tab.webSocketDebuggerUrl);
                }
                else {
                    // Page may have reloaded and lost our script; check and re-inject.
                    wsSend({ id: 999, method: "Runtime.evaluate", params: { expression: "window.__gameinformerOverlay ? 'ok' : 'missing'" } });
                }
            }
            else if (socket) {
                try {
                    socket.close();
                }
                catch { }
                socket = null;
            }
        }
        catch { }
    };
    poll();
    pollTimer = setInterval(poll, POLL_MS);
    return () => {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        if (socket) {
            try {
                socket.close();
            }
            catch { }
            socket = null;
        }
    };
}

// ── Backend callables ────────────────────────────────────────────────────────
const getPcgwUrl = callable("get_pcgw_url");
// ── Link helpers ─────────────────────────────────────────────────────────────
const PROTONDB_URL = (appId) => `https://www.protondb.com/app/${appId}`;
function notify(title, body) {
    toaster.toast({ title, body, duration: 4000 });
}
async function openPcgw(appId) {
    try {
        const r = await getPcgwUrl(appId);
        if (r?.url) {
            openSteamWeb(r.url);
        }
        else {
            notify("GameInformer", r?.error || `No PCGW page for app ${appId}`);
        }
    }
    catch (e) {
        notify("GameInformer", `PCGW lookup failed: ${e}`);
    }
}
function openProtondb(appId) {
    openSteamWeb(PROTONDB_URL(appId));
}
// Opens a URL in Steam's internal browser (same mechanism Steam's own
// quick-links use: SteamUIStore.ActiveWindowInstance.Navigator.SteamWeb).
// PCGW API URLs are resolved to the wiki page first.
function openSteamWeb(url) {
    const pcgwMatch = url.match(/pcgamingwiki\.com\/api\/appid\.php\?appid=(\d+)/);
    if (pcgwMatch) {
        openPcgw(pcgwMatch[1]);
        return;
    }
    const store = window.SteamUIStore;
    const nav = store?.ActiveWindowInstance?.Navigator;
    if (typeof nav?.SteamWeb === "function") {
        nav.SteamWeb(url);
    }
    else {
        DFL.Navigation.NavigateToExternalWeb(url);
    }
}
// ── Game page buttons (Big Picture / Game Mode) ──────────────────────────────
const ROUTE = "/library/app/:appid";
const KEY = "gameinformer-buttons";
function GameInformerButtons({ appId }) {
    return (SP_JSX.jsxs(DFL.Focusable, { "flow-children": "horizontal", style: { display: "flex", flexDirection: "row", gap: "8px", alignItems: "center", marginLeft: "12px" }, children: [SP_JSX.jsx(DFL.Focusable, { focusClassName: "gameinformer-btn-focus", onActivate: () => openPcgw(appId), style: {
                    padding: "6px 14px",
                    borderRadius: "6px",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "13px",
                    cursor: "pointer",
                    userSelect: "none",
                }, children: "PCGW" }), SP_JSX.jsx(DFL.Focusable, { focusClassName: "gameinformer-btn-focus", onActivate: () => openProtondb(appId), style: {
                    padding: "6px 14px",
                    borderRadius: "6px",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "13px",
                    cursor: "pointer",
                    userSelect: "none",
                }, children: "ProtonDB" })] }, KEY));
}
function initGamePagePatch() {
    const patch = routerHook.addPatch(ROUTE, (tree) => {
        const routeProps = DFL.findInReactTree(tree, (x) => !!x?.renderFunc);
        if (!routeProps)
            return tree;
        const patchHandler = DFL.createReactTreePatcher([
            (t) => {
                const found = DFL.findInReactTree(t, (x) => x?.props?.children?.props?.overview)?.props?.children;
                return found || null;
            },
        ], (_args, ret) => {
            try {
                const container = DFL.findInReactTree(ret, (x) => Array.isArray(x?.props?.children) &&
                    x?.props?.className?.includes?.(DFL.appDetailsClasses?.InnerContainer));
                if (!container?.props?.children)
                    return ret;
                const overviewNode = DFL.findInReactTree(ret, (x) => x?.props?.overview?.appid != null);
                const appId = overviewNode?.props?.overview?.appid?.toString();
                if (!appId)
                    return ret;
                const children = container.props.children;
                if (children.some((c) => c?.key === KEY))
                    return ret;
                // Find the direct child of the container whose subtree holds the
                // quick-links row (GameInfoQuickLinks), so we can insert after it.
                const hasQuickLinks = (node) => {
                    if (!node || typeof node !== "object")
                        return false;
                    if (typeof node?.props?.className === "string" &&
                        node.props.className.includes(DFL.basicAppDetailsSectionStylerClasses?.GameInfoQuickLinks ?? "")) {
                        return true;
                    }
                    const kids = node?.props?.children;
                    if (Array.isArray(kids))
                        return kids.some(hasQuickLinks);
                    return hasQuickLinks(kids);
                };
                let insertAt = 1;
                const qlIdx = children.findIndex(hasQuickLinks);
                if (qlIdx > -1)
                    insertAt = qlIdx + 1;
                children.splice(insertAt, 0, SP_JSX.jsx(GameInformerButtons, { appId: appId }));
            }
            catch (e) {
                console.log("[GameInformer] patch error:", e);
            }
            return ret;
        });
        DFL.afterPatch(routeProps, "renderFunc", patchHandler);
        return tree;
    });
    return () => {
        routerHook.removePatch(ROUTE, patch);
    };
}
// ── Plugin Entry ─────────────────────────────────────────────────────────────
var index = definePlugin(() => {
    const gamePageCleanup = initGamePagePatch();
    const desktopCleanup = initDesktopPatch(openSteamWeb);
    const overlayCleanup = initOverlayPatch(openSteamWeb);
    return {
        name: "GameInformer",
        content: (SP_JSX.jsx("div", { style: { padding: "12px", color: "#ccc", fontSize: "13px" }, children: "GameInformer adds PCGW and ProtonDB buttons to the Steam game page (desktop, Big Picture and Game Mode) and to the in-game overlay." })),
        icon: SP_JSX.jsx("div", { style: { fontSize: "18px", fontWeight: "bold" }, children: "\u2139" }),
        onDismount() {
            gamePageCleanup();
            desktopCleanup();
            overlayCleanup();
        },
    };
});

export { index as default };
//# sourceMappingURL=index.js.map
