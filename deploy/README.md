# Hosting on a Raspberry Pi

The site is just static files, so the Pi serves them with **nginx**. A
**Cloudflare Tunnel** makes them public at `liamdot.ca` (with HTTPS, and no
router port forwarding). A **timer** pulls from GitHub every 5 minutes, so
`git push` is all it takes to update the site.

```
your Mac --git push--> GitHub <--git pull every 5 min-- Pi (nginx :8080) <--tunnel-- Cloudflare <-- visitors
```

## Files

| File | What it is |
|---|---|
| `setup-pi.sh` | One-time setup. Installs and configures everything below. |
| `nginx-liamdot.conf` | Serves `/var/www/liamdot` on `localhost:8080`, hides `.git` and these files. |
| `liamdot-update.service` | Runs `git pull` in `/var/www/liamdot`. |
| `liamdot-update.timer` | Runs that every 5 minutes. |

## Setup

1. **Flash the Pi.** In Raspberry Pi Imager, choose *Raspberry Pi OS Lite (64-bit)*.
   In the settings (the gear / "Edit settings"), set a hostname like `liamdot-pi`,
   your username and password, your Wi-Fi, and turn on **SSH**.

2. **Run the setup script** from your Mac:
   ```bash
   ssh YOUR-USERNAME@liamdot-pi.local
   ```
   then on the Pi:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/Liamdot/Liamdot.ca/main/deploy/setup-pi.sh | bash
   ```

3. **Put the domain on Cloudflare.** Add `liamdot.ca` at dash.cloudflare.com
   (free plan) and change the nameservers where you bought the domain. This can
   take a few hours to kick in.

4. **Create the tunnel.** Zero Trust → Networks → Tunnels → *Create a tunnel* →
   *Cloudflared*. Run the `sudo cloudflared service install ...` command it
   gives you on the Pi.

5. **Add the public hostname** in the tunnel: `liamdot.ca` → `HTTP` → `localhost:8080`
   (and `www.liamdot.ca` the same way, if you like).

## Checking it works

On the Pi:

```bash
curl -I http://localhost:8080/                  # 200 OK
curl -I http://localhost:8080/.git/config       # 403 Forbidden (hidden)
systemctl list-timers liamdot-update.timer      # when the next update runs
journalctl -u liamdot-update                    # past updates
systemctl status cloudflared                    # tunnel is running
```

From anywhere: open `https://liamdot.ca` (try your phone on mobile data).

## Updating

Just `git push` from your Mac. The Pi picks it up within 5 minutes.
To update right away: `ssh` in and run `sudo systemctl start liamdot-update`.

## If something breaks

- **Site down:** `sudo systemctl status nginx` and `sudo nginx -t`
- **Not updating:** `journalctl -u liamdot-update -n 20`. If you ever edit files
  directly on the Pi, the pull will refuse to overwrite them. Undo with
  `git -C /var/www/liamdot checkout .`
- **liamdot.ca not loading but localhost works:** `sudo systemctl status cloudflared`,
  and check the tunnel shows *Healthy* in the Cloudflare dashboard.
