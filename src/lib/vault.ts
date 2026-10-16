import { invoke } from "@tauri-apps/api/core";

export interface Character {
  id: string;
  name: string;
  server: string;
  level: number | null;
  sect: string;
  note: string;
}

export interface AccountSummary {
  id: string;
  title: string;
  username: string;
  note: string;
  characters: Character[];
}

export interface VaultStatus {
  unlocked: boolean;
  path: string | null;
  name: string | null;
  helloAvailable: boolean;
  helloEnabled: boolean;
}

export interface AccountInput {
  title: string;
  username: string;
  password: string;
  note: string;
  characters: Character[];
}

export function getVaultStatus(): Promise<VaultStatus> {
  return invoke("vault_status");
}

export function getDefaultVaultPath(): Promise<string> {
  return invoke("vault_default_path");
}

export function createVault(
  path: string | null,
  password: string,
  useKeyFile: boolean,
): Promise<VaultStatus> {
  return invoke("vault_create", { path, password, useKeyFile });
}

export function openVault(
  path: string,
  password: string,
  keyFile: string | null,
): Promise<VaultStatus> {
  return invoke("vault_open", {
    path,
    credentials: { password, keyFile, keyFileBase64: null },
  });
}

export function lockVault(): Promise<void> {
  return invoke("vault_lock");
}

export function listAccounts(): Promise<AccountSummary[]> {
  return invoke("accounts_list");
}

export function saveAccount(
  id: string | null,
  input: AccountInput,
): Promise<AccountSummary> {
  return invoke("account_save", { id, input });
}

export function deleteAccount(id: string): Promise<void> {
  return invoke("account_delete", { id });
}

export function getAccountCredentials(
  id: string,
): Promise<[string, string]> {
  return invoke("account_credentials", { id });
}

export function enableHello(
  path: string,
  password: string,
  keyFile: string | null,
): Promise<void> {
  return invoke("hello_enable", { path, password, keyFile });
}

export function disableHello(): Promise<void> {
  return invoke("hello_disable");
}

export function unlockWithHello(): Promise<VaultStatus> {
  return invoke("hello_unlock");
}
