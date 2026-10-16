import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Moon, Sun } from "lucide-react";
import { GamePathField } from "@/components/settings/GamePathField";

interface GeneralTabProps {
  dark: boolean;
  onDarkChange: (checked: boolean) => void;
  gamePath: string;
  onGamePathChange: (path: string) => void;
}

/** 常规设置:游戏路径 + 外观(明暗模式)。 */
export function GeneralTab({ dark, onDarkChange, gamePath, onGamePathChange }: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">游戏</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          剑网3 客户端安装目录(zhcn_hd)。
        </p>
      </div>

      <GamePathField value={gamePath} onChange={onGamePathChange} />

      <div>
        <h3 className="text-sm font-medium">外观</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          切换应用的明暗主题。
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          {dark ? (
            <Moon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Sun className="h-4 w-4 text-muted-foreground" />
          )}
          <Label htmlFor="dark-mode" className="text-sm">
            深色模式
          </Label>
        </div>
        <Switch
          id="dark-mode"
          checked={dark}
          onCheckedChange={onDarkChange}
        />
      </div>
    </div>
  );
}
