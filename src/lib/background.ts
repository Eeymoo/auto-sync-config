import bg1 from "@/assets/bg-1.webp";
import bg2 from "@/assets/bg-2.webp";
import bg3 from "@/assets/bg-3.webp";
import bg4 from "@/assets/bg-4.webp";
import bg5 from "@/assets/bg-5.webp";
import bg6 from "@/assets/bg-6.webp";

export interface BackgroundOption {
  id: string;
  label: string;
  src: string;
}

/** 首页背景候选图,与设置里的固定选项一一对应。 */
export const BACKGROUNDS: BackgroundOption[] = [
  { id: "bg1", label: "花海蝶舞", src: bg1 },
  { id: "bg2", label: "星河照影", src: bg2 },
  { id: "bg3", label: "竹林逢雨", src: bg3 },
  { id: "bg4", label: "金辉圣殿", src: bg4 },
  { id: "bg5", label: "月夜孤锋", src: bg5 },
  { id: "bg6", label: "紫袂流萤", src: bg6 },
];

/** 固定模式保存所选项;随机模式保存最近一次的抽取结果,避免启动时闪图。 */
const MODE_KEY = "auto-sync-config.backgroundMode";
const FIXED_KEY = "auto-sync-config.backgroundFixed";
const RANDOM_KEY = "auto-sync-config.backgroundRandom";
const POOL_KEY = "auto-sync-config.backgroundPool";

export type BackgroundMode = "random" | "fixed";

export function getBackgroundMode(): BackgroundMode {
  return localStorage.getItem(MODE_KEY) === "fixed" ? "fixed" : "random";
}

export function setBackgroundMode(mode: BackgroundMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

function readValidId(key: string): string | null {
  const id = localStorage.getItem(key);
  return BACKGROUNDS.some((b) => b.id === id) ? id : null;
}

export function getFixedBackgroundId(): string {
  return readValidId(FIXED_KEY) ?? BACKGROUNDS[0].id;
}

export function setFixedBackgroundId(id: string): void {
  localStorage.setItem(FIXED_KEY, id);
}

/**
 * 抽卡式随机:卡池为全部背景 id,每次抽取一张后移出卡池,
 * 卡池抽空后重建。保证每张图间隔出现,不会连续抽到同一张。
 */
function pickRandomId(): string {
  const allIds = BACKGROUNDS.map((b) => b.id);
  const lastId = readValidId(RANDOM_KEY);

  let pool: string[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(POOL_KEY) ?? "[]");
    if (Array.isArray(parsed)) {
      pool = parsed.filter((id): id is string => allIds.includes(id as string));
    }
  } catch {
    pool = [];
  }

  // 卡池为空(首次、抽完或数据异常)时重建;仅剩最后抽过的一张时也重建并移出,
  // 避免与上次重复
  if (pool.length <= (pool.includes(lastId ?? "") ? 1 : 0)) {
    pool = allIds.filter((id) => id !== lastId);
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  pool = pool.filter((id) => id !== pick);
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
  localStorage.setItem(RANDOM_KEY, pick);
  return pick;
}

/** 解析当前应显示的背景;随机模式下每次调用抽取一张(不与上次重复)。 */
export function resolveBackground(mode: BackgroundMode = getBackgroundMode()): BackgroundOption {
  const id = mode === "fixed" ? getFixedBackgroundId() : pickRandomId();
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
}
