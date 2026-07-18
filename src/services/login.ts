import { invoke } from "@tauri-apps/api/core";
import { api } from "./api";
import type { Client } from "../types";

export type LoginStep =
  | "launching"
  | "navigating"
  | "filling_email"
  | "submitting_email"
  | "filling_password"
  | "submitting_password"
  | "waiting_mfa"
  | "completed"
  | "failed";

export interface LoginProgress {
  step: LoginStep;
  message: string;
}

/**
 * Performs login by invoking the Rust backend which handles Playwright execution.
 * The Rust backend writes a script, runs it via Node.js, and streams progress.
 */
export async function performLogin(
  client: Client,
  onProgress: (progress: LoginProgress) => void
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress({ step: "launching", message: "Retrieving credentials..." });

    // Get password from secure store
    const password = await api.getClientPassword(client.id);

    onProgress({ step: "launching", message: "Launching browser automation..." });

    // Call Rust backend to execute the login
    const result = await invoke<{ success: boolean; message: string; step: string }>("run_login", {
      url: client.identity_center_url,
      email: client.email,
      password: password,
      clientId: client.id,
    });

    if (result.success) {
      onProgress({ step: "completed", message: "Login successful! AWS Console is open." });
      await api.updateLastLogin(client.id);
      return { success: true, message: "Login completed" };
    } else {
      onProgress({ step: "failed", message: result.message });
      return { success: false, message: result.message };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onProgress({ step: "failed", message });
    return { success: false, message };
  }
}
