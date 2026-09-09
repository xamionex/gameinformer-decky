"""
GameInformer Decky Plugin — main.py

Backend that:
- resolves PCGW wiki URLs from Steam app IDs
- discovers the desktop Steam window tab and the in-game overlay tab via CDP
  so the frontend can inject PCGW/ProtonDB buttons
"""

import os
import sys

# ── Bundle path: third-party packages live in defaults/python ────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_BUNDLE = os.path.join(_HERE, "defaults", "python")
if os.path.isdir(_BUNDLE):
    sys.path.insert(0, _BUNDLE)

import logging

import requests

# ---------------------------------------------------------------------------
# Decky plugin module — available at runtime inside Decky Loader
# ---------------------------------------------------------------------------
try:
    import decky  # type: ignore[import-untyped]
except ImportError:
    decky = None  # graceful fallback for offline dev / linting

logger = logging.getLogger("gameinformer-decky")

PCGW_API = "https://www.pcgamingwiki.com/api/appid.php"
BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
CDP_PORTS = range(8080, 8086)


class Plugin:

    # ---- Lifecycle -------------------------------------------------

    async def _main(self) -> None:
        logger.info("GameInformer plugin loaded (%s mode)", "decky" if decky else "offline")

    async def _unload(self) -> None:
        pass

    # ---- PCGW resolution -------------------------------------------

    async def get_pcgw_url(self, app_id: str) -> dict:
        """Resolve a Steam app ID to its PCGW wiki URL via the appid API."""
        try:
            resp = requests.get(
                PCGW_API,
                params={"appid": app_id},
                headers={"User-Agent": BROWSER_UA},
                timeout=10,
                allow_redirects=True,
                stream=True,
            )
            final_url = resp.url
            status = resp.status_code
            resp.close()
            if status == 200 and final_url and "pcgamingwiki.com/wiki/" in final_url:
                return {"url": final_url}
            if status == 404 or "pcgamingwiki.com/wiki/" not in final_url:
                return {"error": f"No PCGW page for app {app_id}"}
            return {"error": f"PCGW lookup failed (HTTP {status})"}
        except Exception as e:
            return {"error": f"PCGW lookup error: {e}"}

    # ---- CDP tab discovery -----------------------------------------

    async def discover_desktop_tab(self) -> dict | None:
        """Find the desktop Steam main window tab via CDP.

        The window URL is `about:blank?createflags=<N>&minwidth=1010&minheight=600...`
        where the createflags value changes between Steam sessions (18, 274, ...),
        so we match on the stable `minwidth=1010&minheight=600` part plus the
        `about:blank?createflags=` prefix, and prefer the title "Steam" when present.
        """
        candidates = []
        for port in CDP_PORTS:
            try:
                resp = requests.get(f"http://localhost:{port}/json", timeout=3)
                tabs = resp.json()
                for t in tabs:
                    title = t.get("title", "")
                    url = t.get("url", "")
                    if (
                        url.startswith("about:blank?createflags=")
                        and "minwidth=1010" in url
                        and "minheight=600" in url
                    ):
                        candidates.append(
                            {
                                "webSocketDebuggerUrl": t.get("webSocketDebuggerUrl"),
                                "url": url,
                                "title": title,
                            }
                        )
            except Exception:
                continue
        if not candidates:
            return None
        # Prefer the tab titled "Steam" (the actual main window).
        for c in candidates:
            if c["title"] == "Steam":
                c.pop("title", None)
                return c
        c = candidates[0]
        c.pop("title", None)
        return c

    async def discover_bp_tab(self) -> dict | None:
        """Find the Big Picture Mode window tab via CDP.

        The BP window URL is `about:blank?createflags=<N>&minwidth=853&minheight=534...`
        with the title "Steam Big Picture Mode". Match on the stable
        `minwidth=853&minheight=534` part plus the `about:blank?createflags=` prefix.
        """
        for port in CDP_PORTS:
            try:
                resp = requests.get(f"http://localhost:{port}/json", timeout=3)
                tabs = resp.json()
                for t in tabs:
                    url = t.get("url", "")
                    if (
                        url.startswith("about:blank?createflags=")
                        and "minwidth=853" in url
                        and "minheight=534" in url
                    ):
                        return {
                            "webSocketDebuggerUrl": t.get("webSocketDebuggerUrl"),
                            "url": url,
                        }
            except Exception:
                continue
        return None

    async def discover_overlay_tab(self) -> dict | None:
        """Find the in-game overlay window tab via CDP (only present while a game runs).

        The overlay window URL is `about:blank?createflags=4354&pid=<gamepid>...`.
        The title may be the URL itself after a reload, so match on the stable
        `createflags=4354` flag plus the `pid=` game process id.
        """
        for port in CDP_PORTS:
            try:
                resp = requests.get(f"http://localhost:{port}/json", timeout=3)
                tabs = resp.json()
                for t in tabs:
                    title = t.get("title", "").lower()
                    url = t.get("url", "")
                    if (
                        "overlay" in title
                        or "overlay" in url.lower()
                        or "gameoverlayui" in url.lower()
                        or (
                            url.startswith("about:blank?createflags=4354")
                            and "pid=" in url
                        )
                    ):
                        return {
                            "webSocketDebuggerUrl": t.get("webSocketDebuggerUrl"),
                            "url": url,
                        }
            except Exception:
                continue
        return None
