#!/usr/bin/env bash
# One-time setup for hosting the Liamdot site on a Raspberry Pi.
#
# Run it on the Pi as your normal user (not root):
#   curl -fsSL https://raw.githubusercontent.com/Liamdot/Liamdot.ca/main/deploy/setup-pi.sh | bash
#
# It's safe to run again later - it updates everything in place.
#
# What it does:
#   1. installs nginx, git and cloudflared
#   2. downloads the site into /var/www/liamdot
#   3. serves it with nginx on http://localhost:8080
#   4. checks GitHub for updates every 5 minutes
# Then it tells you how to finish the Cloudflare Tunnel (which needs your login).

set -euo pipefail

REPO="https://github.com/Liamdot/Liamdot.ca.git"
SITE_DIR="/var/www/liamdot"
ME="$(id -un)"

if [ "$(id -u)" -eq 0 ]; then
  echo "Please run this as your normal user, not with sudo. It will ask for your password when it needs it."
  exit 1
fi

step() { printf '\n==> %s\n' "$1"; }

step "Installing nginx and git"
sudo apt-get update
sudo apt-get install -y nginx git curl

step "Downloading the site into $SITE_DIR"
if [ -d "$SITE_DIR/.git" ]; then
  git -C "$SITE_DIR" pull --ff-only
else
  sudo mkdir -p "$SITE_DIR"
  sudo chown "$ME:$ME" "$SITE_DIR"
  git clone "$REPO" "$SITE_DIR"
fi

step "Setting up nginx"
sudo cp "$SITE_DIR/deploy/nginx-liamdot.conf" /etc/nginx/sites-available/liamdot
sudo ln -sf /etc/nginx/sites-available/liamdot /etc/nginx/sites-enabled/liamdot
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

step "Setting up automatic updates every 5 minutes"
sed "s/PI_USER/$ME/" "$SITE_DIR/deploy/liamdot-update.service" | sudo tee /etc/systemd/system/liamdot-update.service > /dev/null
sudo cp "$SITE_DIR/deploy/liamdot-update.timer" /etc/systemd/system/liamdot-update.timer
sudo systemctl daemon-reload
sudo systemctl enable --now liamdot-update.timer

step "Installing cloudflared (for the Cloudflare Tunnel)"
if ! command -v cloudflared > /dev/null; then
  sudo mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    | sudo tee /etc/apt/sources.list.d/cloudflared.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y cloudflared
fi

step "Checking the site"
if curl -fsS -o /dev/null http://localhost:8080/; then
  echo "The site is running at http://localhost:8080 on this Pi."
else
  echo "Hmm, http://localhost:8080 didn't answer. Check: sudo systemctl status nginx"
fi

cat <<'EOF'

==> Almost done! Last steps (these need your Cloudflare account):

  1. Add liamdot.ca to Cloudflare (dash.cloudflare.com) and switch your
     domain's nameservers to the ones Cloudflare gives you.

  2. In Cloudflare, open Zero Trust > Networks > Tunnels > Create a tunnel,
     pick "Cloudflared", and name it (e.g. liamdot-pi).

  3. Copy the install command it shows for Debian - it looks like:
       sudo cloudflared service install eyJhIjoi...
     and run it here on the Pi.

  4. In the tunnel's "Public hostname" step, add:
       liamdot.ca      ->  HTTP  localhost:8080
       www.liamdot.ca  ->  HTTP  localhost:8080   (optional)

Then open https://liamdot.ca on your phone (using mobile data) to check.
Any git push to GitHub will show up on the site within about 5 minutes.
EOF
