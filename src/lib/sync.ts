import { invoke } from "@tauri-apps/api/core";

const SHOW_VARIANT_SETTINGS_KEY =
  "auto-sync-config.showSyncVariantSettings";

export interface SyncRole {
  account: string;
  area: string;
  server: string;
  role: string;
}

export interface SyncVariantSummary {
  id: string;
  label: string;
}

export interface SyncGroupSummary {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
}

export interface SyncAdapterSummary {
  id: string;
  name: string;
  version: string;
  variants: SyncVariantSummary[];
  groups: SyncGroupSummary[];
}

export interface RoleEndpoint {
  root: string;
  variant: string;
  role: SyncRole;
}

export interface SyncRequest {
  adapterId: string;
  source: RoleEndpoint;
  target: RoleEndpoint;
  /** 空数组表示使用适配源的默认分组。 */
  groups: string[];
}

export type SyncAction = "create" | "replace" | "unchanged";

export interface PlannedFile {
  groupId: string;
  ruleId: string;
  logicalPath: string;
  source: string;
  target: string;
  size: number;
  sha256: string;
  action: SyncAction;
}

export interface SyncPlan {
  adapterId: string;
  adapterVersion: string;
  sourceDataRoot: string;
  targetDataRoot: string;
  groups: string[];
  files: PlannedFile[];
  warnings: string[];
}

export type TransactionState =
  | "preparing"
  | "committed"
  | "rolledBack"
  | "failed";

export interface SyncExecutionResult {
  transactionId: string;
  changedFiles: number;
  unchangedFiles: number;
  historyPath: string;
  warnings: string[];
}

export interface SyncTransitionResult {
  transactionId: string;
  state: TransactionState;
  restoredFiles: number;
}

export interface TransactionSummary {
  id: string;
  adapterId: string;
  adapterVersion: string;
  createdUnixMs: number;
  state: TransactionState;
  fileCount: number;
  targetDataRoot: string;
}

export function getSyncSourceDirectory(): Promise<string> {
  return invoke("sync_source_directory");
}

export function materializeAdapterSource(adapterId: string): Promise<string> {
  return invoke("sync_materialize_adapter_source", { adapterId });
}

export function listSyncAdapters(): Promise<SyncAdapterSummary[]> {
  return invoke("sync_list_adapters");
}

export function scanSyncRoles(
  adapterId: string,
  root: string,
  variant: string,
): Promise<SyncRole[]> {
  return invoke("sync_scan_roles", { adapterId, root, variant });
}

export function createSyncPlan(request: SyncRequest): Promise<SyncPlan> {
  return invoke("sync_plan", { request });
}

export function executeSync(
  request: SyncRequest,
): Promise<SyncExecutionResult> {
  return invoke("sync_execute", { request });
}

export function listSyncTransactions(): Promise<TransactionSummary[]> {
  return invoke("sync_list_transactions");
}

export function undoSync(
  transactionId: string,
): Promise<SyncTransitionResult> {
  return invoke("sync_undo", { transactionId });
}

export function redoSync(
  transactionId: string,
): Promise<SyncTransitionResult> {
  return invoke("sync_redo", { transactionId });
}

export function getShowSyncVariantSettings(): boolean {
  return localStorage.getItem(SHOW_VARIANT_SETTINGS_KEY) === "true";
}

export function setShowSyncVariantSettings(value: boolean): void {
  localStorage.setItem(SHOW_VARIANT_SETTINGS_KEY, String(value));
}
