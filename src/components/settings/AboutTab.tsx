import { Separator } from "@/components/ui/separator";
import appIcon from "../../../app-icon.png";
import packageInfo from "../../../package.json";

/** 关于 Tab：应用信息。 */
export function AboutTab() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <img src={appIcon} alt="Auto Sync Config" className="mx-auto h-16 w-16 rounded-2xl" />
        <h2 className="text-xl font-bold">Auto Sync Config</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          剑网3 配置自动同步工具。
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
          <span>Eeymoo</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">构建</span>
          <span>{import.meta.env.DEV ? "开发版" : "正式版"}</span>
        </div>
      </div>

    </div>
  );
}
