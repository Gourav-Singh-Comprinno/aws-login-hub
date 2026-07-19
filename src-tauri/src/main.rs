#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod vault;

use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use std::sync::Mutex;
use tauri::State;
use chrono::Utc;
use vault::{VaultManager, UnlockedVault};

// ============================================================
// Data Models
// ============================================================

/// Cross-OS helper: get user home directory consistently
fn home_dir() -> std::path::PathBuf {
    std::path::PathBuf::from(
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| {
                #[cfg(target_os = "windows")]
                { std::env::var("HOMEDRIVE").unwrap_or_default() + &std::env::var("HOMEPATH").unwrap_or_default() }
                #[cfg(not(target_os = "windows"))]
                { "/tmp".to_string() }
            })
    )
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Client {
    pub id: String,
    pub name: String,
    pub identity_center_url: String,
    pub email: String,
    pub sso_region: String,
    pub sso_account_id: String,
    pub sso_role_name: String,
    pub notes: String,
    pub tags: String,
    pub environment: String,
    pub favorite: bool,
    pub last_login: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateClientRequest {
    pub name: String,
    pub identity_center_url: String,
    pub email: String,
    pub password: String,
    pub sso_region: Option<String>,
    pub sso_account_id: Option<String>,
    pub sso_role_name: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub environment: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateClientRequest {
    pub name: Option<String>,
    pub identity_center_url: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>,
    pub sso_region: Option<String>,
    pub sso_account_id: Option<String>,
    pub sso_role_name: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub environment: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_clients: usize,
    pub favorites: usize,
    pub logged_in_today: usize,
    pub recent_clients: Vec<Client>,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub username: String,
    pub display_name: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
struct LoginResponse {
    success: bool,
    message: String,
    step: String,
}

// ============================================================
// App State — Multi-User with Vault
// ============================================================

pub struct AppState {
    pub vault_manager: VaultManager,
    pub active_vault: Mutex<Option<UnlockedVault>>,
    pub active_db: Mutex<Option<Connection>>,
    /// Rate limiting: track failed unlock attempts per username
    pub failed_attempts: Mutex<std::collections::HashMap<String, (u32, std::time::Instant)>>,
}

// ============================================================
// Database (per-user)
// ============================================================

fn init_user_db(path: &std::path::Path) -> Connection {
    let conn = Connection::open(path).expect("Failed to open user database");
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            identity_center_url TEXT NOT NULL,
            email TEXT NOT NULL,
            sso_region TEXT DEFAULT 'us-east-1',
            sso_account_id TEXT DEFAULT '',
            sso_role_name TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            tags TEXT DEFAULT '',
            environment TEXT DEFAULT '',
            favorite INTEGER DEFAULT 0,
            last_login TEXT,
            status TEXT DEFAULT 'never',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_clients_favorite ON clients(favorite);
        CREATE INDEX IF NOT EXISTS idx_clients_last_login ON clients(last_login);
    ").expect("Failed to init user database");
    // Migration: add columns if missing (for existing databases)
    conn.execute("ALTER TABLE clients ADD COLUMN sso_region TEXT DEFAULT 'us-east-1'", []).ok();
    conn.execute("ALTER TABLE clients ADD COLUMN sso_account_id TEXT DEFAULT ''", []).ok();
    conn.execute("ALTER TABLE clients ADD COLUMN sso_role_name TEXT DEFAULT ''", []).ok();
    conn
}

fn row_to_client(row: &rusqlite::Row) -> rusqlite::Result<Client> {
    Ok(Client {
        id: row.get(0)?,
        name: row.get(1)?,
        identity_center_url: row.get(2)?,
        email: row.get(3)?,
        sso_region: row.get::<_, String>(4).unwrap_or_else(|_| "us-east-1".to_string()),
        sso_account_id: row.get::<_, String>(5).unwrap_or_default(),
        sso_role_name: row.get::<_, String>(6).unwrap_or_default(),
        notes: row.get::<_, String>(7).unwrap_or_default(),
        tags: row.get::<_, String>(8).unwrap_or_default(),
        environment: row.get::<_, String>(9).unwrap_or_default(),
        favorite: row.get::<_, i32>(10).unwrap_or(0) != 0,
        last_login: row.get::<_, Option<String>>(11).unwrap_or(None),
        status: row.get::<_, String>(12).unwrap_or_else(|_| "never".to_string()),
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

const COLS: &str = "id, name, identity_center_url, email, sso_region, sso_account_id, sso_role_name, notes, tags, environment, favorite, last_login, status, created_at, updated_at";

// Helper: get active DB or error
fn with_db<F, R>(state: &State<AppState>, f: F) -> Result<R, String>
where F: FnOnce(&Connection) -> Result<R, String> {
    let lock = state.active_db.lock().map_err(|e| e.to_string())?;
    let db = lock.as_ref().ok_or("Vault is locked. Please unlock first.")?;
    f(db)
}

// ============================================================
// User & Vault Commands
// ============================================================

#[tauri::command]
fn get_users(state: State<AppState>) -> Result<Vec<UserInfo>, String> {
    let users = state.vault_manager.load_users();
    Ok(users.into_iter().map(|u| UserInfo {
        username: u.username,
        display_name: u.display_name,
        created_at: u.created_at,
    }).collect())
}

#[tauri::command]
fn create_user(state: State<AppState>, username: String, display_name: String, master_password: String) -> Result<UserInfo, String> {
    if username.is_empty() || master_password.len() < 6 {
        return Err("Username required, password must be at least 6 characters".to_string());
    }
    let profile = state.vault_manager.create_user(&username, &display_name, &master_password)?;
    Ok(UserInfo { username: profile.username, display_name: profile.display_name, created_at: profile.created_at })
}

#[tauri::command]
fn delete_user(state: State<AppState>, username: String, master_password: String) -> Result<(), String> {
    // Verify password before deletion
    let _ = state.vault_manager.unlock(&username, &master_password)?;
    state.vault_manager.delete_user(&username)
}

#[tauri::command]
fn unlock_vault(state: State<AppState>, username: String, master_password: String) -> Result<UserInfo, String> {
    // Rate limiting: check for too many failed attempts
    {
        let attempts = state.failed_attempts.lock().map_err(|e| e.to_string())?;
        if let Some((count, last_attempt)) = attempts.get(&username) {
            let lockout_duration = match *count {
                0..=2 => std::time::Duration::from_secs(0),
                3..=4 => std::time::Duration::from_secs(5),
                5..=6 => std::time::Duration::from_secs(30),
                7..=9 => std::time::Duration::from_secs(60),
                _ => std::time::Duration::from_secs(300), // 5 minutes after 10+ failures
            };
            if *count >= 3 && last_attempt.elapsed() < lockout_duration {
                let remaining = lockout_duration.as_secs() - last_attempt.elapsed().as_secs();
                return Err(format!(
                    "Too many failed attempts. Please wait {} seconds before trying again.",
                    remaining
                ));
            }
        }
    }

    let unlocked = match state.vault_manager.unlock(&username, &master_password) {
        Ok(v) => {
            // Clear failed attempts on success
            let mut attempts = state.failed_attempts.lock().map_err(|e| e.to_string())?;
            attempts.remove(&username);
            v
        }
        Err(e) => {
            // Increment failed attempts
            let mut attempts = state.failed_attempts.lock().map_err(|e| e.to_string())?;
            let entry = attempts.entry(username.clone()).or_insert((0, std::time::Instant::now()));
            entry.0 += 1;
            entry.1 = std::time::Instant::now();
            return Err(e);
        }
    };

    // Open user's database
    let db_path = state.vault_manager.db_path(&username);
    let db = init_user_db(&db_path);

    // Store in state
    let mut vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
    *vault_lock = Some(unlocked);

    let mut db_lock = state.active_db.lock().map_err(|e| e.to_string())?;
    *db_lock = Some(db);

    let users = state.vault_manager.load_users();
    let user = users.iter().find(|u| u.username == username).unwrap();
    Ok(UserInfo { username: user.username.clone(), display_name: user.display_name.clone(), created_at: user.created_at.clone() })
}

#[tauri::command]
fn lock_vault(state: State<AppState>) -> Result<(), String> {
    // Save vault before locking
    let mut vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
    if let Some(ref vault) = *vault_lock {
        state.vault_manager.save_vault(vault)?;
    }
    *vault_lock = None; // Drops the vault, zeroing the key

    let mut db_lock = state.active_db.lock().map_err(|e| e.to_string())?;
    *db_lock = None;

    Ok(())
}

#[tauri::command]
fn is_vault_unlocked(state: State<AppState>) -> bool {
    state.active_vault.lock().map(|v| v.is_some()).unwrap_or(false)
}

#[tauri::command]
fn change_master_password(state: State<AppState>, username: String, current_password: String, new_password: String) -> Result<(), String> {
    if new_password.len() < 6 {
        return Err("New password must be at least 6 characters".to_string());
    }
    state.vault_manager.change_master_password(&username, &current_password, &new_password)
}

// ============================================================
// Client Commands (require unlocked vault)
// ============================================================

#[tauri::command]
fn get_clients(state: State<AppState>) -> Result<Vec<Client>, String> {
    with_db(&state, |db| {
        let sql = format!("SELECT {} FROM clients ORDER BY name", COLS);
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let iter = stmt.query_map([], row_to_client).map_err(|e| e.to_string())?;
        iter.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn get_client(state: State<AppState>, id: String) -> Result<Client, String> {
    with_db(&state, |db| {
        let sql = format!("SELECT {} FROM clients WHERE id=?1", COLS);
        db.query_row(&sql, params![id], row_to_client).map_err(|e| format!("Not found: {}", e))
    })
}

#[tauri::command]
fn create_client(state: State<AppState>, request: CreateClientRequest) -> Result<Client, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let sso_region = request.sso_region.unwrap_or_else(|| "us-east-1".to_string());
    let sso_account_id = request.sso_account_id.unwrap_or_default();
    let sso_role_name = request.sso_role_name.unwrap_or_default();
    let notes = request.notes.unwrap_or_default();
    let tags = request.tags.unwrap_or_default();
    let environment = request.environment.unwrap_or_default();

    // Store password in vault
    {
        let mut vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
        let vault = vault_lock.as_mut().ok_or("Vault is locked")?;
        VaultManager::store_credential(vault, &id, &request.password);
        state.vault_manager.save_vault(vault)?;
    }

    with_db(&state, |db| {
        db.execute(
            "INSERT INTO clients (id, name, identity_center_url, email, sso_region, sso_account_id, sso_role_name, notes, tags, environment, favorite, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 'never', ?11, ?12)",
            params![id, request.name, request.identity_center_url, request.email, sso_region, sso_account_id, sso_role_name, notes, tags, environment, now, now],
        ).map_err(|e| format!("Failed to create: {}", e))?;
        Ok(Client {
            id, name: request.name, identity_center_url: request.identity_center_url,
            email: request.email, sso_region, sso_account_id, sso_role_name,
            notes, tags, environment, favorite: false,
            last_login: None, status: "never".to_string(), created_at: now.clone(), updated_at: now,
        })
    })
}

#[tauri::command]
fn update_client(state: State<AppState>, id: String, request: UpdateClientRequest) -> Result<Client, String> {
    let now = Utc::now().to_rfc3339();

    // Update password in vault if provided
    if let Some(ref pw) = request.password {
        let mut vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
        let vault = vault_lock.as_mut().ok_or("Vault is locked")?;
        VaultManager::store_credential(vault, &id, pw);
        state.vault_manager.save_vault(vault)?;
    }

    with_db(&state, |db| {
        // Build a single UPDATE statement dynamically
        let mut set_clauses: Vec<String> = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref v) = request.name { set_clauses.push("name=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(ref v) = request.identity_center_url { set_clauses.push("identity_center_url=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(ref v) = request.email { set_clauses.push("email=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(ref v) = request.sso_region { set_clauses.push("sso_region=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(ref v) = request.sso_account_id { set_clauses.push("sso_account_id=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(ref v) = request.sso_role_name { set_clauses.push("sso_role_name=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(ref v) = request.notes { set_clauses.push("notes=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(ref v) = request.tags { set_clauses.push("tags=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(ref v) = request.environment { set_clauses.push("environment=?".to_string()); params_vec.push(Box::new(v.clone())); }
        if let Some(v) = request.favorite { set_clauses.push("favorite=?".to_string()); params_vec.push(Box::new(v as i32)); }

        if !set_clauses.is_empty() {
            set_clauses.push("updated_at=?".to_string());
            params_vec.push(Box::new(now.clone()));
            params_vec.push(Box::new(id.clone())); // WHERE id=?

            let sql = format!("UPDATE clients SET {} WHERE id=?", set_clauses.join(", "));
            let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
            db.execute(&sql, params_refs.as_slice())
                .map_err(|e| format!("Failed to update client: {}", e))?;
        }

        let sql = format!("SELECT {} FROM clients WHERE id=?1", COLS);
        db.query_row(&sql, params![id], row_to_client).map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn delete_client(state: State<AppState>, id: String) -> Result<(), String> {
    // Remove from vault
    {
        let mut vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut vault) = *vault_lock {
            VaultManager::delete_credential(vault, &id);
            state.vault_manager.save_vault(vault)?;
        }
    }
    with_db(&state, |db| {
        db.execute("DELETE FROM clients WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
fn toggle_favorite(state: State<AppState>, id: String) -> Result<Client, String> {
    let now = Utc::now().to_rfc3339();
    with_db(&state, |db| {
        db.execute("UPDATE clients SET favorite = CASE WHEN favorite=0 THEN 1 ELSE 0 END, updated_at=?1 WHERE id=?2", params![now, id]).map_err(|e| e.to_string())?;
        let sql = format!("SELECT {} FROM clients WHERE id=?1", COLS);
        db.query_row(&sql, params![id], row_to_client).map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn search_clients(state: State<AppState>, query: String) -> Result<Vec<Client>, String> {
    with_db(&state, |db| {
        let pat = format!("%{}%", query);
        let sql = format!("SELECT {} FROM clients WHERE name LIKE ?1 OR email LIKE ?1 OR tags LIKE ?1 OR environment LIKE ?1 ORDER BY name", COLS);
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let iter = stmt.query_map(params![pat], row_to_client).map_err(|e| e.to_string())?;
        iter.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

#[tauri::command]
fn get_dashboard_stats(state: State<AppState>) -> Result<DashboardStats, String> {
    with_db(&state, |db| {
        let total: usize = db.query_row("SELECT COUNT(*) FROM clients", [], |r| r.get(0)).unwrap_or(0);
        let favorites: usize = db.query_row("SELECT COUNT(*) FROM clients WHERE favorite=1", [], |r| r.get(0)).unwrap_or(0);
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let logged_today: usize = db.query_row("SELECT COUNT(*) FROM clients WHERE last_login LIKE ?1", params![format!("{}%", today)], |r| r.get(0)).unwrap_or(0);
        let sql = format!("SELECT {} FROM clients WHERE last_login IS NOT NULL ORDER BY last_login DESC LIMIT 10", COLS);
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let recent_clients: Vec<Client> = stmt.query_map([], row_to_client).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        Ok(DashboardStats { total_clients: total, favorites, logged_in_today: logged_today, recent_clients })
    })
}

#[tauri::command]
fn update_last_login(state: State<AppState>, id: String) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    with_db(&state, |db| {
        db.execute("UPDATE clients SET last_login=?1, status='active', updated_at=?1 WHERE id=?2", params![now, id]).map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
fn get_client_password(state: State<AppState>, id: String) -> Result<String, String> {
    let vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_lock.as_ref().ok_or("Vault is locked")?;
    VaultManager::get_credential(vault, &id)
}
// ============================================================
// Export / Import Vault
// ============================================================

#[derive(Debug, Serialize)]
struct ExportResult {
    path: String,
    size: u64,
}

#[tauri::command]
fn export_vault(state: State<AppState>, destination: String) -> Result<ExportResult, String> {
    let vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_lock.as_ref().ok_or("Vault is locked. Unlock first.")?;
    let username = &vault.username;

    let vault_path = state.vault_manager.vault_path_public(username);
    let db_path = state.vault_manager.db_path(username);

    let vault_bytes = std::fs::read(&vault_path)
        .map_err(|e| format!("Failed to read vault: {}", e))?;
    let db_bytes = std::fs::read(&db_path)
        .map_err(|e| format!("Failed to read database: {}", e))?;

    // Include user profile (salt + password_hash) so import works on another machine
    let users = state.vault_manager.load_users();
    let user_profile = users.iter().find(|u| u.username == *username)
        .ok_or("User profile not found")?;
    let profile_json = serde_json::to_string(user_profile)
        .map_err(|e| format!("Failed to serialize profile: {}", e))?;

    let mut bundle: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    bundle.insert("version".to_string(), "2".to_string());
    bundle.insert("username".to_string(), username.clone());
    bundle.insert("exported_at".to_string(), Utc::now().to_rfc3339());
    bundle.insert("vault".to_string(), hex::encode(&vault_bytes));
    bundle.insert("database".to_string(), hex::encode(&db_bytes));
    bundle.insert("user_profile".to_string(), profile_json);

    let json = serde_json::to_vec_pretty(&bundle)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    let dest_path = if destination.ends_with(".vault-backup") {
        destination.clone()
    } else {
        let filename = format!("{}-{}.vault-backup", username, Utc::now().format("%Y%m%d"));
        let mut p = std::path::PathBuf::from(&destination);
        p.push(filename);
        p.to_string_lossy().to_string()
    };

    std::fs::write(&dest_path, &json)
        .map_err(|e| format!("Failed to write backup: {}", e))?;

    Ok(ExportResult { path: dest_path, size: json.len() as u64 })
}

#[tauri::command]
fn import_vault(state: State<AppState>, file_path: String, master_password: String) -> Result<UserInfo, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read backup: {}", e))?;

    let bundle: std::collections::HashMap<String, String> = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid backup format: {}", e))?;

    let username = bundle.get("username").ok_or("Missing username in backup")?.clone();
    let vault_hex = bundle.get("vault").ok_or("Missing vault data")?;
    let db_hex = bundle.get("database").ok_or("Missing database")?;

    let vault_bytes = hex::decode(vault_hex).map_err(|e| format!("Corrupt vault data: {}", e))?;
    let db_bytes = hex::decode(db_hex).map_err(|e| format!("Corrupt database: {}", e))?;

    let vault_path = state.vault_manager.vault_path_public(&username);
    let db_path = state.vault_manager.db_path(&username);

    // Backup existing files if they exist (so we can restore on failure)
    let vault_backup = vault_path.with_extension("enc.bak");
    let db_backup = db_path.with_extension("db.bak");
    let had_existing_vault = vault_path.exists();
    let had_existing_db = db_path.exists();

    if had_existing_vault {
        std::fs::copy(&vault_path, &vault_backup)
            .map_err(|e| format!("Failed to backup existing vault: {}", e))?;
    }
    if had_existing_db {
        std::fs::copy(&db_path, &db_backup)
            .map_err(|e| format!("Failed to backup existing database: {}", e))?;
    }

    // Register user in manifest — prefer embedded profile (v2) over generating new one
    let user_existed = state.vault_manager.load_users().iter().any(|u| u.username == username);
    if !user_existed {
        if let Some(profile_json) = bundle.get("user_profile") {
            // v2 export: use the original profile with correct salt + password_hash
            let profile: vault::UserProfile = serde_json::from_str(profile_json)
                .map_err(|e| format!("Invalid user profile in backup: {}", e))?;
            state.vault_manager.register_imported_profile(&profile)?;
        } else {
            // v1 export (legacy): generate new profile — note: this may fail for vaults
            // encrypted with a different salt, but we verify below
            state.vault_manager.register_imported_user(&username, &master_password)?;
        }
    }

    // Write imported files
    std::fs::write(&vault_path, &vault_bytes).map_err(|e| format!("Write failed: {}", e))?;
    std::fs::write(&db_path, &db_bytes).map_err(|e| format!("Write failed: {}", e))?;

    // Verify master password works with the imported vault
    if state.vault_manager.unlock(&username, &master_password).is_err() {
        // Restore original files on failure
        if had_existing_vault {
            std::fs::copy(&vault_backup, &vault_path).ok();
        } else {
            std::fs::remove_file(&vault_path).ok();
        }
        if had_existing_db {
            std::fs::copy(&db_backup, &db_path).ok();
        } else {
            std::fs::remove_file(&db_path).ok();
        }
        // Remove user from manifest if we just added them
        if !user_existed {
            let mut users = state.vault_manager.load_users();
            users.retain(|u| u.username != username);
            let _ = state.vault_manager.save_users_public(&users);
        }
        // Cleanup backups
        std::fs::remove_file(&vault_backup).ok();
        std::fs::remove_file(&db_backup).ok();
        return Err("Wrong master password for this backup. Import cancelled.".to_string());
    }

    // Success - remove backups
    std::fs::remove_file(&vault_backup).ok();
    std::fs::remove_file(&db_backup).ok();

    let users = state.vault_manager.load_users();
    let user = users.iter().find(|u| u.username == username).ok_or("Import failed")?;
    Ok(UserInfo { username: user.username.clone(), display_name: user.display_name.clone(), created_at: user.created_at.clone() })
}


// ============================================================
// Login Automation
// ============================================================

/// Find a binary by checking common paths (needed because GUI apps don't inherit shell PATH)
fn find_binary(name: &str) -> Option<String> {
    use std::process::Command;

    // First try the binary directly (works if PATH is set)
    if let Ok(output) = Command::new(name).arg("--version").output() {
        if output.status.success() {
            return Some(name.to_string());
        }
    }

    // Check common installation paths
    let common_paths = [
        format!("/usr/local/bin/{}", name),
        format!("/opt/homebrew/bin/{}", name),
        format!("/usr/bin/{}", name),
        format!("/opt/local/bin/{}", name),
        format!("{}/.nvm/versions/node/current/bin/{}", std::env::var("HOME").unwrap_or_default(), name),
    ];

    #[cfg(target_os = "windows")]
    let common_paths_win = [
        format!("C:\\Program Files\\nodejs\\{}.exe", name),
        format!("{}\\AppData\\Roaming\\npm\\{}.cmd", std::env::var("USERPROFILE").unwrap_or_default(), name),
    ];

    for path in &common_paths {
        if std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }

    #[cfg(target_os = "windows")]
    for path in &common_paths_win {
        if std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }

    // Try using `which` / `where` as last resort
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = Command::new("/usr/bin/which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("where").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }

    None
}

/// Ensures Node.js and Playwright are installed. Installs Playwright automatically if missing.
fn ensure_playwright() -> Result<(), String> {
    use std::process::Command;

    // Check if Node.js is available
    let node_bin = find_binary("node");
    if node_bin.is_none() {
        return Err("Node.js is not installed. Please install Node.js from https://nodejs.org".to_string());
    }

    // Check if npm is available
    let npm_bin = find_binary("npm");
    if npm_bin.is_none() {
        return Err("npm is not installed. Please install Node.js from https://nodejs.org".to_string());
    }
    let npm = npm_bin.unwrap();

    // Check if Playwright is installed globally
    let npm_root = Command::new(&npm).args(["root", "-g"]).output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    let playwright_path = std::path::PathBuf::from(&npm_root).join("playwright");
    if !playwright_path.exists() {
        // Auto-install Playwright globally
        let install = Command::new(&npm)
            .args(["install", "-g", "playwright"])
            .output()
            .map_err(|e| format!("Failed to install Playwright: {}", e))?;

        if !install.status.success() {
            let stderr = String::from_utf8_lossy(&install.stderr);
            return Err(format!("Failed to install Playwright: {}", stderr));
        }
    }

    // Check if Chromium browser is downloaded for Playwright
    let cache_dir = {
        #[cfg(target_os = "macos")]
        { home_dir().join("Library/Caches/ms-playwright") }
        #[cfg(target_os = "linux")]
        { home_dir().join(".cache/ms-playwright") }
        #[cfg(target_os = "windows")]
        {
            std::path::PathBuf::from(
                std::env::var("LOCALAPPDATA").unwrap_or_else(|_| home_dir().to_string_lossy().to_string())
            ).join("ms-playwright")
        }
    };

    let has_chromium = cache_dir.exists() && std::fs::read_dir(&cache_dir)
        .map(|entries| entries.filter_map(|e| e.ok()).any(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.starts_with("chromium")
        }))
        .unwrap_or(false);

    if !has_chromium {
        let npx_bin = find_binary("npx").unwrap_or_else(|| "npx".to_string());
        let install = Command::new(&npx_bin)
            .args(["playwright", "install", "chromium"])
            .output()
            .map_err(|e| format!("Failed to install Chromium: {}", e))?;

        if !install.status.success() {
            let stderr = String::from_utf8_lossy(&install.stderr);
            return Err(format!("Failed to install Chromium for Playwright: {}", stderr));
        }
    }

    Ok(())
}

#[tauri::command]
fn run_login(_state: State<AppState>, url: String, email: String, password: String, client_id: String, client_name: String) -> Result<LoginResponse, String> {
    use std::process::Command;

    let _ = &client_id;

    // Find node and npm binaries (GUI apps don't have shell PATH)
    let node_bin = find_binary("node")
        .ok_or("Node.js not found. Please install Node.js from https://nodejs.org")?;
    let npm_bin = find_binary("npm")
        .ok_or("npm not found. Please install Node.js from https://nodejs.org")?;

    // Cross-OS: get npm global root
    let npm_root = Command::new(&npm_bin).args(["root", "-g"]).output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| {
            #[cfg(target_os = "windows")]
            { format!("{}\\node_modules", std::env::var("APPDATA").unwrap_or_default()) }
            #[cfg(target_os = "macos")]
            { "/usr/local/lib/node_modules".to_string() }
            #[cfg(not(any(target_os = "windows", target_os = "macos")))]
            { "/usr/lib/node_modules".to_string() }
        });

    let npm_root_js = npm_root.replace('\\', "/");

    // Detect system default browser and map to Playwright channel
    #[cfg(target_os = "macos")]
    let (default_channel, default_exec_path): (&str, &str) = {
        let output = Command::new("defaults")
            .args(["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string());
        
        let brave_path = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
        let brave_exists = std::path::Path::new(brave_path).exists();

        if let Some(ref handlers) = output {
            if handlers.contains("com.brave.browser") && brave_exists {
                ("", brave_path)
            } else if handlers.contains("com.google.chrome") {
                ("chrome", "")
            } else if handlers.contains("com.microsoft.edgemac") {
                ("msedge", "")
            } else if brave_exists {
                ("", brave_path)
            } else {
                ("chrome", "")
            }
        } else if brave_exists {
            ("", brave_path)
        } else {
            ("chrome", "")
        }
    };

    #[cfg(target_os = "windows")]
    let (default_channel, default_exec_path): (&str, &str) = {
        let output = Command::new("reg")
            .args(["query", r"HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice", "/v", "ProgId"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();

        if output.contains("BraveHTML") || output.contains("Brave") {
            let brave_path = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe";
            if std::path::Path::new(brave_path).exists() {
                ("", brave_path)
            } else {
                ("chrome", "")
            }
        } else if output.contains("ChromeHTML") || output.contains("Google") {
            ("chrome", "")
        } else if output.contains("MSEdgeHTM") || output.contains("Edge") {
            ("msedge", "")
        } else {
            ("chrome", "")
        }
    };

    #[cfg(target_os = "linux")]
    let (default_channel, default_exec_path): (&str, &str) = {
        let output = Command::new("xdg-settings")
            .args(["get", "default-web-browser"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        if output.contains("brave") {
            if std::path::Path::new("/usr/bin/brave-browser").exists() {
                ("", "/usr/bin/brave-browser")
            } else if std::path::Path::new("/usr/bin/brave").exists() {
                ("", "/usr/bin/brave")
            } else {
                ("chrome", "")
            }
        } else if output.contains("google-chrome") || output.contains("chrome") {
            ("chrome", "")
        } else if output.contains("microsoft-edge") || output.contains("msedge") {
            ("msedge", "")
        } else if output.contains("chromium") {
            ("chromium", "")
        } else {
            ("chrome", "")
        }
    };

    // Playwright script: auto-fills email & password, stops before MFA/OTP
    let script = format!(r#"
const {{ chromium }} = require('{npm_root}/playwright');
(async () => {{
  const url = process.env.AWSLH_URL;
  const email = process.env.AWSLH_EMAIL;
  const password = process.env.AWSLH_PASSWORD;
  const channel = process.env.AWSLH_CHANNEL || '';
  const execPath = process.env.AWSLH_EXEC_PATH || '';
  const clientName = process.env.AWSLH_CLIENT_NAME || 'AWS Login';

  let browser;

  // First try with explicit executable path (for Brave, etc.)
  if (execPath) {{
    try {{
      browser = await chromium.launch({{
        headless: false,
        executablePath: execPath,
        args: ['--start-maximized']
      }});
    }} catch (e) {{
      // Fall through to channel-based detection
    }}
  }}

  // Try channel-based launch
  if (!browser) {{
    const channels = [channel, 'chrome', 'msedge', 'chromium'].filter(Boolean);
    for (const ch of channels) {{
      try {{
        browser = await chromium.launch({{
          headless: false,
          channel: ch,
          args: ['--start-maximized']
        }});
        break;
      }} catch (e) {{
        continue;
      }}
    }}
  }}

  if (!browser) {{
    console.error('No supported browser found (Brave, Chrome, Edge, or Chromium required)');
    process.exit(1);
  }}

  try {{
    const context = await browser.newContext({{ viewport: null }});
    const page = await context.newPage();
    await page.goto(url, {{ waitUntil: 'networkidle', timeout: 30000 }});
    await page.evaluate((name) => {{ document.title = name + ' - AWS Login'; }}, clientName);
    await page.waitForTimeout(2000);

    // Step 1: Fill email
    const emailSels = ['#awsui-input-0', 'input[type="email"]', 'input[name="email"]', 'input[name="username"]', 'input[placeholder*="email" i]', 'input[type="text"]'];
    for (const sel of emailSels) {{
      try {{
        const el = await page.waitForSelector(sel, {{ timeout: 3000 }});
        if (el) {{ await el.fill(email); break; }}
      }} catch {{}}
    }}

    // Step 2: Click Next/Sign-in
    const nextSels = ['button[type="submit"]', 'button:has-text("Next")', 'button:has-text("Sign in")', 'button:has-text("Continue")', 'input[type="submit"]'];
    for (const sel of nextSels) {{
      try {{
        const btn = await page.waitForSelector(sel, {{ timeout: 3000 }});
        if (btn) {{ await btn.click(); break; }}
      }} catch {{}}
    }}
    await page.waitForTimeout(3000);

    // Step 3: Fill password (if password field appears — skip if it's an OTP/MFA page)
    const pwSels = ['input[type="password"]', 'input[name="password"]', '#password'];
    for (const sel of pwSels) {{
      try {{
        const el = await page.waitForSelector(sel, {{ timeout: 10000 }});
        if (el) {{ await el.fill(password); break; }}
      }} catch {{}}
    }}

    // Step 4: Click Submit
    for (const sel of nextSels) {{
      try {{
        const btn = await page.waitForSelector(sel, {{ timeout: 3000 }});
        if (btn) {{ await btn.click(); break; }}
      }} catch {{}}
    }}

    // Step 5: STOP here — do NOT fill MFA/OTP fields
    // The user will manually enter their MFA code or email OTP
    // Keep browser open until user closes it
    await new Promise((resolve) => {{
      browser.on('disconnected', resolve);
    }});
  }} catch (error) {{
    // Keep browser open even on error so user can continue manually
    if (browser) {{
      await new Promise((resolve) => {{
        browser.on('disconnected', resolve);
      }});
    }}
  }}
}})();
"#, npm_root=npm_root_js);

    let tmp_dir = std::env::temp_dir();
    let random_id = uuid::Uuid::new_v4().to_string();
    let script_path = tmp_dir.join(format!("awslh-{}.js", random_id));

    // Write with restrictive permissions
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&script_path).map_err(|e| e.to_string())?;
        file.write_all(script.as_bytes()).map_err(|e| e.to_string())?;
        drop(file);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o600)).ok();
        }
    }

    // Spawn in background — don't block the app
    let child = Command::new(&node_bin)
        .arg(&script_path)
        .env("AWSLH_URL", &url)
        .env("AWSLH_EMAIL", &email)
        .env("AWSLH_PASSWORD", &password)
        .env("AWSLH_CHANNEL", default_channel)
        .env("AWSLH_EXEC_PATH", default_exec_path)
        .env("AWSLH_CLIENT_NAME", &client_name)
        .spawn();

    match child {
        Ok(_) => {
            let path_clone = script_path.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(10));
                let _ = std::fs::remove_file(&path_clone);
            });

            Ok(LoginResponse {
                success: true,
                message: "Browser opened with credentials filled. Complete MFA manually.".to_string(),
                step: "completed".to_string(),
            })
        }
        Err(e) => {
            let _ = std::fs::remove_file(&script_path);
            Err(format!("Failed to start Node.js: {}. Ensure Node.js and Playwright are installed.", e))
        }
    }
}

// ============================================================
// AWS CLI SSO Profile Generator (System-Wide)
// ============================================================

#[tauri::command]
fn generate_aws_config(state: State<AppState>) -> Result<String, String> {
    let db_lock = state.active_db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Vault is locked")?;

    let sql = format!("SELECT {} FROM clients ORDER BY name", COLS);
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let clients: Vec<Client> = stmt.query_map([], row_to_client)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut config = String::from("# AWS SSO Profiles - Auto-generated by AWS Login Hub\n");
    config.push_str("# These profiles are available system-wide in any terminal.\n");
    config.push_str("# Usage: aws sso login --profile <name>  then  aws s3 ls --profile <name>\n");
    config.push_str("# To add missing profiles, edit the client in the app and fill SSO Account ID + Role Name.\n\n");

    let mut generated = 0;

    for client in &clients {
        // Skip clients without SSO account ID (can't generate valid CLI profile)
        if client.sso_account_id.is_empty() || client.sso_role_name.is_empty() {
            config.push_str(&format!("# SKIPPED: {} — missing sso_account_id or sso_role_name. Edit in app to add.\n\n", client.name));
            continue;
        }
        let profile_name = client.name.to_lowercase().replace(' ', "-").replace(['/', '\\', '.'], "");
        config.push_str(&format!("[profile {}]\n", profile_name));
        config.push_str(&format!("sso_start_url = {}\n", client.identity_center_url));
        config.push_str(&format!("sso_region = {}\n", if client.sso_region.is_empty() { "us-east-1" } else { &client.sso_region }));
        config.push_str(&format!("sso_account_id = {}\n", client.sso_account_id));
        config.push_str(&format!("sso_role_name = {}\n", client.sso_role_name));
        config.push_str("sso_registration_scopes = sso:account:access\n");
        config.push_str(&format!("region = {}\n", if client.sso_region.is_empty() { "us-east-1" } else { &client.sso_region }));
        config.push_str("output = json\n");
        config.push('\n');
        generated += 1;
    }

    // Write to ~/.aws/config (system-wide, accessible from any terminal)
    let aws_dir = home_dir().join(".aws");
    std::fs::create_dir_all(&aws_dir).ok();
    let config_path = aws_dir.join("config");

    // Backup existing config before modification
    if config_path.exists() {
        let backup_path = aws_dir.join("config.bak");
        std::fs::copy(&config_path, &backup_path)
            .map_err(|e| format!("Failed to backup ~/.aws/config: {}", e))?;
    }

    // Read existing config and replace auto-generated section
    let existing = std::fs::read_to_string(&config_path).unwrap_or_default();
    let marker_start = "# AWS SSO Profiles - Auto-generated by AWS Login Hub";
    let marker_end = "# END AWS Login Hub profiles";

    let final_config = if existing.contains(marker_start) {
        // Replace existing auto-generated block
        if let Some(start_idx) = existing.find(marker_start) {
            let before = &existing[..start_idx];
            let after = if let Some(end_idx) = existing.find(marker_end) {
                existing[end_idx + marker_end.len()..].trim_start_matches('\n')
            } else {
                ""
            };
            let before_part = before.trim_end();
            let after_part = after.trim();
            let mut result = String::new();
            if !before_part.is_empty() {
                result.push_str(before_part);
                result.push_str("\n\n");
            }
            result.push_str(config.trim_end());
            if !after_part.is_empty() {
                result.push_str("\n\n");
                result.push_str(after_part);
            }
            result
        } else {
            format!("{}\n\n{}", existing.trim_end(), config)
        }
    } else if existing.is_empty() {
        config.clone()
    } else {
        format!("{}\n\n{}", existing.trim_end(), config)
    };

    // Add end marker
    let final_with_marker = format!("{}\n{}\n", final_config.trim_end(), marker_end);

    std::fs::write(&config_path, &final_with_marker)
        .map_err(|e| format!("Failed to write ~/.aws/config: {}", e))?;

    Ok(format!("Generated {} profiles at {}. {} client(s) skipped (missing Account ID or Role Name — edit them in the app).\n\nTo use: aws sso login --profile <name>  then  aws s3 ls --profile <name>", generated, config_path.display(), clients.len() - generated))
}

#[tauri::command]
fn get_aws_profiles(state: State<AppState>) -> Result<Vec<String>, String> {
    let db_lock = state.active_db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Vault is locked")?;

    let sql = format!("SELECT {} FROM clients ORDER BY name", COLS);
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let clients: Vec<Client> = stmt.query_map([], row_to_client)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let profiles: Vec<String> = clients.iter()
        .map(|c| c.name.to_lowercase().replace(' ', "-").replace(['/', '\\', '.'], ""))
        .collect();

    Ok(profiles)
}

// ============================================================
// SSO Token Refresh (System-Wide)
// Runs `aws sso login --profile <name>` for each profile
// After this, any terminal on the machine can use `aws --profile <name>`
// ============================================================

#[derive(Debug, Serialize)]
struct SsoRefreshResult {
    profile: String,
    success: bool,
    message: String,
}

/// Refresh SSO token by running `aws sso login --profile <name>`
/// This opens your default browser to the AWS SSO authorization page.
/// After you authenticate (MFA included), the token is cached at ~/.aws/sso/cache/
/// and available system-wide for all terminals.
#[tauri::command]
fn refresh_sso_token(_state: State<AppState>, profile: String) -> Result<SsoRefreshResult, String> {
    use std::process::Command;

    // First check if the profile exists in ~/.aws/config with required fields
    let config_path = home_dir().join(".aws").join("config");
    let config_content = std::fs::read_to_string(&config_path).unwrap_or_default();

    if !config_content.contains(&format!("[profile {}]", profile)) {
        return Ok(SsoRefreshResult {
            profile: profile.clone(),
            success: false,
            message: format!("Profile '{}' not found in ~/.aws/config. Click 'Sync Profiles' first.", profile),
        });
    }

    if config_content.contains("# SKIPPED: ") {
        // Check if this specific profile was skipped
        let profile_section = format!("[profile {}]", profile);
        if !config_content.contains(&profile_section) {
            return Ok(SsoRefreshResult {
                profile: profile.clone(),
                success: false,
                message: format!("Profile '{}' is incomplete. Edit the client in the app and add: SSO Region, Account ID, and Role Name.", profile),
            });
        }
    }

    // Run aws sso login — this opens the default browser for authentication
    // Kill any previous orphaned sso login processes for this profile
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("pkill")
            .args(["-f", &format!("aws sso login --profile {}", profile)])
            .output()
            .ok();
    }

    #[cfg(target_os = "windows")]
    let child = Command::new("cmd")
        .args(["/C", "aws", "sso", "login", "--profile", &profile])
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let child = Command::new("aws")
        .args(["sso", "login", "--profile", &profile])
        .spawn();

    match child {
        Ok(_) => {
            Ok(SsoRefreshResult {
                profile: profile.clone(),
                success: true,
                message: format!("⚠️  ACTION REQUIRED: Complete login in your browser!\n\nA browser tab has been opened to the AWS SSO device authorization page.\n\n1. Switch to your browser\n2. Enter the device code shown\n3. Complete MFA if prompted\n4. Click 'Approve'\n\nOnce done, the token is cached and you can use:\n  aws --profile {} s3 ls\n  aws --profile {} sts get-caller-identity\n\nfrom any terminal.", profile, profile),
            })
        }
        Err(e) => {
            Ok(SsoRefreshResult {
                profile: profile.clone(),
                success: false,
                message: format!("AWS CLI not found or failed: {}.\n\nInstall AWS CLI: https://aws.amazon.com/cli/", e),
            })
        }
    }
}

#[tauri::command]
fn refresh_all_sso_tokens(state: State<AppState>) -> Result<Vec<SsoRefreshResult>, String> {
    let db_lock = state.active_db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Vault is locked")?;
    let sql = format!("SELECT {} FROM clients ORDER BY name", COLS);
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let clients: Vec<Client> = stmt.query_map([], row_to_client)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);
    drop(db_lock);

    let mut results = Vec::new();
    for client in &clients {
        let profile = client.name.to_lowercase().replace(' ', "-").replace(['/', '\\', '.'], "");
        // We can't recursively call tauri commands with State, so just report them
        results.push(SsoRefreshResult {
            profile,
            success: true,
            message: "Use individual Refresh Token or Login button".to_string(),
        });
    }
    Ok(results)
}

/// Get temporary credentials for a profile (uses cached SSO token)
/// Returns access key, secret key, session token — available until expiry
#[tauri::command]
fn get_sso_credentials(profile: String) -> Result<String, String> {
    use std::process::Command;

    // This uses the cached SSO token to get temporary credentials
    let output = Command::new("aws")
        .args(["sts", "get-caller-identity", "--profile", &profile, "--output", "json"])
        .output()
        .map_err(|e| format!("Failed to run aws cli: {}", e))?;

    if output.status.success() {
        let identity = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(identity)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.contains("Token has expired") || stderr.contains("SSO") {
            Err(format!("SSO token expired for '{}'. Click 'Refresh Token' first.", profile))
        } else {
            Err(format!("Error: {}", stderr.trim()))
        }
    }
}

/// Export temporary credentials as environment variables for a profile
#[tauri::command]
fn export_credentials_env(profile: String) -> Result<String, String> {
    use std::process::Command;

    // Get credentials via aws configure export-credentials
    let output = Command::new("aws")
        .args(["configure", "export-credentials", "--profile", &profile, "--format", "env"])
        .output()
        .map_err(|e| format!("Failed: {}", e))?;

    if output.status.success() {
        let env_vars = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(env_vars)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.contains("Token has expired") || stderr.contains("SSO") {
            Err(format!("SSO token expired. Refresh token for '{}' first.", profile))
        } else {
            Err(format!("Error: {}", stderr.trim()))
        }
    }
}

// ============================================================
// Session Management
// ============================================================

#[tauri::command]
fn get_session_status(state: State<AppState>, id: String) -> Result<String, String> {
    let db_lock = state.active_db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Vault is locked")?;

    let last_login: Option<String> = db.query_row(
        "SELECT last_login FROM clients WHERE id=?1", params![id], |r| r.get(0)
    ).unwrap_or(None);

    match last_login {
        None => Ok("never".to_string()),
        Some(ref ts) => {
            if let Ok(login_time) = chrono::DateTime::parse_from_rfc3339(ts) {
                let elapsed = Utc::now().signed_duration_since(login_time.with_timezone(&Utc));
                if elapsed.num_minutes() < 60 {
                    Ok("active".to_string())
                } else {
                    Ok("expired".to_string())
                }
            } else {
                Ok("unknown".to_string())
            }
        }
    }
}

// ============================================================
// Password Expiration (re-ask after 2 weeks)
// ============================================================

#[tauri::command]
fn check_password_expiry(state: State<AppState>) -> Result<bool, String> {
    let vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_lock.as_ref().ok_or("Vault is locked")?;

    // Check when vault was last unlocked — stored in a marker file
    let marker_path = home_dir()
        .join(".aws-login-hub").join(format!("{}.last_auth", vault.username));

    if let Ok(content) = std::fs::read_to_string(&marker_path) {
        if let Ok(last_auth) = chrono::DateTime::parse_from_rfc3339(content.trim()) {
            let elapsed = Utc::now().signed_duration_since(last_auth.with_timezone(&Utc));
            // Expire after 14 days (2 weeks)
            return Ok(elapsed.num_days() >= 14);
        }
    }
    // No marker = first time, not expired
    Ok(false)
}

#[tauri::command]
fn refresh_password_expiry(state: State<AppState>) -> Result<(), String> {
    let vault_lock = state.active_vault.lock().map_err(|e| e.to_string())?;
    let vault = vault_lock.as_ref().ok_or("Vault is locked")?;

    let marker_path = home_dir()
        .join(".aws-login-hub").join(format!("{}.last_auth", vault.username));

    std::fs::write(&marker_path, Utc::now().to_rfc3339())
        .map_err(|e| format!("Failed to write auth marker: {}", e))
}

// ============================================================
// Terminal - Run AWS CLI commands (restricted + cross-OS)
// ============================================================

/// Allowed command prefixes for security
const ALLOWED_COMMANDS: &[&str] = &[
    "aws ", "aws.exe ",
    "kubectl ", "terraform ", "sam ",
    "echo ", "cat ", "ls ", "dir ", "whoami", "hostname",
    "python ", "python3 ", "node ",
];

#[tauri::command]
fn run_terminal_command(command: String, profile: String) -> Result<String, String> {
    use std::process::Command;

    let trimmed = command.trim();
    let trimmed_lower = trimmed.to_lowercase();

    // Security: reject commands containing shell metacharacters to prevent injection
    const SHELL_METACHARACTERS: &[&str] = &[
        ";", "&&", "||", "|", "`", "$(", "${", ">", "<", ">>",
        "\\n", "\n", "\r", "&", "#",
    ];
    for meta in SHELL_METACHARACTERS {
        if trimmed.contains(meta) {
            return Err(format!(
                "Command rejected: shell operators are not allowed for security reasons.\nRemove '{}' from your command.",
                meta
            ));
        }
    }

    // Security: only allow safe commands
    let allowed = ALLOWED_COMMANDS.iter().any(|prefix| trimmed_lower.starts_with(prefix))
        || trimmed_lower == "whoami"
        || trimmed_lower == "hostname";

    if !allowed {
        return Err(
            "Command not allowed. Only AWS CLI and related tools are permitted.\nAllowed: aws, kubectl, terraform, sam, echo, cat, ls, dir, whoami, hostname, python, node".to_string()
        );
    }

    // Execute command directly without a shell to prevent injection
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Empty command".to_string());
    }

    let mut cmd = Command::new(parts[0]);
    if parts.len() > 1 {
        cmd.args(&parts[1..]);
    }

    if !profile.is_empty() {
        cmd.env("AWS_PROFILE", &profile);
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("{}{}", stdout, stderr))
    }
}

// ============================================================
// Biometric Check (platform detection)
// ============================================================

#[tauri::command]
fn check_biometric_available() -> Result<bool, String> {
    // Check platform-specific biometric availability
    #[cfg(target_os = "linux")]
    {
        // Check for fprintd (fingerprint daemon) on Linux
        let output = std::process::Command::new("fprintd-list")
            .arg(std::env::var("USER").unwrap_or_default())
            .output();
        Ok(output.map(|o| o.status.success()).unwrap_or(false))
    }
    #[cfg(target_os = "macos")]
    {
        // macOS Touch ID — check if biometric enrollment exists
        let output = std::process::Command::new("bioutil")
            .args(["--currentUser", "--enrolled"])
            .output();
        Ok(output.map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            o.status.success() && stdout.contains("1")
        }).unwrap_or(false))
    }
    #[cfg(target_os = "windows")]
    {
        // Windows Hello: check if WinBioEnumBiometricUnits reports available sensors
        // Use PowerShell to query WMI for biometric devices
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command",
                "Get-WmiObject -Namespace 'root\\CIMV2' -Class Win32_PnPEntity | Where-Object { $_.Name -match 'fingerprint|biometric|face|ir camera' } | Select-Object -First 1 | ForEach-Object { 'found' }"])
            .output();
        Ok(output.map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            o.status.success() && stdout.contains("found")
        }).unwrap_or(false))
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Ok(false)
    }
}

// ============================================================
// Main
// ============================================================

fn main() {
    let vault_manager = VaultManager::new();

    // Auto-install Playwright + Chromium in background at startup
    // This runs async so it doesn't block the app from opening
    std::thread::spawn(|| {
        if let Err(e) = ensure_playwright() {
            eprintln!("Playwright setup warning: {}", e);
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            vault_manager,
            active_vault: Mutex::new(None),
            active_db: Mutex::new(None),
            failed_attempts: Mutex::new(std::collections::HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            // User & vault
            get_users, create_user, delete_user,
            unlock_vault, lock_vault, is_vault_unlocked,
            change_master_password, export_vault, import_vault,
            // Clients
            get_clients, get_client, create_client, update_client,
            delete_client, toggle_favorite, search_clients,
            get_dashboard_stats, update_last_login, get_client_password,
            // Login
            run_login,
            // AWS CLI & SSO
            generate_aws_config, get_aws_profiles,
            refresh_sso_token, refresh_all_sso_tokens,
            get_sso_credentials, export_credentials_env,
            // Session
            get_session_status,
            // Password expiration
            check_password_expiry, refresh_password_expiry,
            // Terminal
            run_terminal_command,
            // Biometric
            check_biometric_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ============================================================
// INTEGRATION TESTS
// ============================================================

#[cfg(test)]
mod integration_tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;

    fn setup_test_env() -> (vault::VaultManager, Connection, String) {
        let dir = std::env::temp_dir().join(format!("awslh-integ-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let mut vm = vault::VaultManager::new();
        vm.base_dir = dir.clone();
        vm.create_user("integ_user", "Integration User", "test_pass").unwrap();

        let db_path = dir.join("integ_user.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, identity_center_url TEXT NOT NULL,
                email TEXT NOT NULL, notes TEXT DEFAULT '', tags TEXT DEFAULT '',
                environment TEXT DEFAULT '', favorite INTEGER DEFAULT 0,
                last_login TEXT, status TEXT DEFAULT 'never',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
        ").unwrap();

        (vm, conn, dir.to_string_lossy().to_string())
    }

    fn cleanup(dir: &str) {
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn test_full_client_lifecycle() {
        let (vm, conn, dir) = setup_test_env();
        let mut vault = vm.unlock("integ_user", "test_pass").unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        // CREATE
        let id = uuid::Uuid::new_v4().to_string();
        vault::VaultManager::store_credential(&mut vault, &id, "aws_password_123");
        vm.save_vault(&vault).unwrap();

        conn.execute(
            "INSERT INTO clients (id, name, identity_center_url, email, notes, tags, environment, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, '', 'aws,prod', 'Production', 'never', ?5, ?5)",
            params![id, "Netflix Prod", "https://d-abc123.awsapps.com/start", "user@netflix.com", now],
        ).unwrap();

        // READ
        let client: String = conn.query_row(
            "SELECT name FROM clients WHERE id = ?1", params![id], |r| r.get(0)
        ).unwrap();
        assert_eq!(client, "Netflix Prod");

        // READ CREDENTIAL
        let pw = vault::VaultManager::get_credential(&vault, &id).unwrap();
        assert_eq!(pw, "aws_password_123");

        // UPDATE
        conn.execute("UPDATE clients SET name = 'Netflix Production', favorite = 1 WHERE id = ?1", params![id]).unwrap();
        let updated: String = conn.query_row("SELECT name FROM clients WHERE id = ?1", params![id], |r| r.get(0)).unwrap();
        assert_eq!(updated, "Netflix Production");
        let fav: i32 = conn.query_row("SELECT favorite FROM clients WHERE id = ?1", params![id], |r| r.get(0)).unwrap();
        assert_eq!(fav, 1);

        // UPDATE CREDENTIAL
        vault::VaultManager::store_credential(&mut vault, &id, "new_password_456");
        vm.save_vault(&vault).unwrap();
        drop(vault);
        let vault2 = vm.unlock("integ_user", "test_pass").unwrap();
        assert_eq!(vault::VaultManager::get_credential(&vault2, &id).unwrap(), "new_password_456");

        // DELETE
        conn.execute("DELETE FROM clients WHERE id = ?1", params![id]).unwrap();
        let count: i32 = conn.query_row("SELECT COUNT(*) FROM clients WHERE id = ?1", params![id], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);

        cleanup(&dir);
    }

    #[test]
    fn test_search_functionality() {
        let (_vm, conn, dir) = setup_test_env();
        let now = chrono::Utc::now().to_rfc3339();

        // Insert multiple clients
        for (name, email, env) in [
            ("Netflix Prod", "admin@netflix.com", "Production"),
            ("Netflix Dev", "dev@netflix.com", "Development"),
            ("Adobe Staging", "user@adobe.com", "Staging"),
            ("AWS Internal", "ops@amazon.com", "Production"),
        ] {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO clients (id, name, identity_center_url, email, tags, environment, status, created_at, updated_at) VALUES (?1, ?2, 'https://test.com', ?3, '', ?4, 'never', ?5, ?5)",
                params![id, name, email, env, now],
            ).unwrap();
        }

        // Search by name
        let pattern = "%Netflix%";
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM clients WHERE name LIKE ?1 OR email LIKE ?1").unwrap();
        let count: i32 = stmt.query_row(params![pattern], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);

        // Search by email
        let pattern2 = "%adobe%";
        let count2: i32 = conn.query_row("SELECT COUNT(*) FROM clients WHERE name LIKE ?1 OR email LIKE ?1", params![pattern2], |r| r.get(0)).unwrap();
        assert_eq!(count2, 1);

        // Search by environment
        let pattern3 = "%Production%";
        let count3: i32 = conn.query_row("SELECT COUNT(*) FROM clients WHERE environment LIKE ?1", params![pattern3], |r| r.get(0)).unwrap();
        assert_eq!(count3, 2);

        cleanup(&dir);
    }

    #[test]
    fn test_favorites_and_recent() {
        let (_vm, conn, dir) = setup_test_env();
        let now = chrono::Utc::now().to_rfc3339();

        // Create clients with different states
        let id1 = uuid::Uuid::new_v4().to_string();
        let id2 = uuid::Uuid::new_v4().to_string();
        let id3 = uuid::Uuid::new_v4().to_string();

        conn.execute("INSERT INTO clients (id, name, identity_center_url, email, favorite, last_login, status, created_at, updated_at) VALUES (?1, 'Fav Client', 'https://a.com', 'a@a.com', 1, ?2, 'active', ?2, ?2)", params![id1, now]).unwrap();
        conn.execute("INSERT INTO clients (id, name, identity_center_url, email, favorite, last_login, status, created_at, updated_at) VALUES (?1, 'Recent Client', 'https://b.com', 'b@b.com', 0, ?2, 'active', ?2, ?2)", params![id2, now]).unwrap();
        conn.execute("INSERT INTO clients (id, name, identity_center_url, email, favorite, status, created_at, updated_at) VALUES (?1, 'New Client', 'https://c.com', 'c@c.com', 0, 'never', ?2, ?2)", params![id3, now]).unwrap();

        // Favorites
        let fav_count: i32 = conn.query_row("SELECT COUNT(*) FROM clients WHERE favorite = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(fav_count, 1);

        // Recent (have last_login)
        let recent_count: i32 = conn.query_row("SELECT COUNT(*) FROM clients WHERE last_login IS NOT NULL", [], |r| r.get(0)).unwrap();
        assert_eq!(recent_count, 2);

        // Toggle favorite
        conn.execute("UPDATE clients SET favorite = CASE WHEN favorite=0 THEN 1 ELSE 0 END WHERE id = ?1", params![id2]).unwrap();
        let fav_count2: i32 = conn.query_row("SELECT COUNT(*) FROM clients WHERE favorite = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(fav_count2, 2);

        cleanup(&dir);
    }

    #[test]
    fn test_dashboard_stats() {
        let (_vm, conn, dir) = setup_test_env();
        let now = chrono::Utc::now().to_rfc3339();
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

        // Setup data
        conn.execute("INSERT INTO clients (id, name, identity_center_url, email, favorite, last_login, status, created_at, updated_at) VALUES ('1', 'A', 'https://a.com', 'a@a.com', 1, ?1, 'active', ?1, ?1)", params![now]).unwrap();
        conn.execute("INSERT INTO clients (id, name, identity_center_url, email, favorite, status, created_at, updated_at) VALUES ('2', 'B', 'https://b.com', 'b@b.com', 0, 'never', ?1, ?1)", params![now]).unwrap();
        conn.execute("INSERT INTO clients (id, name, identity_center_url, email, favorite, last_login, status, created_at, updated_at) VALUES ('3', 'C', 'https://c.com', 'c@c.com', 1, ?1, 'active', ?1, ?1)", params![now]).unwrap();

        let total: i32 = conn.query_row("SELECT COUNT(*) FROM clients", [], |r| r.get(0)).unwrap();
        assert_eq!(total, 3);

        let favorites: i32 = conn.query_row("SELECT COUNT(*) FROM clients WHERE favorite=1", [], |r| r.get(0)).unwrap();
        assert_eq!(favorites, 2);

        let logged_today: i32 = conn.query_row("SELECT COUNT(*) FROM clients WHERE last_login LIKE ?1", params![format!("{}%", today)], |r| r.get(0)).unwrap();
        assert_eq!(logged_today, 2);

        cleanup(&dir);
    }

    #[test]
    fn test_vault_export_import_flow() {
        let (vm, _conn, dir) = setup_test_env();

        // Store credentials
        let mut vault = vm.unlock("integ_user", "test_pass").unwrap();
        vault::VaultManager::store_credential(&mut vault, "client-x", "password-x");
        vault::VaultManager::store_credential(&mut vault, "client-y", "password-y");
        vm.save_vault(&vault).unwrap();
        drop(vault);

        // Export: read vault file + users manifest (preserving the user entry)
        let vault_path = vm.vault_path_public("integ_user");
        let export_vault_data = fs::read(&vault_path).unwrap();
        let users_data = fs::read_to_string(std::path::PathBuf::from(&dir).join("users.json")).unwrap();
        assert!(!export_vault_data.is_empty());

        // Simulate import on fresh environment
        let import_dir = std::env::temp_dir().join(format!("awslh-import-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&import_dir).unwrap();
        let mut vm2 = vault::VaultManager::new();
        vm2.base_dir = import_dir.clone();

        // Copy vault file
        fs::write(import_dir.join("integ_user.vault.enc"), &export_vault_data).unwrap();
        // Copy users manifest (preserves salt and password hash)
        fs::write(import_dir.join("users.json"), &users_data).unwrap();
        // Copy DB
        let src_db = std::path::PathBuf::from(&dir).join("integ_user.db");
        fs::copy(&src_db, import_dir.join("integ_user.db")).unwrap();

        // Verify we can unlock and read credentials with the same password
        let vault2 = vm2.unlock("integ_user", "test_pass").unwrap();
        assert_eq!(vault::VaultManager::get_credential(&vault2, "client-x").unwrap(), "password-x");
        assert_eq!(vault::VaultManager::get_credential(&vault2, "client-y").unwrap(), "password-y");

        // Wrong password should fail
        assert!(vm2.unlock("integ_user", "wrong_pass").is_err());

        fs::remove_dir_all(&import_dir).ok();
        cleanup(&dir);
    }
}
