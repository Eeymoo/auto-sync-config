/**
 * 剑网3 启动器核心逻辑(纯前端,基于 Tauri 插件)。
 *
 * - 版本检查:本地 version.cfg 与 CDN 上 autoupdateentry.txt 比对
 * - 启动游戏:直接启动 / 启动器启动(带 DOTNOTSTARTGAMEBYJX3CLIENT.EXE 参数)
 * - 游戏路径:localStorage 持久化
 */
import { fetch } from "@tauri-apps/plugin-http";
import { readFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

/** 自动更新 CDN 节点,按优先级依次尝试。 */
const CDN_NODES = [
  "https://jx3hdv4ks-autoupdate.xoyocdn.com", // 金山
  "https://jx3hdv4qq-autoupdate.xoyocdn.com", // 腾讯
  "https://jx3hdv4hsyq-autoupdate.xoyocdn.com", // 华为
];
const ENTRY_PATH = "/jx3hd_v4/zhcn_hd/autoupdateentry.txt";

const STORAGE_KEY = "auto-sync-config.gamePath";

export interface UpdateCheckResult {
  /** true=版本不一致, false=版本相同, null=判断不了(网络故障或未配置路径) */
  needsUpdate: boolean | null;
  localVersion: string | null;
  remoteVersion: string | null;
}

/* ---------- 游戏路径 ---------- */

export function getGamePath(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setGamePath(path: string): void {
  localStorage.setItem(STORAGE_KEY, path);
}

/** 游戏路径是否可用(检查客户端 exe 是否存在)。 */
export async function isGamePathValid(gamePath: string): Promise<boolean> {
  if (!gamePath) return false;
  try {
    return await exists(await join(gamePath, "bin64", "JX3ClientX64.exe"));
  } catch {
    return false;
  }
}

/* ---------- 版本检查 ---------- */

/** 本地版本:version.cfg 里 Sword3.version=1-5-0-9986 -> 1.5.0.9986 */
async function getLocalVersion(gamePath: string): Promise<string | null> {
  try {
    // version.cfg may contain GBK text. The version key itself is ASCII.
    const bytes = await readFile(await join(gamePath, "version.cfg"));
    const text = new TextDecoder("latin1").decode(bytes);
    const m = /^Sword3\.version\s*=\s*([0-9\-.]+)/m.exec(text);
    return m ? m[1].replace(/-/g, ".") : null;
  } catch (e) {
    console.warn("[version] read local version.cfg failed:", e);
    return null;
  }
}

/** 远程最新版本:autoupdateentry.txt 第一段的 LatestVersion= */
async function getRemoteVersion(): Promise<string | null> {
  for (const node of CDN_NODES) {
    try {
      const url = `${node}${ENTRY_PATH}?_r=${Math.floor(Date.now() / 1000)}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "XLauncher" },
        connectTimeout: 10000,
      });
      if (!resp.ok) {
        console.warn(`[version] ${node} HTTP ${resp.status}`);
        continue;
      }
      const text = await resp.text();
      const m = /^LatestVersion\s*=\s*([0-9.]+)/m.exec(text);
      if (m) return m[1];
      console.warn(`[version] ${node} response missing LatestVersion`);
    } catch (e) {
      console.warn(`[version] ${node} failed:`, e);
      continue; // 这个节点挂了,换下一个
    }
  }
  return null;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkUpdate(gamePath: string): Promise<UpdateCheckResult> {
  const [localVersion, remoteVersion] = await Promise.all([
    getLocalVersion(gamePath),
    getRemoteVersion(),
  ]);
  console.log(`[version] local=${localVersion} remote=${remoteVersion}`);

  if (localVersion === null || remoteVersion === null) {
    return { needsUpdate: null, localVersion, remoteVersion };
  }
  return {
    needsUpdate: compareVersions(localVersion, remoteVersion) !== 0,
    localVersion,
    remoteVersion,
  };
}

/* ---------- 启动游戏 ---------- */

/** 直接启动:JX3ClientX64.exe DOTNOTSTARTGAMEBYJX3CLIENT.EXE */
export async function launchGameDirect(gamePath: string): Promise<void> {
  const exe = await join(gamePath, "bin64", "JX3ClientX64.exe");
  await invoke("launch_program", {
    exe,
    args: ["DOTNOTSTARTGAMEBYJX3CLIENT.EXE"],
  });
}

/** 启动器启动:JX3ClientX64.exe(不带参数,会自动唤醒官方启动器) */
export async function launchGameViaLauncher(gamePath: string): Promise<void> {
  const exe = await join(gamePath, "bin64", "JX3ClientX64.exe");
  await invoke("launch_program", { exe, args: [] });
}
