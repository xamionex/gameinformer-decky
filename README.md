# gameinformer

A [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin that adds **PCGW** (PCGamingWiki) and **ProtonDB** buttons to the Steam game page and the in-game overlay, so you can jump straight to the wiki page or compatibility report for the game you are looking at.

## Features

- **PCGW button**: opens the game's [PCGamingWiki](https://www.pcgamingwiki.com) page (resolved from the App ID via the PCGW API)
- **ProtonDB button**: opens the game's [ProtonDB](https://www.protondb.com) report
- Works on the **game page** in:
  - Desktop Steam
  - Big Picture / Game Mode
- Works in the **in-game overlay** (Shift+Tab): buttons appear next to the Game Overview button
- Buttons follow the currently viewed game automatically
- Links open in **Steam's internal browser** (same mechanism Steam's own quick-links use), not the system browser
- Buttons are styled to match Steam's native buttons (cloned from Steam's own classes, so hover, high-contrast mode and font sizes match)

## Requirements

- Linux with [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) installed
- Steam in desktop or gamepad (Big Picture) mode

## Installation

### Automatic

```bash
curl -fsSL https://raw.githubusercontent.com/xamionex/gameinformer-decky/refs/heads/main/install.sh | sh
```

The installer downloads the latest `main` branch, builds the frontend if `dist/` is not shipped, and copies the plugin into `~/homebrew/plugins/gameinformer-decky`. It does not restart Steam or the plugin loader.

### Manual

1. Download the plugin zip (or clone this repository)
2. Extract it so you have a `gameinformer-decky` folder containing `main.py`, `dist/`, `plugin.json`, `package.json`, and `defaults/`
3. Place the folder in the Decky plugins directory: `~/homebrew/plugins/gameinformer-decky`
4. Restart Steam (or Decky Loader) so the plugin is picked up
5. Open the Decky menu (QAM) and verify "GameInformer" appears

## Building from source

Requires Node.js 18+ and npm.

```bash
git clone https://github.com/xamionex/gameinformer-decky
cd gameinformer-decky
./devinstall.sh
```

This also installs it to your `~/homebrew/plugins` dir

## How it works

- **Big Picture / Game Mode game page**: patched directly with `routerHook.addPatch` on `/library/app/:appid` (the same context Decky runs in, so it is always there)
- **Desktop game page**: the desktop UI renders in a separate Steam window where Decky is not injected, so the plugin connects via CDP (Chrome DevTools Protocol) and installs a persistent MutationObserver that adds the buttons next to the Support link
- **In-game overlay**: the overlay is another separate window, reached the same way via CDP; buttons are inserted after the Game Overview button
- **Opening links**: buttons log a tagged message that the plugin catches over the CDP WebSocket and opens via `SteamUIStore.ActiveWindowInstance.Navigator.SteamWeb`, which is the same call Steam's own quick-links use to open pages in the internal browser

## License

MIT
