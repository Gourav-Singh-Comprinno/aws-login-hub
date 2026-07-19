//! Encrypted Vault - Argon2id key derivation + AES-256-GCM encryption
//!
//! Each user gets their own vault file. Vault is encrypted at rest.
//! Master password is never stored - only used to derive the encryption key.
//! Key is held in memory only while vault is unlocked, zeroed on lock.

use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use zeroize::Zeroize;

// ============================================================
// Vault Data Structures
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultData {
    pub credentials: HashMap<String, CredentialEntry>,
    pub version: u32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CredentialEntry {
    pub password: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserProfile {
    pub username: String,
    pub display_name: String,
    pub created_at: String,
    /// Argon2id hash of master password (for verification only)
    pub password_hash: String,
    /// Salt used for key derivation (hex encoded)
    pub salt: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UsersManifest {
    pub users: Vec<UserProfile>,
}

// ============================================================
// Vault State (held in memory while unlocked)
// ============================================================

pub struct UnlockedVault {
    pub username: String,
    pub data: VaultData,
    encryption_key: Vec<u8>, // 32 bytes, zeroed on lock
}

impl std::fmt::Debug for UnlockedVault {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("UnlockedVault")
            .field("username", &self.username)
            .field("data", &self.data)
            .field("encryption_key", &"[REDACTED]")
            .finish()
    }
}

impl Drop for UnlockedVault {
    fn drop(&mut self) {
        self.encryption_key.zeroize();
    }
}

// ============================================================
// Vault Operations
// ============================================================

pub struct VaultManager {
    pub(crate) base_dir: PathBuf,
}

impl VaultManager {
    pub fn new() -> Self {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("APPDATA"))
            .unwrap_or_else(|_| ".".to_string());
        let mut base_dir = PathBuf::from(home);
        base_dir.push(".aws-login-hub");
        fs::create_dir_all(&base_dir).ok();
        VaultManager { base_dir }
    }

    /// Path to the users manifest file
    fn manifest_path(&self) -> PathBuf {
        self.base_dir.join("users.json")
    }

    /// Path to a user's vault file
    fn vault_path(&self, username: &str) -> PathBuf {
        let safe_name = username.replace(['/', '\\', '.', ' '], "_");
        self.base_dir.join(format!("{}.vault.enc", safe_name))
    }

    /// Public access to vault path (for export/import)
    pub fn vault_path_public(&self, username: &str) -> PathBuf {
        self.vault_path(username)
    }

    /// Path to a user's database file
    pub fn db_path(&self, username: &str) -> PathBuf {
        let safe_name = username.replace(['/', '\\', '.', ' '], "_");
        self.base_dir.join(format!("{}.db", safe_name))
    }

    // ========================================================
    // User Management
    // ========================================================

    pub fn load_users(&self) -> Vec<UserProfile> {
        let path = self.manifest_path();
        if !path.exists() {
            return vec![];
        }
        match fs::read_to_string(&path) {
            Ok(content) => {
                serde_json::from_str::<UsersManifest>(&content)
                    .map(|m| m.users)
                    .unwrap_or_default()
            }
            Err(_) => vec![],
        }
    }

    fn save_users(&self, users: &[UserProfile]) -> Result<(), String> {
        let manifest = UsersManifest { users: users.to_vec() };
        let json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("Failed to serialize users: {}", e))?;
        fs::write(self.manifest_path(), json)
            .map_err(|e| format!("Failed to write users file: {}", e))
    }

    /// Public access to save_users (for import rollback)
    pub fn save_users_public(&self, users: &[UserProfile]) -> Result<(), String> {
        self.save_users(users)
    }

    pub fn create_user(&self, username: &str, display_name: &str, master_password: &str) -> Result<UserProfile, String> {
        let mut users = self.load_users();

        // Check if username already exists
        if users.iter().any(|u| u.username == username) {
            return Err("Username already exists".to_string());
        }

        // Generate salt
        let salt = SaltString::generate(&mut OsRng);

        // Hash password for verification
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(master_password.as_bytes(), &salt)
            .map_err(|e| format!("Failed to hash password: {}", e))?
            .to_string();

        let profile = UserProfile {
            username: username.to_string(),
            display_name: display_name.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            password_hash,
            salt: salt.to_string(),
        };

        // Create empty vault
        let empty_vault = VaultData {
            credentials: HashMap::new(),
            version: 1,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let key = self.derive_key(master_password, salt.as_ref())?;
        self.encrypt_and_save(&profile.username, &empty_vault, &key)?;

        users.push(profile.clone());
        self.save_users(&users)?;

        Ok(profile)
    }

    pub fn delete_user(&self, username: &str) -> Result<(), String> {
        let mut users = self.load_users();
        users.retain(|u| u.username != username);
        self.save_users(&users)?;

        // Delete vault file
        let vault_path = self.vault_path(username);
        if vault_path.exists() {
            fs::remove_file(&vault_path).ok();
        }

        // Delete database file
        let db_path = self.db_path(username);
        if db_path.exists() {
            fs::remove_file(&db_path).ok();
        }

        Ok(())
    }

    /// Register a user from an imported vault backup (legacy: generates new salt)
    pub fn register_imported_user(&self, username: &str, master_password: &str) -> Result<(), String> {
        let mut users = self.load_users();
        if users.iter().any(|u| u.username == username) {
            return Ok(()); // Already registered
        }

        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(master_password.as_bytes(), &salt)
            .map_err(|e| format!("Hash failed: {}", e))?
            .to_string();

        users.push(UserProfile {
            username: username.to_string(),
            display_name: username.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            password_hash,
            salt: salt.to_string(),
        });

        self.save_users(&users)
    }

    /// Register a user from an imported vault backup using the original profile data.
    /// This preserves the salt and password_hash so the vault can be decrypted correctly.
    pub fn register_imported_profile(&self, profile: &UserProfile) -> Result<(), String> {
        let mut users = self.load_users();
        if users.iter().any(|u| u.username == profile.username) {
            return Ok(()); // Already registered
        }
        users.push(profile.clone());
        self.save_users(&users)
    }

    // ========================================================
    // Vault Unlock / Lock
    // ========================================================

    pub fn unlock(&self, username: &str, master_password: &str) -> Result<UnlockedVault, String> {
        let users = self.load_users();
        let profile = users.iter()
            .find(|u| u.username == username)
            .ok_or_else(|| "User not found".to_string())?;

        // Verify master password
        self.verify_password(master_password, &profile.password_hash)?;

        // Derive encryption key
        let key = self.derive_key(master_password, &profile.salt)?;

        // Decrypt vault
        let data = self.decrypt_vault(username, &key)?;

        Ok(UnlockedVault {
            username: username.to_string(),
            data,
            encryption_key: key,
        })
    }

    pub fn save_vault(&self, vault: &UnlockedVault) -> Result<(), String> {
        self.encrypt_and_save(&vault.username, &vault.data, &vault.encryption_key)
    }

    pub fn change_master_password(
        &self,
        username: &str,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), String> {
        // Unlock with current password
        let vault = self.unlock(username, current_password)?;

        // Generate new salt
        let new_salt = SaltString::generate(&mut OsRng);

        // Hash new password
        let argon2 = Argon2::default();
        let new_hash = argon2
            .hash_password(new_password.as_bytes(), &new_salt)
            .map_err(|e| format!("Failed to hash new password: {}", e))?
            .to_string();

        // Derive new key and re-encrypt vault
        let new_key = self.derive_key(new_password, new_salt.as_ref())?;
        self.encrypt_and_save(&vault.username, &vault.data, &new_key)?;

        // Update user profile
        let mut users = self.load_users();
        if let Some(user) = users.iter_mut().find(|u| u.username == username) {
            user.password_hash = new_hash;
            user.salt = new_salt.to_string();
        }
        self.save_users(&users)?;

        Ok(())
    }

    // ========================================================
    // Credential Operations (on unlocked vault)
    // ========================================================

    pub fn store_credential(vault: &mut UnlockedVault, client_id: &str, password: &str) {
        vault.data.credentials.insert(
            client_id.to_string(),
            CredentialEntry {
                password: password.to_string(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        );
    }

    pub fn get_credential(vault: &UnlockedVault, client_id: &str) -> Result<String, String> {
        vault.data.credentials
            .get(client_id)
            .map(|e| e.password.clone())
            .ok_or_else(|| "Credential not found".to_string())
    }

    pub fn delete_credential(vault: &mut UnlockedVault, client_id: &str) {
        vault.data.credentials.remove(client_id);
    }

    // ========================================================
    // Encryption Internals
    // ========================================================

    fn derive_key(&self, password: &str, salt_str: &str) -> Result<Vec<u8>, String> {
        // Use SHA-256 of salt as the actual salt bytes for Argon2
        let mut hasher = Sha256::new();
        hasher.update(salt_str.as_bytes());
        let salt_bytes = hasher.finalize();

        let mut key = vec![0u8; 32];
        let argon2 = Argon2::new(
            argon2::Algorithm::Argon2id,
            argon2::Version::V0x13,
            argon2::Params::new(65536, 3, 1, Some(32))
                .map_err(|e| format!("Argon2 params error: {}", e))?,
        );

        argon2
            .hash_password_into(password.as_bytes(), &salt_bytes[..16], &mut key)
            .map_err(|e| format!("Key derivation failed: {}", e))?;

        Ok(key)
    }

    fn verify_password(&self, password: &str, hash: &str) -> Result<(), String> {
        use argon2::PasswordHash;
        use argon2::PasswordVerifier;

        let parsed_hash = PasswordHash::new(hash)
            .map_err(|e| format!("Invalid hash format: {}", e))?;

        Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .map_err(|_| "Invalid master password".to_string())
    }

    fn encrypt_and_save(&self, username: &str, data: &VaultData, key: &[u8]) -> Result<(), String> {
        let plaintext = serde_json::to_vec(data)
            .map_err(|e| format!("Failed to serialize vault: {}", e))?;

        // Generate random nonce (12 bytes for AES-256-GCM)
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Encrypt
        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Cipher init failed: {}", e))?;
        let ciphertext = cipher.encrypt(nonce, plaintext.as_ref())
            .map_err(|e| format!("Encryption failed: {}", e))?;

        // Write: nonce (12) + ciphertext
        let mut output = Vec::with_capacity(12 + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        let vault_path = self.vault_path(username);
        fs::write(&vault_path, &output)
            .map_err(|e| format!("Failed to write vault: {}", e))
    }

    fn decrypt_vault(&self, username: &str, key: &[u8]) -> Result<VaultData, String> {
        let vault_path = self.vault_path(username);
        if !vault_path.exists() {
            // Return empty vault if file doesn't exist yet
            return Ok(VaultData {
                credentials: HashMap::new(),
                version: 1,
                created_at: chrono::Utc::now().to_rfc3339(),
            });
        }

        let data = fs::read(&vault_path)
            .map_err(|e| format!("Failed to read vault: {}", e))?;

        if data.len() < 12 {
            return Err("Vault file is corrupted (too small)".to_string());
        }

        let nonce = Nonce::from_slice(&data[..12]);
        let ciphertext = &data[12..];

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Cipher init failed: {}", e))?;
        let plaintext = cipher.decrypt(nonce, ciphertext)
            .map_err(|_| "Decryption failed - wrong master password or corrupted vault".to_string())?;

        serde_json::from_slice(&plaintext)
            .map_err(|e| format!("Failed to parse vault data: {}", e))
    }
}

// ============================================================
// UNIT TESTS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn test_vault_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("aws-login-hub-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn create_test_manager() -> (VaultManager, PathBuf) {
        let dir = test_vault_dir();
        let mut vm = VaultManager::new();
        vm.base_dir = dir.clone();
        (vm, dir)
    }

    // --- VaultManager Tests ---

    #[test]
    fn test_create_user_success() {
        let (vm, dir) = create_test_manager();
        let result = vm.create_user("testuser", "Test User", "password123");
        assert!(result.is_ok());
        let profile = result.unwrap();
        assert_eq!(profile.username, "testuser");
        assert_eq!(profile.display_name, "Test User");
        // Verify files created
        assert!(dir.join("testuser.vault.enc").exists());
        assert!(dir.join("users.json").exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_create_duplicate_user_fails() {
        let (vm, dir) = create_test_manager();
        vm.create_user("dup", "Dup", "pass123").unwrap();
        let result = vm.create_user("dup", "Dup Again", "pass456");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_unlock_with_correct_password() {
        let (vm, dir) = create_test_manager();
        vm.create_user("alice", "Alice", "correct_pass").unwrap();
        let result = vm.unlock("alice", "correct_pass");
        assert!(result.is_ok());
        let vault = result.unwrap();
        assert_eq!(vault.username, "alice");
        assert!(vault.data.credentials.is_empty());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_unlock_with_wrong_password_fails() {
        let (vm, dir) = create_test_manager();
        vm.create_user("bob", "Bob", "real_pass").unwrap();
        let result = vm.unlock("bob", "wrong_pass");
        assert!(result.is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_unlock_nonexistent_user_fails() {
        let (vm, dir) = create_test_manager();
        let result = vm.unlock("nobody", "pass");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_store_and_retrieve_credential() {
        let (vm, dir) = create_test_manager();
        vm.create_user("cred_user", "Cred", "mypass").unwrap();
        let mut vault = vm.unlock("cred_user", "mypass").unwrap();

        // Store
        VaultManager::store_credential(&mut vault, "client-123", "s3cr3t_pw");
        vm.save_vault(&vault).unwrap();
        drop(vault);

        // Retrieve (re-unlock to ensure persistence)
        let vault2 = vm.unlock("cred_user", "mypass").unwrap();
        let pw = VaultManager::get_credential(&vault2, "client-123");
        assert!(pw.is_ok());
        assert_eq!(pw.unwrap(), "s3cr3t_pw");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_delete_credential() {
        let (vm, dir) = create_test_manager();
        vm.create_user("del_user", "Del", "pass").unwrap();
        let mut vault = vm.unlock("del_user", "pass").unwrap();

        VaultManager::store_credential(&mut vault, "to-delete", "password");
        VaultManager::delete_credential(&mut vault, "to-delete");
        vm.save_vault(&vault).unwrap();

        let result = VaultManager::get_credential(&vault, "to-delete");
        assert!(result.is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_multiple_credentials() {
        let (vm, dir) = create_test_manager();
        vm.create_user("multi", "Multi", "pass").unwrap();
        let mut vault = vm.unlock("multi", "pass").unwrap();

        VaultManager::store_credential(&mut vault, "client-1", "pw1");
        VaultManager::store_credential(&mut vault, "client-2", "pw2");
        VaultManager::store_credential(&mut vault, "client-3", "pw3");
        vm.save_vault(&vault).unwrap();
        drop(vault);

        let vault2 = vm.unlock("multi", "pass").unwrap();
        assert_eq!(VaultManager::get_credential(&vault2, "client-1").unwrap(), "pw1");
        assert_eq!(VaultManager::get_credential(&vault2, "client-2").unwrap(), "pw2");
        assert_eq!(VaultManager::get_credential(&vault2, "client-3").unwrap(), "pw3");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_change_master_password() {
        let (vm, dir) = create_test_manager();
        vm.create_user("change", "Change", "old_pass").unwrap();
        let mut vault = vm.unlock("change", "old_pass").unwrap();
        VaultManager::store_credential(&mut vault, "my-client", "secret");
        vm.save_vault(&vault).unwrap();
        drop(vault);

        // Change password
        vm.change_master_password("change", "old_pass", "new_pass").unwrap();

        // Old password should fail
        assert!(vm.unlock("change", "old_pass").is_err());

        // New password should work and data preserved
        let vault2 = vm.unlock("change", "new_pass").unwrap();
        assert_eq!(VaultManager::get_credential(&vault2, "my-client").unwrap(), "secret");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_delete_user() {
        let (vm, dir) = create_test_manager();
        vm.create_user("to_delete", "Delete Me", "pass").unwrap();
        assert!(dir.join("to_delete.vault.enc").exists());

        vm.delete_user("to_delete").unwrap();
        assert!(!dir.join("to_delete.vault.enc").exists());
        let users = vm.load_users();
        assert!(users.iter().all(|u| u.username != "to_delete"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_user_isolation() {
        let (vm, dir) = create_test_manager();
        vm.create_user("user_a", "User A", "pass_a").unwrap();
        vm.create_user("user_b", "User B", "pass_b").unwrap();

        // User A stores a credential
        let mut vault_a = vm.unlock("user_a", "pass_a").unwrap();
        VaultManager::store_credential(&mut vault_a, "secret-client", "a_secret");
        vm.save_vault(&vault_a).unwrap();
        drop(vault_a);

        // User B cannot see User A's credential
        let vault_b = vm.unlock("user_b", "pass_b").unwrap();
        let result = VaultManager::get_credential(&vault_b, "secret-client");
        assert!(result.is_err()); // Not found in B's vault

        // User B cannot unlock with User A's password
        assert!(vm.unlock("user_a", "pass_b").is_err());
        assert!(vm.unlock("user_b", "pass_a").is_err());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_vault_encryption_is_not_plaintext() {
        let (vm, dir) = create_test_manager();
        vm.create_user("enc_test", "Enc", "mypass").unwrap();
        let mut vault = vm.unlock("enc_test", "mypass").unwrap();
        VaultManager::store_credential(&mut vault, "test", "super_secret_password_12345");
        vm.save_vault(&vault).unwrap();

        // Read raw vault file
        let raw = fs::read(dir.join("enc_test.vault.enc")).unwrap();
        let raw_str = String::from_utf8_lossy(&raw);
        // Password should NOT appear in plaintext
        assert!(!raw_str.contains("super_secret_password_12345"));
        // File should have nonce (12 bytes) + ciphertext
        assert!(raw.len() > 12);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_register_imported_user() {
        let (vm, dir) = create_test_manager();
        vm.create_user("original", "Original", "pass").unwrap();

        // Simulate import by calling register
        vm.register_imported_user("imported", "import_pass").unwrap();

        let users = vm.load_users();
        assert!(users.iter().any(|u| u.username == "imported"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_load_users_empty() {
        let (vm, dir) = create_test_manager();
        let users = vm.load_users();
        assert!(users.is_empty());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_special_characters_in_password() {
        let (vm, dir) = create_test_manager();
        let special_pass = r#"p@$$w0rd!#%^&*(){}[]|\"';:<>,.?/~`"#;
        vm.create_user("special", "Special", special_pass).unwrap();

        let mut vault = vm.unlock("special", special_pass).unwrap();
        VaultManager::store_credential(&mut vault, "client", "also!@#$%special");
        vm.save_vault(&vault).unwrap();
        drop(vault);

        let vault2 = vm.unlock("special", special_pass).unwrap();
        assert_eq!(VaultManager::get_credential(&vault2, "client").unwrap(), "also!@#$%special");
        fs::remove_dir_all(&dir).ok();
    }
}
