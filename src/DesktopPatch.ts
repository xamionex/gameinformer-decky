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
import { callable } from "@decky/api";

const POLL_MS = 2000;
const TAG = "GAMEINFORMER:";

const discoverDesktopTab = callable<[], { webSocketDebuggerUrl?: string; url?: string } | null>(
  "discover_desktop_tab"
);

const INJECT_SCRIPT = `(function(){
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
  outer.onclick = function(){ console.log('${TAG}' + url); };
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

let socket: WebSocket | null = null;
let pollTimer: any = null;
let msgId = 1;
let openSteamWeb: (url: string) => void = () => {};

export function initDesktopPatch(onOpen: (url: string) => void): () => void {
  openSteamWeb = onOpen;

  const wsSend = (obj: Record<string, unknown>): void => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(obj));
  };

  const connect = (wsUrl: string): void => {
    if (socket) {
      try { socket.close(); } catch {}
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
              openSteamWeb(arg.value.slice(TAG.length));
            }
          }
        }
        if (data.id === 999 && data.result?.result?.value === "missing") {
          wsSend({ id: msgId++, method: "Runtime.evaluate", params: { expression: INJECT_SCRIPT } });
        }
      } catch {}
    };
    socket.onerror = () => { socket = null; };
    socket.onclose = () => { socket = null; };
  };

  const poll = async (): Promise<void> => {
    try {
      const tab = await discoverDesktopTab();
      if (tab?.webSocketDebuggerUrl) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          connect(tab.webSocketDebuggerUrl);
        } else {
          // Page may have reloaded and lost our script; check and re-inject.
          wsSend({ id: 999, method: "Runtime.evaluate", params: { expression: "window.__gameinformerDesktop ? 'ok' : 'missing'" } });
        }
      } else if (socket) {
        try { socket.close(); } catch {}
        socket = null;
      }
    } catch {}
  };

  poll();
  pollTimer = setInterval(poll, POLL_MS);
  return () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (socket) { try { socket.close(); } catch {} socket = null; }
  };
}
