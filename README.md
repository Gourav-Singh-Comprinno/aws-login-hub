<p align="center">
  <img src="https://img.shields.io/badge/version-1.7.1-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" />
  <img src="https://img.shields.io/badge/encryption-AES--256--GCM-green?style=flat-square" />
  <img src="https://img.shields.io/github/downloads/Gourav-Singh-Comprinno/aws-login-hub/total?style=flat-square&label=downloads" />
</p>

<h1 align="center">AWS Login Hub</h1>

<p align="center">
  One-click login for multiple AWS Identity Center accounts.<br>
  Encrypted vault. Auto-fill credentials. Uses your Chrome.
</p>

<p align="center">
  <a href="https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest"><strong>Download for Windows, macOS & Linux</strong></a>
</p>

---

## How It Works

1. Add your AWS SSO client (name, URL, email, password)
2. Click **Login** → Chrome opens → email & password auto-filled
3. Complete MFA → you're in the AWS Console

That's it. Your credentials are stored in an AES-256-GCM encrypted vault on your machine. Nothing leaves your computer.

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

1. Download `AWS.Login.Hub_x64-setup.exe`
2. Double-click to install
3. Find "AWS Login Hub" in your Start Menu

### macOS (Apple Silicon — M1/M2/M3/M4/M5)

1. Download `AWS.Login.Hub_aarch64.dmg`
2. Open the `.dmg`, drag to Applications
3. First launch: System Settings → Privacy & Security → "Open Anyway"
4. Or run: `xattr -cr /Applications/AWS\ Login\ Hub.app`

### Linux (Ubuntu / Debian)

```bash
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest/download/AWS.Login.Hub_1.7.1_amd64.deb
sudo dpkg -i AWS.Login.Hub_1.7.1_amd64.deb
```

### Linux (Fedora / RHEL)

```bash
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest/download/AWS.Login.Hub-1.7.1-1.x86_64.rpm
sudo rpm -i AWS.Login.Hub-1.7.1-1.x86_64.rpm
```

### Linux (AppImage — Any Distro)

```bash
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest/download/AWS.Login.Hub_1.7.1_amd64.AppImage
chmod +x AWS.Login.Hub_1.7.1_amd64.AppImage
./AWS.Login.Hub_1.7.1_amd64.AppImage
```

---

## Setup After Install

Install Playwright (required for auto-fill):

```bash
npm install -g playwright
npx playwright install chromium
```

**macOS users:** If login says "Node.js not found", run:
```bash
sudo ln -sf $(which node) /usr/local/bin/node
```

---

## Features

### One-Click Login
- Click Login → your Chrome opens → email & password auto-filled
- You only complete MFA manually
- App stays usable while browser is open (non-blocking)
- Falls back to Edge if Chrome not found

### Encrypted Vault
- AES-256-GCM encryption with Argon2id key derivation
- Passwords never stored in plaintext
- Vault auto-locks after 15 minutes of inactivity
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
- Windows, macOS (Apple Silicon), Linux
- Uses your machine's installed Chrome (not a bundled browser)
- All data stored locally — zero network calls

---

## Security

| Property | Implementation |
|----------|---------------|
| Encryption | AES-256-GCM (authenticated encryption) |
| Key derivation | Argon2id (memory-hard, resistant to GPU attacks) |
| Master password | Never stored. Only used to derive the encryption key. |
| Memory | Keys zeroed from RAM on vault lock (zeroize crate) |
| Credentials | Passed via environment variables, never written to disk |
| Network | Zero network calls. All data is local. |
| CSP | Content Security Policy enabled |
| MFA | Never bypassed or automated |

---

## Data Storage

```
~/.aws-login-hub/
├── users.json              User profiles (metadata)
├── <user>.vault.enc        Encrypted credentials (AES-256-GCM)
├── <user>.db               Client metadata (SQLite)
└── <user>.last_auth        Password expiration timestamp
```

---

## Build from Source

### Prerequisites
- Node.js 18+
- Rust 1.77+
- Playwright (`npm install -g playwright`)

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
| Database | SQLite (per-user) |
| Login Automation | Playwright (uses your installed Chrome) |
| Platforms | Windows, macOS (Apple Silicon), Linux |

---

## License

MIT

---

<p align="center">
  <sub>Built for DevOps engineers who manage multiple AWS accounts.</sub>
</p>
