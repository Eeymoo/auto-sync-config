import { useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import licensesData from "@/generated/licenses.json";
import type { LicenseInfo } from "@/types/license";

const licenses = licensesData as LicenseInfo[];
const acknowledgements = [
  {
    name: "JX3BOX 工具资源 #18212",
    description: "剑网3魔盒社区工具资源",
    homepage: "https://www.jx3box.com/tool/18212",
  },
  {
    name: "JX3BOX 工具资源 #106704",
    description: "剑网3魔盒社区工具资源",
    homepage: "https://www.jx3box.com/tool/106704",
  },
  {
    name: "JX3BOX 社区 #5652",
    description: "剑网3魔盒社区帖子，首页背景图源",
    homepage: "https://www.jx3box.com/community/5652",
  },
  {
    name: "JX3SyncAssistant",
    description: "剑网3角色间界面同步工具",
    homepage: "https://github.com/X3ZvaWQ/JX3SyncAssistant",
  },
];

const entries = [
  ...acknowledgements.map((item) => ({
    ...item,
    key: `credit:${item.homepage}`,
    version: "",
    ecosystem: "鸣谢",
    license: "",
    licenseText: "",
  })),
  ...licenses.map((pkg) => ({
    ...pkg,
    key: `${pkg.ecosystem}:${pkg.name}@${pkg.version}`,
    description: "",
  })),
];

/**
 * 开源许可证 Tab。
 *
 * 数据来源:`npm run generate:licenses` 读取 npm 与 Cargo 依赖生成的
 * `src/generated/licenses.json`(构建时自动刷新)。
 */
export function LicensesTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const npmCount = licenses.filter((pkg) => pkg.ecosystem === "npm").length;
  const rustCount = licenses.length - npmCount;

  const filtered = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return entries;
    return entries.filter((pkg) =>
      pkg.name.toLowerCase().includes(keyword) || pkg.ecosystem.toLowerCase().includes(keyword)
    );
  }, [filter]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">开源许可证</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          鸣谢的项目排在列表前面。另收录 {licenses.length} 个依赖包的许可证（npm {npmCount} 个，Rust {rustCount} 个，含间接依赖）。
        </p>
      </div>

      <input
        type="text"
        placeholder="搜索包名或类型…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      <div className="rounded-lg border">
        {filtered.map((pkg, index) => {
          const isOpen = expanded === pkg.key;
          return (
            <div key={pkg.key}>
              {index > 0 && <Separator />}
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-accent/50"
                onClick={() => setExpanded(isOpen ? null : pkg.key)}
              >
                <span className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="font-medium">{pkg.name}</span>
                  {pkg.version && (
                    <span className="text-xs text-muted-foreground">v{pkg.version}</span>
                  )}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {pkg.ecosystem}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {pkg.description ? "参考项目" : (pkg.license || "未知")}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-2 px-4 pb-4">
                  {pkg.homepage && (
                    <a
                      href={pkg.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {pkg.homepage}
                    </a>
                  )}
                  {pkg.description ? (
                    <p className="text-xs text-muted-foreground">{pkg.description}</p>
                  ) : pkg.licenseText ? (
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                      {pkg.licenseText}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      该包未附带许可文件，声明的许可证类型：{pkg.license || "未知"}。
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            没有匹配的包。
          </p>
        )}
      </div>
    </div>
  );
}
