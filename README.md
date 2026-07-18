<div align="center">

# AWS Login Hub

**Secure desktop application for managing multiple AWS Identity Center logins.**

Built with Tauri, React, Rust, and AES-256-GCM encryption.

[Download](#installation) · [Documentation](#how-it-works) · [Build from Source](#build-from-source)

---

</div>

## Overview

AWS Login Hub is a cross-platform desktop application that helps DevOps engineers manage multiple AWS Identity Center (SSO) client logins. It securely stores credentials in a locally encrypted vault and automates repetitive browser-based login steps using Playwright.

The app never bypasses MFA — it automates email and password entry, then pauses for manual MFA completion.

---

## Screenshots

<p align="center">
  <img src="screenshots/01-unlock-screen.png" width="800" alt="Vault Unlock Screen" />
  <br><em>Vault Unlock Screen</em>
</p>

<p align="center">
  <img src="screenshots/03-dashboard.png" width="800" alt="Dashboard" />
  <br><em>Dashboard</em>
</p>

<p align="center">
  <img src="screenshots/04-clients.png" width="800" alt="Client Management" />
  <br><em>Client Management</em>
</p>

<p align="center">
  <img src="screenshots/06-settings.png" width="800" alt="Settings and Security" />
  <br><em>Settings and Security</em>
</p>

---

## Features

- **Encrypted Vault** — AES-256-GCM encryption with Argon2id key derivation. Passwords never stored in plaintext.
- **Multi-User Isolation** — Each user has a separate encrypted vault. User A cannot access User B's data.
- **Browser Automation** — Playwright-based auto-login with email/password fill and MFA pause.
- **Export/Import** — Transfer encrypted vault between machines via backup files.
- **Favorites and Search** — Pin frequently-used clients, search by name/email/tags/environment.
- **Auto-Lock** — Vault locks after 15 minutes of inactivity. Keys zeroed from memory.
- **Cross-Platform** — Linux, Windows, and macOS.

---

## Installation

### Ubuntu / Debian

```bash
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/download/v0.2.0/aws-login-hub_0.2.0_amd64.deb
sudo dpkg -i aws-login-hub_0.2.0_amd64.deb
```

The app appears in your application menu. Run it anytime with:

```bash
aws-login-hub
```

### Fedora / RHEL / CentOS

```bash
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/download/v0.2.0/aws-login-hub-0.2.0-1.x86_64.rpm
sudo rpm -i aws-login-hub-0.2.0-1.x86_64.rpm
aws-login-hub
```

### Any Linux (Portable, No Install)

```bash
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/download/v0.2.0/aws-login-hub_0.2.0_amd64.AppImage
chmod +x aws-login-hub_0.2.0_amd64.AppImage
./aws-login-hub_0.2.0_amd64.AppImage
```

### Windows 10/11

Build from source:

1. Install [Node.js LTS](https://nodejs.org) and [Rust](https://rustup.rs)
2. Open PowerShell:

```powershell
git clone https://github.com/Gourav-Singh-Comprinno/aws-login-hub.git
cd aws-login-hub
npm install
npm run tauri build
```

3. The installer is at `src-tauri\target\release\bundle\msi\AWS Login Hub_0.2.0_x64.msi`
4. Double-click to install. Find the app in your Start Menu.

### macOS

Build from source:

1. Install prerequisites:

```bash
xcode-select --install
brew install node
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. Build:

```bash
git clone https://github.com/Gourav-Singh-Comprinno/aws-login-hub.git
cd aws-login-hub
npm install
npm run tauri build
```

3. The installer is at `src-tauri/target/release/bundle/dmg/AWS Login Hub_0.2.0_x64.dmg`
4. Open the `.dmg` and drag to Applications. Launch from Spotlight or Launchpad.

### Setup Playwright (Required for Login Automation)

After installing the app, install Playwright separately:

```bash
npm install -g playwright
npx playwright install chromium
```

Without this, credential storage works but the Login button cannot automate the browser.

---

## How It Works

### First Launch

1. Open the app
2. Create a profile with a master password
3. An encrypted vault is created at `~/.aws-login-hub/`

### Adding a Client

Provide the following:
- Client name (e.g., "Netflix Production")
- Identity Center URL (e.g., `https://d-xxxxxxxxxx.awsapps.com/start`)
- Email address
- Password (encrypted and stored in vault)
- Environment and tags (optional, for organization)

### Login Automation

When you click Login on a client:

1. Password is decrypted from the vault (in-memory only)
2. Chromium launches via Playwright
3. Navigates to the Identity Center URL
4. Fills email, clicks Next
5. Fills password, clicks Submit
6. Pauses at MFA screen — you complete MFA manually
7. AWS Console opens
8. Last Login timestamp is updated

MFA is never automated or bypassed.

### Export / Import

To use the app on another machine:

1. Go to Settings, click Export Vault
2. Save the `.vault-backup` file (it is encrypted)
3. Copy the file to the new machine
4. Install the app, go to Settings, click Import Vault
5. Select the file, enter your master password

The backup file is AES-256-GCM encrypted. It is safe to store anywhere.

---

## Security

| Property | Implementation |
|----------|---------------|
| Encryption at rest | AES-256-GCM |
| Key derivation | Argon2id (memory-hard, GPU-resistant) |
| Master password | Never stored on disk |
| Memory handling | Keys zeroed on vault lock (zeroize) |
| User isolation | Separate encrypted vault per user |
| Network | No network calls. Entirely local. |
| MFA | Never bypassed or automated |

---

## Architecture

```
Frontend         React + TypeScript + Tailwind CSS + Framer Motion
IPC              Tauri command bridge
Backend          Rust (compiled native binary)
Encryption       aes-gcm + argon2 + zeroize crates
Database         SQLite (rusqlite, per-user)
Automation       Playwright (Chromium, non-headless)
Dialogs          tauri-plugin-dialog (native OS file picker)
```

### Data Storage

```
~/.aws-login-hub/
├── users.json              User profiles (metadata only)
├── <username>.vault.enc    Encrypted credentials (AES-256-GCM)
└── <username>.db           Client metadata (SQLite)
```

---

## Build from Source

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Linux: `sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev libssl-dev libsoup-3.0-dev build-essential`
- Windows: WebView2 (included in Windows 10/11)
- macOS: Xcode Command Line Tools

### Development

```bash
git clone https://github.com/Gourav-Singh-Comprinno/aws-login-hub.git
cd aws-login-hub
npm install
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

Build outputs by platform:

| Platform | Output |
|----------|--------|
| Ubuntu/Debian | `src-tauri/target/release/bundle/deb/*.deb` |
| Fedora/RHEL | `src-tauri/target/release/bundle/rpm/*.rpm` |
| Portable Linux | `src-tauri/target/release/bundle/appimage/*.AppImage` |
| Windows | `src-tauri/target/release/bundle/msi/*.msi` |
| macOS | `src-tauri/target/release/bundle/dmg/*.dmg` |

---

## Tests

```bash
cd src-tauri
cargo test
```

20 tests covering vault encryption, user isolation, credential CRUD, master password change, export/import, search, favorites, and dashboard statistics.

---

## Uninstall

**Ubuntu/Debian:**
```bash
sudo apt remove aws-login-hub
```

**Fedora/RHEL:**
```bash
sudo rpm -e aws-login-hub
```

**Windows:**
Settings → Apps → AWS Login Hub → Uninstall

**macOS:**
Drag from Applications to Trash

**Remove all stored data:**
```bash
rm -rf ~/.aws-login-hub
```

---

## License

MIT

---

<div align="center">
  <sub>Built for DevOps engineers who manage multiple AWS accounts.</sub>
</div>
