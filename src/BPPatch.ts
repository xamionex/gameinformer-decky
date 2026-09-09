/**
 * BPPatch.ts — Injects PCGW/ProtonDB icon buttons into the Big Picture Mode
 * game page. The BP UI renders in the "Steam Big Picture Mode" window tab,
 * where Decky is not injected. We connect to that tab via CDP (same pattern
 * as DesktopPatch) and install a persistent MutationObserver script once, so
 * the buttons appear whenever the action row renders.
 *
 * The buttons are inserted into the action row cluster, left of the
 * "Configure Controller" and "Manage" (cogwheel) buttons, styled like the
 * native BP icon buttons (48x48, black bg, white border, centered icon).
 *
 * Button clicks log `GAMEINFORMERBP:<url>` via console.log; the CDP WebSocket
 * catches it and opens the URL in Steam's internal browser.
 */
import { callable } from "@decky/api";

const POLL_MS = 2000;
const TAG = "GAMEINFORMERBP:";

const discoverBpTab = callable<[], { webSocketDebuggerUrl?: string; url?: string } | null>(
  "discover_bp_tab"
);

const PCGW_ICON_SVG =
  '<svg viewBox="0 0 256 256" style="width:24px;height:24px;display:block">' +
  '<path fill="currentColor" d="M128 32c-35.3 0-64 28.7-64 64v96c0 17.7 14.3 32 32 32h64c17.7 0 32-14.3 32-32V96c0-35.3-28.7-64-64-64zm0 32c17.7 0 32 14.3 32 32v16H96V96c0-17.7 14.3-32 32-32zm-32 80h64v48H96v-48z"/>' +
  "</svg>";

const PDB_ICON_IMG =
  '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAACWCAMAAAAL34HQAAAAllBMVEVHcEz/AGD1AFj0AFj0AFf3AFj0AFj0AFf3AFj0AFr1AFj0AFf0AFf1AFn1AFj1AFj1AFf2AFn1AFf1AFf1AFf1AFj0AFn3AFn1AFf0AFf////////////////////////2AFf////////////////////1AFf////////////////////////////////////1AFf///+Pk9tTAAAAMHRSTlMAEIBg70DA8CAwoL+QUH/g33DQsM+fXz+vj4AQwFDv8G9/YHAwkE+vv9+g4LBPP4/v6BmEAAAI/ElEQVR42u1c6XLjNgwWdR+WZEu27By7m2z37G5b5f1frmOTIEEJJKWE8Uynxq+MJZIfcREAoQTBjW50oxvd6EY3+t8TOx7Ze809HPbjOI5x1RxXjMqHw3a80Gl4B2hPYvILxYdkGZeGasTDnjyDYtr0Z9oO7kFNPB1VeWUY249zihvrGuxAjBn3PnFVI0nb2jxkzilOB3+owtFEVUGPSLbGIfXa1U2Uw8bLOkmSXZ/hVRpiALvDb3SbOgnyZCOGxb7EWPL5WsmZusTaMmMYZlUb5vBz0fKfIj+oGGdWluPfQsWyeLJOg0BpjwqhkX5gRXy23QQsUrgDkgtyJdmUL2JIsWhZF/V8jZlK5KkSpJKUEuBmNoJxFm+8wBqNc9VSkrHw+pF0Cx3FE66Tex+oEr4MedqwXvLmIrDIwqrLPvhDH7a441OZnkqGNUEg/XpmODKZZYsriTM+NT0Gsx/Hg0TV5aa3u8vz0AMsrtil8TlTmg9elzkm8wFr75yp1FHtLK+GdtavoAUnWYRRWZ24b1h2LY2k4md2XxldFVYg47GT/T3ubeIrwUIRnz2eSqzexjMsLQ614romrEmUaDNaDiu7Biywwwz03mKLydVUPpE2WAO/zNbozxIzu48sYuUZgG+xEZc/v2U/L2SqVgdInsa0i8Pq3x3WSdenjcN99d7ORGsEATA2+tvGlf0d1ZzvdF4ASq6kwjos1BnF3uKt2uwBIYHskCrlkA6SMZe/MDAxG/2eOp4LUHvzXB5QWSIbUKyq0Wg/1TdF3FJbL7DauZrmx6E5GOoliqpDMxw1WW68uS0w6hQANScnngm6UwPg/BmiPImD4NhU8TpEis6lTbYk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" style="width:26px;height:26px;display:block"/>';

