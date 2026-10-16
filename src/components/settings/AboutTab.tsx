import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import appIcon from "../../../app-icon.png";
import packageInfo from "../../../package.json";

const repositoryUrl = "https://github.com/Eeymoo/auto-sync-config";
const publisher = "Eeymoo";
const licenseName = "MIT";

/** 关于 Tab：应用信息。 */
export function AboutTab() {
  const copyVersionInfo = () => {
    const info = [
      `Auto Sync Config v${packageInfo.version}`,
      `发布者: ${publisher}`,
      `开源许可: ${licenseName}`,
      `仓库: ${repositoryUrl}`,
    ].join("\n");
    navigator.clipboard?.writeText(info).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <img src={appIcon} alt="Auto Sync Config" className="mx-auto h-16 w-16 rounded-2xl" />
        <h2 className="text-xl font-bold">Auto Sync Config</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          剑网3 配置自动同步工具，支持账号配置管理与跨设备迁移。
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">版本</span>
          <span>{packageInfo.version}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">发布者</span>
          <span>{publisher}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">开源许可</span>
          <span>{licenseName}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">开源仓库</span>
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => window.open(repositoryUrl, "_blank", "noopener,noreferrer")}
          >
            GitHub ↗
          </Button>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">构建</span>
          <span>{import.meta.env.DEV ? "开发版" : "正式版"}</span>
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={copyVersionInfo}>
        复制版本信息
      </Button>
    </div>
  );
}
