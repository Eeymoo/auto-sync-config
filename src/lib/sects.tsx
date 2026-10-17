export interface Sect {
  id: string;
  name: string;
  /** 魔盒矢量库中的门派编号。 */
  icon: number;
  /** 主题色,用于门派图标底色 */
  color: string;
  /** 图标上显示的短字 */
  short: string;
}

export const SECTS: Sect[] = [
  { id: "tiance", name: "天策", icon: 1, color: "#b03a2e", short: "策" },
  { id: "wanhua", name: "万花", icon: 2, color: "#7a5fa6", short: "花" },
  { id: "chunyang", name: "纯阳", icon: 3, color: "#5b7fa6", short: "纯" },
  { id: "qixiu", name: "七秀", icon: 4, color: "#c0608f", short: "秀" },
  { id: "shaolin", name: "少林", icon: 5, color: "#b8860b", short: "禅" },
  { id: "cangjian", name: "藏剑", icon: 6, color: "#c9a227", short: "剑" },
  { id: "gaibang", name: "丐帮", icon: 7, color: "#8a6d3b", short: "丐" },
  { id: "mingjiao", name: "明教", icon: 8, color: "#c2543a", short: "喵" },
  { id: "wudu", name: "五毒", icon: 9, color: "#5f9e6e", short: "毒" },
  { id: "tangmen", name: "唐门", icon: 10, color: "#3f6f8f", short: "唐" },
  { id: "cangyun", name: "苍云", icon: 18, color: "#4a4e57", short: "苍" },
  { id: "changhai", name: "长歌", icon: 19, color: "#2e8b8b", short: "歌" },
  { id: "badao", name: "霸刀", icon: 20, color: "#6b4f2c", short: "霸" },
  { id: "penglai", name: "蓬莱", icon: 21, color: "#3a7ca5", short: "蓬" },
  { id: "lingxue", name: "凌雪", icon: 22, color: "#8f2d4e", short: "雪" },
  { id: "yantian", name: "衍天", icon: 23, color: "#7b68ae", short: "衍" },
  { id: "beiyao", name: "北天药宗", icon: 24, color: "#4f7942", short: "药" },
  { id: "daozong", name: "刀宗", icon: 26, color: "#4065a9", short: "刀" },
  { id: "wanshou", name: "万灵", icon: 29, color: "#a0522d", short: "灵" },
  { id: "duanshi", name: "段氏", icon: 38, color: "#8f6f45", short: "段" },
  { id: "wuxiang", name: "无相", icon: 39, color: "#58616b", short: "相" },
];

export function getSect(id: string): Sect | undefined {
  return SECTS.find((s) => s.id === id);
}

export function getSectIconUrl(id: string): string | undefined {
  const sect = getSect(id);
  return sect ? `/schools/${sect.icon}.svg` : undefined;
}

/** 门派图标:圆形底色 + 短字。 */
export function SectIcon({ sectId, size = 28 }: { sectId: string; size?: number }) {
  const sect = getSect(sectId);
  const iconUrl = getSectIconUrl(sectId);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: sect?.color ?? "#6b7280",
        fontSize: size * 0.45,
      }}
      title={sect?.name ?? "未知门派"}
    >
      <span>{sect?.short ?? "?"}</span>
      {iconUrl && (
        <img
          src={iconUrl}
          alt={sect?.name ?? ""}
          className="absolute inset-0 h-full w-full object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}
