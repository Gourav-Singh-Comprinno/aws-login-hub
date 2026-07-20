<p align="center">
  <img src="https://img.shields.io/badge/version-1.8.0-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" />
  <img src="https://img.shields.io/badge/encryption-AES--256--GCM-green?style=flat-square" />
  <img src="https://img.shields.io/badge/login-SSO%20OIDC%20%2B%20Auto--fill-orange?style=flat-square" />
</p>

<h1 align="center">AWS Login Hub</h1>

<p align="center">
  One-click SSO login for multiple AWS Identity Center accounts.<br>
  Encrypted vault • Auto-fill credentials • MFA-only browser interaction.
</p>

<p align="center">
  <a href="https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest"><strong>Download for Windows, macOS & Linux</strong></a>
</p>

---

## How It Works

1. Add your AWS SSO client (name, URL, email, password, region)
2. Click **Login** → app calls AWS SSO OIDC API → browser opens with credentials auto-filled
3. Complete MFA → browser closes automatically → you're in the AWS Console

Your credentials are stored in an AES-256-GCM encrypted vault on your machine. Nothing leaves your computer except calls to official AWS endpoints.

---

## Login Flow (Hybrid SSO OIDC + Auto-fill)

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  AWS Login Hub  │     │  AWS SSO OIDC API    │     │   Browser    │
└────────┬────────┘     └──────────┬──────────┘     └──────┬───────┘
         │                         │                        │
         │ 1. RegisterClient       │                        │
         │────────────────────────>│                        │
         │                         │                        │
         │ 2. StartDeviceAuth      │                        │
         │────────────────────────>│                        │
         │   (verification URL)    │                        │
         │<────────────────────────│                        │
         │                         │                        │
         │ 3. Open browser + auto-fill email/password       │
         │─────────────────────────────────────────────────>│
         │                         │                        │
         │                         │    4. User enters MFA  │
         │                         │                        │
         │ 5. Poll CreateToken     │                        │
         │────────────────────────>│                        │
         │   accessToken ✓         │                        │
         │<────────────────────────│                        │
         │                         │                        │
         │ 6. Cache token + open SSO portal                 │
         │─────────────────────────────────────────────────>│
```

**What the user sees:** Browser opens → credentials fill automatically → MFA prompt appears → enter code → portal opens with all accounts.

---

## Screenshots

<p align="center">
  <img src="screenshots/01-unlock-screen.png" width="800" />
  <br><em>Vault Unlock — AES-256-GCM encrypted with Argon2id key derivation</em>
</p>

<p align="center">
  <img src="screenshots/04-clients.png" width="800" />
  <br><em>Client Management — One-click login with auto-fill</em>
</p>

---

## Download & Install

Go to the [Releases page](https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest) and download for your OS.

### Windows

1. Download `AWS.Login.Hub_x64-setup.exe` or `.msi`
2. Double-click to install
3. Find "AWS Login Hub" in your Start Menu

### macOS (Apple Silicon — M1/M2/M3/M4/M5)

1. Download `AWS.Login.Hub_aarch64.dmg`
2. Open the `.dmg`, drag to Applications
3. First launch: System Settings → Privacy & Security → "Open Anyway"
4. Or run: `xattr -cr /Applications/AWS\ Login\ Hub.app`

### macOS (Intel)

1. Download `AWS.Login.Hub_x64.dmg`
2. Same steps as above

### Linux (Ubuntu / Debian)

```bash
sudo dpkg -i aws-login-hub_*_amd64.deb
```

### Linux (Fedora / RHEL)

```bash
sudo rpm -i aws-login-hub-*.x86_64.rpm
```

### Linux (AppImage — Any Distro)

```bash
chmod +x aws-login-hub_*.AppImage
./aws-login-hub_*.AppImage
```

---

## Setup After Install

**No manual setup required.** The app automatically installs Playwright and Chromium on first launch.

**macOS users:** If login says "Node.js not found", ensure Node.js is installed and run:
```bash
sudo ln -sf $(which node) /usr/local/bin/node
```

**Prerequisites:** Node.js 18+ must be installed on your system ([download here](https://nodejs.org)).

---

## Features

### Hybrid SSO Login (OIDC API + Auto-fill)
- Calls AWS SSO OIDC API to initiate device authorization
- Playwright auto-fills email & password from your encrypted vault
- Browser only becomes visible at the MFA/OTP step
- Browser auto-closes after MFA is completed
- SSO token cached at `~/.aws/sso/cache/` (works with AWS CLI)
- SSO Access Portal opens automatically after login

### Encrypted Vault
- AES-256-GCM encryption with Argon2id key derivation
- Passwords never stored in plaintext
- Configurable auto-lock timeout (1, 2, 8, or 10 hours)
- Master password never stored — only used to derive encryption key

### Multi-User Isolation
- Each user on the same machine has their own encrypted vault
- Separate database per user
- User A cannot see User B's data

### Auto-Update
- App checks for updates on startup
- Notification banner when new version available
- One-click update + relaunch

### Cross-Platform
- Windows (x64), macOS (Apple Silicon + Intel), Linux (deb/rpm/AppImage)
- All data stored locally — only network calls go to AWS SSO OIDC endpoints
- Uses Playwright Chromium for auto-fill (cross-platform)

---

## Security

| Property | Implementation |
|----------|---------------|
| Encryption | AES-256-GCM (authenticated encryption) |
| Key derivation | Argon2id (memory-hard, resistant to GPU attacks) |
| Master password | Never stored. Only used to derive the encryption key. |
| Memory | Keys zeroed from RAM on vault lock (zeroize crate) |
| Credentials | Passed via environment variables to Playwright, never written to disk |
| Network calls | Only to `oidc.{region}.amazonaws.com` — official AWS endpoints |
| Token cache | Stored with `0600` file permissions (owner-only read/write) |
| CSP | Content Security Policy enabled in Tauri |
| MFA | Never bypassed or automated — user enters manually |
| Auto-lock | Vault locks after configurable idle timeout |

---

## Data Storage

```
~/.aws-login-hub/
├── users.json              User profiles (metadata)
├── <user>.vault.enc        Encrypted credentials (AES-256-GCM)
├── <user>.db               Client metadata (SQLite)
└── <user>.last_auth        Password expiration timestamp

