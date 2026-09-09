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
import { callable } from "@decky/api";

const POLL_MS = 2000;
const TAG = "GAMEINFORMER:";

const discoverOverlayTab = callable<[], { webSocketDebuggerUrl?: string; url?: string } | null>(
  "discover_overlay_tab"
);

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
    b.innerHTML = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAACWCAMAAAAL34HQAAAAllBMVEVHcEz/AGD1AFj0AFj0AFf3AFj0AFj0AFf3AFj0AFr1AFj0AFf0AFf1AFn1AFj1AFj1AFf2AFn1AFf1AFf1AFf1AFj0AFn3AFn1AFf0AFf////////////////////////2AFf////////////////////1AFf////////////////////////////////////1AFf///+Pk9tTAAAAMHRSTlMAEIBg70DA8CAwoL+QUH/g33DQsM+fXz+vj4AQwFDv8G9/YHAwkE+vv9+g4LBPP4/v6BmEAAAI/ElEQVR42u1c6XLjNgwWdR+WZEu27By7m2z37G5b5f1frmOTIEEJJKWE8Uynxq+MJZIfcREAoQTBjW50oxvd6EY3+t8TOx7Ze809HPbjOI5x1RxXjMqHw3a80Gl4B2hPYvILxYdkGZeGasTDnjyDYtr0Z9oO7kFNPB1VeWUY249zihvrGuxAjBn3PnFVI0nb2jxkzilOB3+owtFEVUGPSLbGIfXa1U2Uw8bLOkmSXZ/hVRpiALvDb3SbOgnyZCOGxb7EWPL5WsmZusTaMmMYZlUb5vBz0fKfIj+oGGdWluPfQsWyeLJOg0BpjwqhkX5gRXy23QQsUrgDkgtyJdmUL2JIsWhZF/V8jZlK5KkSpJKUEuBmNoJxFm+8wBqNc9VSkrHw+pF0Cx3FE66Tex+oEr4MedqwXvLmIrDIwqrLPvhDH7a441OZnkqGNUEg/XpmODKZZYsriTM+NT0Gsx/Hg0TV5aa3u8vz0AMsrtil8TlTmg9elzkm8wFr75yp1FHtLK+GdtavoAUnWYRRWZ24b1h2LY2k4md2XxldFVYg47GT/T3ubeIrwUIRnz2eSqzexjMsLQ614romrEmUaDNaDiu7Biywwwz03mKLydVUPpE2WAO/zNbozxIzu48sYuUZgG+xEZc/v2U/L2SqVgdInsa0i8Pq3x3WSdenjcN99d7ORGsEATA2+tvGlf0d1ZzvdF4ASq6kwjos1BnF3uKt2uwBIYHskCrlkA6SMZe/MDAxG/2eOp4LUHvzXB5QWSIbUKyq0Wg/1TdF3FJbL7DauZrmx6E5GOoliqpDMxw1WW68uS0w6hQANScnngm6UwPg/BmiPImD4NhU8TpEis6lTbYk0l1MQk/3r0WkSEyRewAlkztv5COsCYq7rWudNtWodb2/vXtjcSR3YaoNC7Dahez1khxIdWrTMIIKiMWmhKHEdbRJM2qevbtUTTGKqMm2fZhczhnhIjrbBOJwvMQSLAkJbHGzlmU5Ub1WlQWQkFVF4BCSB2BBKMRhDbCcLKnLo4y5RYjEuIVzPCcnXQxsevnQRyLoBDe4WSDCQJ5aEr2oSCVRr03vuHWQEtJ43UVMxvOlvmtneALJh3bynM9pFnV4ja3b7bMTej8rhfbw/YkcXeh76ZwLQlUeQQuvLOKKYoNN4ORgGFbLdidfxlIUPMgWsF6UcDlfowmP2Q753a3VelBFSCupM8QgAXySof31/P3Hj+/Pf+u/CnXaK45rJ0+EgFlyXmWA2WRVIUUmV9L0/eH544ugj88P+Ekn18w1GQKhW4eDG9WsThzB9OAcsL5/lqAuwD6gR4l0Ejva1bGNC5d8oSNsjO+qAmeEE9B/Xib0jB6m4CS20g4nlEhJktcIUq/IiqwwKkjtkQ/8+jKjP9RTIbs4Ma/MZO2V0C9Y0KB7II2Zc/j8QhCSo1hzvh2CI0TtQnijzOTacBSFnMPDRwrWT6X3DPsnU3IBtdfKBNjoP3ZodnQY3r+QdK/ewEU5oxeAc33KlD3pjRDlJLOCjzSsn0h1MnIgzZZJzlvMDWxKJcWsDy8G+kKxy3Zj11PKt7NpJKeE2vO9CRaSomKXbfqcEpfjvulC3ZxZwaMJ1p/oJWCXffqUYOiSdDciFMQI6xG9BOyyxy9U/XIJLBEqx+thxc7T2ABriRCrtwqxsk5PCXGByksPEa9V+fjVKi9+tF0keXAQtoD2RCLvXOJXe9bY9YlG9cs5cEJUGKfMzFzox1eZ/g+fxPRC6sCFE3+06weSXb/QUY2zO1MHBOx5bnMFVIjpHem5J2LXwsAms0UC8jKrMD+jg1cRukKfyNowMCvMp6Jqi4ssK1OtT5DvdKAp2Ka+WlABsyJhU8R1sGqrMpzkygXcTU2mAK/CCGl81vTrE5FitHqqiVmlOtCM7kPhigfySS4NS/PYD/cS2Kd7LSGrpHQYufZT7EaleQG9gZOPvoRjdM/ah/vfj4+/77+Q83VqZ5oUB5TDWw/MoiWB1WgoeLglyT5OKuuJFBkG1TrqLAxXeWS5TlgDR5JaFRSTGCZiXr3sc4f9We/eY61ViqtLI/IWTw/pgLNcDC+KvSkpTnqKs0X3B7gd8dK//K3Qxb8htJ6iSve9QvrFgGtV5+dLu8zySY+RvmvpJHb2WcTp28Kq9LVDuap6SgDbTku6sXVGuAOVEsr3bwR1mSScV6y3J9Eq3y8QY4X0nZG3WFn4qjsDvcIpsVXNMLjFKESYDcMdfa/Gq7Kvonxjv8Axi7GwX/G1mzde+xQb19VSdaHT+T6Y/+m64nszJk6vvts0kJ8WcAiZ3o5H6KqPfgPVCMHqMH01tiw932Lx4T7vqkVOktdh361DlPZhol1k+LnZJ/ph82QX9qkTTxlGiWartsaYtcTPacJFQZSdhhoBXCKuszTGrCazngpp6klcQTTeyGf+dD4xWzW0+Wzx1wVk442+RR9fY9gYD9ewKC2FSIpe2l8HuLWdDzJ5mVvO+sx06k1a5xcWxBLAHHPWvmSyNeRoWewwLkDV2lsW3x+WrF2cceFmT5oibx4iNbktwDWCm5DBjDll8Nfutne5GnmRZL/M8gzL7QEnrdY2O7tqY3q5FNV1YWFc9sZgf7CyJceYLBG09tDTHyyXJQZ6QmE/73zDsh5jEY72G9ub14SlfeZj/xiDG62PfljneTHrqrJ8pOyvHzachi46qU+uS1kTNl86uD5IW06WMPD8VKpViaVp+gp+XGA/y4jZzjlVJ75YoPq8syLLALZPMNdSZ2R8IQUIX98W6rNTqlFy480QYa55CReV1NUn1+hrReILdVSwfjMJzk9dxKCcVYohqxaj2a3DbonHXUyiZKNtHlevJ4Br9CW41lkK9UFPX8eLTapGubyxltRznG+fvsHPoIk+3EOASrjx3ZEFxbHRqtfkl8o7XEKJT0/H4/F4gIjaT186SgfnZLp9yHvjED/1mgvRBfExsyyRGIqIfso1nBhVO8pKu+5GFLDO7z8bSeecci8wB5b6/p8xmhaP/cLqtd6M2/o4DKcMi8R/8+jKaI0xFTtePuxKT26UoMRPOfZGN7rRjW50oxv9t+lfgpfE5pd85SMAAAAASUVORK5CYII=" style="width:26px;height:26px;vertical-align:middle;pointer-events:none;margin-top:-2.5px"/>';
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

let socket: WebSocket | null = null;
let pollTimer: any = null;
let msgId = 1;
let openSteamWeb: (url: string) => void = () => {};

export function initOverlayPatch(onOpen: (url: string) => void): () => void {
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
      const tab = await discoverOverlayTab();
      if (tab?.webSocketDebuggerUrl) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          connect(tab.webSocketDebuggerUrl);
        } else {
          // Page may have reloaded and lost our script; check and re-inject.
          wsSend({ id: 999, method: "Runtime.evaluate", params: { expression: "window.__gameinformerOverlay ? 'ok' : 'missing'" } });
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
