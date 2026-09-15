# Anywhere access

## Immediate: private GitHub Codespace

Open <https://codespaces.new/aarongwood/aaron-race-dashboard?quickstart=1>.

GitHub creates a private development environment, starts the Race Desk, and forwards port `4173`. Keep that port **private**. Changes live in the repository checkout; the existing Publish button commits and pushes the scoped race files after `PUBLISH` confirmation.

## Always-on: Arjuna + Cloudflare Access

The safer always-on topology is:

`GitHub-authenticated browser → Cloudflare Access → cloudflared tunnel → 127.0.0.1:4173 on Arjuna`

The Node service deliberately binds to loopback. Do not expose port `4173` directly to the internet.

1. Clone the repository to `/home/aaron/src/aaron-race-dashboard` and run `npm test`.
2. Copy `deploy/systemd/aaron-race-desk.service` to `/etc/systemd/system/`.
3. Run `sudo systemctl daemon-reload && sudo systemctl enable --now aaron-race-desk`.
4. Confirm `curl http://127.0.0.1:4173/api/health` returns an OK response.
5. Install `cloudflared`, create a named tunnel, and copy `deploy/cloudflared/config.example.yml` to `~/.cloudflared/config.yml` with the actual tunnel ID and hostname.
6. In Cloudflare Zero Trust, create an Access application for that hostname and allow only Aaron's identity.
7. Start and enable the `cloudflared` service only after Access protection is verified.

Cloudflare account activation, DNS ownership and identity-policy choices are intentionally not automated by this repository.