~/.aws/sso/cache/
└── <hash>.json             Cached SSO tokens (auto-generated after login)
```

---

## Configuration

### Add a Client

Only 5 fields required:

| Field | Description |
|-------|-------------|
| Client Name | Friendly name (e.g., "Production") |
| Identity Center URL | Your SSO start URL (e.g., `https://d-xxxxxxxxxx.awsapps.com/start`) |
| Email | Identity Center email address |
| Password | Identity Center password (stored encrypted in vault) |
| SSO Region | AWS region of your Identity Center (dropdown with all regions) |

### Vault Timeout

Configurable in Settings → Security → Auto-Lock Timeout:
- 1 hour
- 2 hours (default)
- 8 hours
- 10 hours

---

## Build from Source

### Prerequisites
- Node.js 18+
- Rust 1.77+
- Playwright (`npm install -g playwright && npx playwright install chromium`)

### Linux
```bash
sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev libssl-dev libsoup-3.0-dev build-essential
git clone https://github.com/Gourav-Singh-Comprinno/aws-login-hub.git
cd aws-login-hub
npm install
npm run tauri build
```

### Windows
```powershell
git clone https://github.com/Gourav-Singh-Comprinno/aws-login-hub.git
cd aws-login-hub
npm install
npm run tauri build
```

### macOS
```bash
xcode-select --install
git clone https://github.com/Gourav-Singh-Comprinno/aws-login-hub.git
cd aws-login-hub
npm install
npm run tauri build
```

---

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/build.yml`) builds for all platforms on tag push:

| Platform | Target | Output |
|----------|--------|--------|
| Ubuntu 22.04 | `x86_64-unknown-linux-gnu` | `.deb`, `.rpm`, `.AppImage` |
| Windows Latest | `x86_64-pc-windows-msvc` | `.msi`, `.exe` |
| macOS Latest | `aarch64-apple-darwin` | `.dmg` (Apple Silicon) |
| macOS 13 | `x86_64-apple-darwin` | `.dmg` (Intel) |

### Trigger a release:
```bash
git tag v1.7.1
git push origin v1.7.1
```

The pipeline runs: `npm install` → `tsc --noEmit` → `cargo test` → `cargo clippy` → `tauri build` → GitHub Release with all artifacts.

---

## Tests

```bash
cd src-tauri
cargo test
```

20 tests covering vault encryption, user isolation, credential CRUD, password change, export/import, and search.

---

## Uninstall

**Windows:** Settings → Apps → AWS Login Hub → Uninstall

**macOS:** Drag from Applications to Trash

**Ubuntu/Debian:** `sudo apt remove aws-login-hub`

**Fedora/RHEL:** `sudo rpm -e aws-login-hub`

**Remove all data:** `rm -rf ~/.aws-login-hub`

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Tauri 2 (Rust backend + Web frontend) |
| Frontend | React 19, TypeScript, Tailwind CSS 4, Framer Motion |
| Encryption | aes-gcm, argon2, zeroize (Rust crates) |
| SSO Auth | AWS SSO OIDC API (reqwest + tokio) |
| Database | SQLite (per-user) |
| Auto-fill | Playwright (types credentials into browser) |
| Platforms | Windows, macOS (ARM + Intel), Linux |

---

## License

MIT

---

<p align="center">
  <sub>Built for DevOps engineers who manage multiple AWS accounts.</sub>
</p>
