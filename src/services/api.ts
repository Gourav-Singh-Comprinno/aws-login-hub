import { invoke } from "@tauri-apps/api/core";
import type { Client, CreateClientRequest } from "../types";

export interface UserInfo {
  username: string;
  display_name: string;
  created_at: string;
}

export const api = {
  // User & Vault
  async getUsers(): Promise<UserInfo[]> { return invoke("get_users"); },
  async createUser(username: string, displayName: string, masterPassword: string): Promise<UserInfo> {
    return invoke("create_user", { username, displayName, masterPassword });
  },
  async deleteUser(username: string, masterPassword: string): Promise<void> {
    return invoke("delete_user", { username, masterPassword });
  },
  async unlockVault(username: string, masterPassword: string): Promise<UserInfo> {
    return invoke("unlock_vault", { username, masterPassword });
  },
  async lockVault(): Promise<void> { return invoke("lock_vault"); },
  async isVaultUnlocked(): Promise<boolean> { return invoke("is_vault_unlocked"); },
  async changeMasterPassword(username: string, currentPassword: string, newPassword: string): Promise<void> {
    return invoke("change_master_password", { username, currentPassword, newPassword });
  },
  async exportVault(destination: string): Promise<{ path: string; size: number }> {
    return invoke("export_vault", { destination });
  },
  async importVault(filePath: string, masterPassword: string): Promise<UserInfo> {
    return invoke("import_vault", { filePath, masterPassword });
  },

  // Clients
  async getClients(): Promise<Client[]> { return invoke("get_clients"); },
  async getClient(id: string): Promise<Client> { return invoke("get_client", { id }); },
  async createClient(request: CreateClientRequest): Promise<Client> { return invoke("create_client", { request }); },
  async updateClient(id: string, request: Record<string, string | undefined>): Promise<Client> { return invoke("update_client", { id, request }); },
  async deleteClient(id: string): Promise<void> { return invoke("delete_client", { id }); },
  async toggleFavorite(id: string): Promise<Client> { return invoke("toggle_favorite", { id }); },
  async searchClients(query: string): Promise<Client[]> { return invoke("search_clients", { query }); },
  async updateLastLogin(id: string): Promise<void> { return invoke("update_last_login", { id }); },
  async getClientPassword(id: string): Promise<string> { return invoke("get_client_password", { id }); },

  // Login (opens Chrome with auto-fill, non-blocking)
  async runLogin(url: string, email: string, password: string, clientId: string): Promise<{ success: boolean; message: string }> {
    return invoke("run_login", { url, email, password, clientId });
  },

  // AWS CLI & SSO
  async generateAwsConfig(): Promise<string> { return invoke("generate_aws_config"); },
  async getAwsProfiles(): Promise<string[]> { return invoke("get_aws_profiles"); },
  async refreshSsoToken(profile: string): Promise<{ profile: string; success: boolean; message: string }> {
    return invoke("refresh_sso_token", { profile });
  },

  // Password Expiration
  async checkPasswordExpiry(): Promise<boolean> { return invoke("check_password_expiry"); },
  async refreshPasswordExpiry(): Promise<void> { return invoke("refresh_password_expiry"); },
};
