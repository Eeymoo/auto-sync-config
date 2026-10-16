export interface Sect {
  id: string;
  name: string;
  /** 主题色,用于门派图标底色 */
  color: string;
  /** 图标上显示的短字 */
  short: string;
}

export const SECTS: Sect[] = [
  { id: "tiance", name: "天策", color: "#b03a2e", short: "策" },
  { id: "chunyang", name: "纯阳", color: "#5b7fa6", short: "纯" },
  { id: "qixiu", name: "七秀", color: "#c0608f", short: "秀" },
  { id: "wanhua", name: "万花", color: "#7a5fa6", short: "花" },
  { id: "shaolin", name: "少林", color: "#b8860b", short: "禅" },
  { id: "cangjian", name: "藏剑", color: "#c9a227", short: "剑" },
  { id: "wudu", name: "五毒", color: "#5f9e6e", short: "毒" },
  { id: "tangmen", name: "唐门", color: "#3f6f8f", short: "唐" },
  { id: "mingjiao", name: "明教", color: "#c2543a", short: "喵" },
  { id: "gaibang", name: "丐帮", color: "#8a6d3b", short: "丐" },
  { id: "cangyun", name: "苍云", color: "#4a4e57", short: "苍" },
  { id: "changhai", name: "长歌", color: "#2e8b8b", short: "歌" },
  { id: "badao", name: "霸刀", color: "#6b4f2c", short: "霸" },
  { id: "penglai", name: "蓬莱", color: "#3a7ca5", short: "蓬" },
  { id: "lingxue", name: "凌雪", color: "#8f2d4e", short: "雪" },
  { id: "yantian", name: "衍天", color: "#7b68ae", short: "衍" },
  { id: "beiyao", name: "北天药宗", color: "#4f7942", short: "药" },
  { id: "wanshou", name: "万灵", color: "#a0522d", short: "灵" },
];

export function getSect(id: string): Sect | undefined {
  return SECTS.find((s) => s.id === id);
}

/** 门派图标:圆形底色 + 短字。 */
export function SectIcon({ sectId, size = 28 }: { sectId: string; size?: number }) {
  const sect = getSect(sectId);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: sect?.color ?? "#6b7280",
        fontSize: size * 0.45,
      }}
      title={sect?.name ?? "未知门派"}
    >
      {sect?.short ?? "?"}
    </span>
  );
}
