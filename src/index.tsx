import React from "react";
import { Navigation } from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { initDesktopPatch } from "./DesktopPatch";
import { initOverlayPatch } from "./OverlayPatch";
import { initBpPatch } from "./BPPatch";

// ── Backend callables ────────────────────────────────────────────────────────
const getPcgwUrl = callable<[appId: string], { url?: string; error?: string }>("get_pcgw_url");

// ── Link helpers ─────────────────────────────────────────────────────────────
const PROTONDB_URL = (appId: string) => `https://www.protondb.com/app/${appId}`;

function notify(title: string, body: string): void {
  toaster.toast({ title, body, duration: 4000 });
}

async function openPcgw(appId: string): Promise<void> {
  try {
    const r = await getPcgwUrl(appId);
    if (r?.url) {
      openSteamWeb(r.url);
    } else {
      notify("GameInformer", r?.error || `No PCGW page for app ${appId}`);
    }
  } catch (e) {
    notify("GameInformer", `PCGW lookup failed: ${e}`);
  }
}

function openProtondb(appId: string): void {
  openSteamWeb(PROTONDB_URL(appId));
}

// Opens a URL in Steam's internal browser (same mechanism Steam's own
// quick-links use: SteamUIStore.ActiveWindowInstance.Navigator.SteamWeb).
// PCGW API URLs are resolved to the wiki page first.
function openSteamWeb(url: string): void {
  const pcgwMatch = url.match(/pcgamingwiki\.com\/api\/appid\.php\?appid=(\d+)/);
  if (pcgwMatch) {
    openPcgw(pcgwMatch[1]);
    return;
  }
  const store = (window as any).SteamUIStore;
  const nav = store?.ActiveWindowInstance?.Navigator;
  if (typeof nav?.SteamWeb === "function") {
    nav.SteamWeb(url);
  } else {
    Navigation.NavigateToExternalWeb(url);
  }
}

// ── Plugin Entry ─────────────────────────────────────────────────────────────
export default definePlugin(() => {
  const desktopCleanup = initDesktopPatch(openSteamWeb);
  const overlayCleanup = initOverlayPatch(openSteamWeb);
  const bpCleanup = initBpPatch(openSteamWeb);

  return {
    name: "GameInformer",
    content: (
      <div style={{ padding: "12px", color: "#ccc", fontSize: "13px" }}>
        GameInformer adds PCGW and ProtonDB buttons to the Steam game page
        (desktop, Big Picture and Game Mode) and to the in-game overlay.
      </div>
    ),
    icon: <div style={{ fontSize: "18px", fontWeight: "bold" }}>ℹ</div>,
    onDismount() {
      desktopCleanup();
      overlayCleanup();
      bpCleanup();
    },
  };
});