const INJECT_SCRIPT = `(function(){
if (window.__gameinformerBp) return;
window.__gameinformerBp = true;
var PCGW = 'https://www.pcgamingwiki.com/api/appid.php?appid=';
var PDB = 'https://www.protondb.com/app/';
// Match the native BP icon-button focus style: white bg, dark icon.
var style = document.createElement('style');
style.textContent = '[data-gameinformer]:hover, [data-gameinformer]:focus { background-color: rgb(255, 255, 255) !important; color: rgb(14, 20, 27) !important; }';
document.head.appendChild(style);
function appId(){
  // The BP window URL is about:blank, so resolve the app id from the React
  // fiber chain of the controller button (same pattern as DesktopPatch).
  var ctrl = document.querySelector('[aria-label="Configure Controller"]');
  if (!ctrl) return '';
  var key = Object.keys(ctrl).find(function(k){ return k.indexOf('__reactFiber') === 0 || k.indexOf('__reactInternalInstance') === 0; });
  var f = key ? ctrl[key] : null;
  var depth = 0;
  while (f && depth < 20) {
    var p = f.memoizedProps;
    if (p) {
      if (p.appid !== undefined && p.appid !== null) return String(p.appid);
      if (p.overview && p.overview.appid !== undefined && p.overview.appid !== null) return String(p.overview.appid);
    }
    f = f.return;
    depth++;
  }
  return '';
}
function makeBtn(label, url, iconHtml){
  var b = document.createElement('div');
  b.setAttribute('data-gameinformer', label === 'PCGW' ? 'pcgw' : 'pdb');
  b.setAttribute('role', 'button');
  b.setAttribute('tabindex', '0');
  b.style.cssText = 'width:48px;height:48px;border-radius:2px;background:#000;border:1px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;margin-left:10px;';
  b.innerHTML = iconHtml;
  b.onclick = function(){ console.log('${TAG}' + url); };
  return b;
}
function findCluster(){
  var ctrl = document.querySelector('[aria-label="Configure Controller"]');
  if (!ctrl) return null;
  var cluster = ctrl.parentElement ? ctrl.parentElement.parentElement : null;
  if (!cluster) return null;
  // Sanity: the cluster must also contain the Manage (cogwheel) button.
  if (!cluster.querySelector('[aria-label="Manage"]')) return null;
  return cluster;
}
function addButtons(){
  var cluster = findCluster();
  if (!cluster) return;
  if (cluster.querySelector('[data-gameinformer]')) return;
  var id = appId();
  if (!id) return;
  var pcgw = makeBtn('PCGW', PCGW + id, '${PCGW_ICON_SVG}');
  var pdb = makeBtn('ProtonDB', PDB + id, '${PDB_ICON_IMG}');
  cluster.insertBefore(pdb, cluster.firstChild);
  cluster.insertBefore(pcgw, cluster.firstChild);
}
addButtons();
new MutationObserver(function(){
  addButtons();
}).observe(document.body, {subtree: true, childList: true});
})();`;

let socket: WebSocket | null = null;
let pollTimer: any = null;
let msgId = 1;
let openSteamWeb: (url: string) => void = () => {};

export function initBpPatch(onOpen: (url: string) => void): () => void {
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
      const tab = await discoverBpTab();
      if (tab?.webSocketDebuggerUrl) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          connect(tab.webSocketDebuggerUrl);
        } else {
          wsSend({ id: 999, method: "Runtime.evaluate", params: { expression: "window.__gameinformerBp ? 'ok' : 'missing'" } });
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
