#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="gameinformer-decky"
DEST="$HOME/homebrew/plugins/$PLUGIN_NAME"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "==> GameInformer installer"
echo "    Source: $SRC"
echo "    Target: $DEST"

# --- Decky Loader check -----------------------------------------------------
decky_found=0
if [ -d "$HOME/homebrew/plugins" ] || systemctl list-unit-files 2>/dev/null | grep -q '^plugin_loader'; then
    decky_found=1
fi

if [ "$decky_found" -eq 0 ]; then
    echo "Decky Loader was not detected on this system."
    read -r -p "Install Decky Loader now? [y/N] " answer
    case "$answer" in
        [yY]*)
            echo "==> Installing Decky Loader..."
            curl -L https://github.com/SteamDeckHomebrew/decky-installer/releases/latest/download/install_release.sh | sh
            ;;
        *)
            echo "Aborting: Decky Loader is required for $PLUGIN_NAME."
            exit 1
            ;;
    esac
fi

# --- Build frontend if dist/ is missing --------------------------------------
if [ ! -d "$SRC/dist" ]; then
    echo "==> Building frontend"
    (cd "$SRC" && npm ci && npm run build)
fi

# --- Copy plugin ------------------------------------------------------------
echo "==> Copying plugin to $DEST"
mkdir -p "$HOME/homebrew"
sudo mkdir -p "$HOME/homebrew/plugins"
sudo rm -rf "$DEST"
sudo mkdir -p "$DEST"
sudo cp -r "$SRC"/main.py "$SRC"/dist "$SRC"/plugin.json "$SRC"/package.json "$DEST"/

echo "==> Done. $PLUGIN_NAME installed at $DEST"
