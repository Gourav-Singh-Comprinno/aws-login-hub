export interface Client {
  id: string;
  name: string;
  identity_center_url: string;
  email: string;
  sso_region: string;
  sso_account_id: string;
  sso_role_name: string;
  notes: string;
  tags: string;
  environment: string;
  favorite: boolean;
  last_login: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateClientRequest {
  name: string;
  identity_center_url: string;
  email: string;
  password: string;
  sso_region?: string;
  sso_account_id?: string;
  sso_role_name?: string;
  notes?: string;
  tags?: string;
  environment?: string;
}

export interface UpdateClientRequest {
  name?: string;
  identity_center_url?: string;
  email?: string;
  password?: string;
  sso_region?: string;
  sso_account_id?: string;
  sso_role_name?: string;
  notes?: string;
  tags?: string;
  environment?: string;
  favorite?: boolean;
}

export interface DashboardStats {
  total_clients: number;
  favorites: number;
  logged_in_today: number;
  recent_clients: Client[];
}

export type Page = "dashboard" | "clients" | "favorites" | "recent" | "terminal" | "settings";
