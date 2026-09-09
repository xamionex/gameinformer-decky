import React from "react";
import {
  afterPatch,
  findInReactTree,
  createReactTreePatcher,
  appDetailsClasses,
  basicAppDetailsSectionStylerClasses,
  Focusable,
  Navigation,
} from "@decky/ui";
import { callable, definePlugin, routerHook, toaster } from "@decky/api";
import { initDesktopPatch } from "./DesktopPatch";
import { initOverlayPatch } from "./OverlayPatch";

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

// ── Game page buttons (Big Picture / Game Mode) ──────────────────────────────
const ROUTE = "/library/app/:appid";
const KEY = "gameinformer-buttons";

function GameInformerButtons({ appId }: { appId: string }): React.ReactElement {
  return (
    <Focusable
      key={KEY}
      flow-children="horizontal"
      style={{ display: "flex", flexDirection: "row", gap: "8px", alignItems: "center", marginLeft: "12px" }}
    >
      <Focusable
        focusClassName="gameinformer-btn-focus"
        onActivate={() => openPcgw(appId)}
        style={{
          padding: "6px 14px",
          borderRadius: "6px",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff",
          fontSize: "13px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        PCGW
      </Focusable>
      <Focusable
        focusClassName="gameinformer-btn-focus"
        onActivate={() => openProtondb(appId)}
        style={{
          padding: "6px 14px",
          borderRadius: "6px",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff",
          fontSize: "13px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        ProtonDB
      </Focusable>
    </Focusable>
  );
}

function initGamePagePatch(): () => void {
  const patch = routerHook.addPatch(ROUTE, (tree: any) => {
    const routeProps = findInReactTree(tree, (x: any) => !!x?.renderFunc);
    if (!routeProps) return tree;

    const patchHandler = createReactTreePatcher(
      [
        (t: any) => {
          const found = findInReactTree(
            t,
            (x: any) => x?.props?.children?.props?.overview
          )?.props?.children;
          return found || null;
        },
      ],
      (_args: any[], ret?: any) => {
        try {
          const container = findInReactTree(
            ret,
            (x: any) =>
              Array.isArray(x?.props?.children) &&
              x?.props?.className?.includes?.(appDetailsClasses?.InnerContainer)
          );
          if (!container?.props?.children) return ret;

          const overviewNode = findInReactTree(
            ret,
            (x: any) => x?.props?.overview?.appid != null
          );
          const appId = overviewNode?.props?.overview?.appid?.toString();
          if (!appId) return ret;

          const children = container.props.children as any[];
          if (children.some((c: any) => c?.key === KEY)) return ret;

          // Find the direct child of the container whose subtree holds the
          // quick-links row (GameInfoQuickLinks), so we can insert after it.
          const hasQuickLinks = (node: any): boolean => {
            if (!node || typeof node !== "object") return false;
            if (
              typeof node?.props?.className === "string" &&
              node.props.className.includes(
                basicAppDetailsSectionStylerClasses?.GameInfoQuickLinks ?? ""
              )
            ) {
              return true;
            }
            const kids = node?.props?.children;
            if (Array.isArray(kids)) return kids.some(hasQuickLinks);
            return hasQuickLinks(kids);
          };
          let insertAt = 1;
          const qlIdx = children.findIndex(hasQuickLinks);
          if (qlIdx > -1) insertAt = qlIdx + 1;
          children.splice(insertAt, 0, <GameInformerButtons appId={appId} />);
        } catch (e) {
          console.log("[GameInformer] patch error:", e);
        }
        return ret;
      }
    );

    afterPatch(routeProps, "renderFunc", patchHandler);
    return tree;
  });

  return () => {
    routerHook.removePatch(ROUTE, patch);
  };
}

// ── Plugin Entry ─────────────────────────────────────────────────────────────
export default definePlugin(() => {
  const gamePageCleanup = initGamePagePatch();
  const desktopCleanup = initDesktopPatch(openSteamWeb);
  const overlayCleanup = initOverlayPatch(openSteamWeb);

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
      gamePageCleanup();
      desktopCleanup();
      overlayCleanup();
    },
  };
});
