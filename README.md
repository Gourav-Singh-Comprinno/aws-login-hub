<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.1-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" />
  <img src="https://img.shields.io/badge/encryption-AES--256--GCM-green?style=flat-square" />
  <img src="https://img.shields.io/github/downloads/Gourav-Singh-Comprinno/aws-login-hub/total?style=flat-square&label=downloads" />
</p>

<h1 align="center">AWS Login Hub</h1>

<p align="center">
  Secure desktop application for managing multiple AWS Identity Center logins.<br>
  Encrypted vault. Browser automation. System-wide AWS profiles.
</p>

<p align="center">
  <a href="https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest"><strong>Download for Windows, macOS & Linux</strong></a>
</p>

---

## Screenshots

<p align="center">
  <img src="screenshots/01-unlock-screen.png" width="800" />
  <br><em>Vault Unlock — AES-256-GCM encrypted with Argon2id key derivation</em>
</p>

<p align="center">
  <img src="screenshots/03-dashboard.png" width="800" />
  <br><em>Dashboard — Overview of all clients, sessions, and activity</em>
</p>

<p align="center">
  <img src="screenshots/04-clients.png" width="800" />
  <br><em>Client Management — Session status, one-click login, refresh tokens</em>
</p>

<p align="center">
  <img src="screenshots/07-terminal.png" width="800" />
  <br><em>Built-in Terminal — Run AWS CLI with auto-configured profiles</em>
</p>

<p align="center">
  <img src="screenshots/06-settings.png" width="800" />
  <br><em>Settings — Export/Import vault, change password, security info</em>
</p>

---

## Download & Install

Go to the [Releases page](https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest) and download the installer for your OS.

### Windows

1. Download `aws-login-hub_x64.msi`
2. Double-click the `.msi` file
3. Follow the installer
4. Find "AWS Login Hub" in your Start Menu

### macOS

1. Download `aws-login-hub_x64.dmg` (Intel) or `aws-login-hub_aarch64.dmg` (Apple Silicon)
2. Open the `.dmg` file
3. Drag "AWS Login Hub" to Applications
4. Open from Launchpad or Spotlight (`Cmd + Space` → "AWS Login Hub")

### Linux (Ubuntu / Debian)

```bash
# Download from releases page or:
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest/download/aws-login-hub_1.2.1_amd64.deb
sudo dpkg -i aws-login-hub_1.2.1_amd64.deb
```

Find "AWS Login Hub" in your application menu, or run:
```bash
aws-login-hub
```

### Linux (Fedora / RHEL)

```bash
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest/download/aws-login-hub-1.2.1-1.x86_64.rpm
sudo rpm -i aws-login-hub-1.2.1-1.x86_64.rpm
aws-login-hub
```

### Linux (Portable — Any Distro)

```bash
wget https://github.com/Gourav-Singh-Comprinno/aws-login-hub/releases/latest/download/aws-login-hub_1.2.1_amd64.AppImage
chmod +x aws-login-hub_1.2.1_amd64.AppImage
./aws-login-hub_1.2.1_amd64.AppImage
```

### After Install: Setup Browser Automation

```bash
npm install -g playwright
npx playwright install chromium
```

This enables the auto-login feature. Without it, credential storage still works.

---

## Features

### Encrypted Vault
- AES-256-GCM encryption with Argon2id key derivation
- Passwords never stored in plaintext anywhere
- Vault auto-locks after 15 minutes
- Master password re-verification every 2 weeks

### Multi-User Isolation
- Each user on the same machine has their own encrypted vault
- User A cannot decrypt or see User B's data
- Separate database per user

### Browser Automation (Login)
- Click Login → Chromium opens → email/password auto-filled
- Pauses at MFA — you complete it manually
- AWS Console opens → session timestamp updated
- "Refresh All Tokens" button refreshes all clients at once

### System-Wide AWS Profiles
- Generates `~/.aws/config` with SSO profiles for all your clients
- Profiles work in any terminal (bash, PowerShell, VS Code, etc.)
- Works with AWS CLI, Terraform, Ansible, boto3, and all AWS SDKs
- One-click token refresh from the app

### Built-in Terminal
- Run AWS CLI commands directly from the app
- Auto-sets `AWS_PROFILE` for the selected client
- "Get Credentials" exports temporary access keys you can paste anywhere

### Export / Import
- Export your encrypted vault to transfer between machines
- Import on any OS (Windows, macOS, Linux)
- Backup file is encrypted — safe to store on USB or cloud

---

## How It Works

### Login Flow

```
Click Login → Opens Chromium → Fills email → Fills password → Waits for MFA → Console opens
```

MFA is never bypassed or automated.

### System-Wide Profiles

```
App writes ~/.aws/config
        |
        v
Any terminal: aws s3 ls --profile netflix-prod
Any tool:     terraform plan (with profile in provider config)
Any IDE:      VS Code AWS Toolkit reads the profiles
```

### Token Refresh

```
Click "Refresh All Tokens"
        |
        v
Browser automation logs into each client's SSO
        |
        v
Tokens cached at ~/.aws/sso/cache/ (system-wide)
        |
        v
All terminals can use profiles without re-authenticating
```

---

## Security

| Property | Implementation |
|----------|---------------|
| Encryption | AES-256-GCM (authenticated encryption) |
| Key derivation | Argon2id (memory-hard, resistant to GPU attacks) |
| Master password | Never stored. Only used to derive the encryption key. |
| Memory | Keys zeroed from RAM on vault lock (zeroize crate) |
| User isolation | Each user has independent encrypted vault file |
| Network | Zero network calls. All data is local. |
| Expiration | Re-authentication required every 2 weeks |
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

The `.vault.enc` file is a binary encrypted blob. Without the master password, it cannot be read.

---

## Build from Source

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Platform-specific dependencies (see below)

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

20 tests covering vault encryption, user isolation, credential CRUD, password change, export/import, search, and statistics.

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
| Automation | Playwright (Chromium) |
| Platforms | Windows, macOS (Intel + Apple Silicon), Linux |

---

## License

MIT

---

<p align="center">
  <sub>Built for DevOps engineers who manage multiple AWS accounts.</sub>
</p>
