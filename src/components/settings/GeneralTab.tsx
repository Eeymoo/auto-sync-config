import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Moon, Sun } from "lucide-react";
import { GamePathField } from "@/components/settings/GamePathField";
import { VaultPathField } from "@/components/settings/VaultPathField";
import {
  BACKGROUNDS,
  type BackgroundMode,
} from "@/lib/background";

interface GeneralTabProps {
  dark: boolean;
  onDarkChange: (checked: boolean) => void;
  gamePath: string;
  onGamePathChange: (path: string) => void;
  vaultPath: string;
  onVaultPathChange: (path: string) => void;
  backgroundMode: BackgroundMode;
  onBackgroundModeChange: (mode: BackgroundMode) => void;
  fixedBackgroundId: string;
  onFixedBackgroundChange: (id: string) => void;
}

/** 常规设置:游戏路径 + 密码库 + 外观(明暗模式)。 */
export function GeneralTab({
  dark,
  onDarkChange,
  gamePath,
  onGamePathChange,
  vaultPath,
  onVaultPathChange,
  backgroundMode,
  onBackgroundModeChange,
  fixedBackgroundId,
  onFixedBackgroundChange,
}: GeneralTabProps) {
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
        <h3 className="text-sm font-medium">密码库</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          账号管理使用的 KeePass(.kdbx)文件位置。
        </p>
      </div>

      <VaultPathField value={vaultPath} onChange={onVaultPathChange} />

      <div>
        <h3 className="text-sm font-medium">外观</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          切换应用的明暗主题与首页背景。
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

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">随机背景</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              开启后每次启动首页随机抽取一张背景;关闭则固定使用所选背景。
            </p>
          </div>
          <Switch
            id="random-background"
            checked={backgroundMode === "random"}
            onCheckedChange={(checked) =>
              onBackgroundModeChange(checked ? "random" : "fixed")
            }
          />
        </div>

        {backgroundMode === "fixed" && (
          <div className="flex flex-wrap gap-3 pt-1">
            {BACKGROUNDS.map((bg) => {
              const selected = bg.id === fixedBackgroundId;
              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => onFixedBackgroundChange(bg.id)}
                  title={bg.label}
                  className={`overflow-hidden rounded-md border transition-shadow ${
                    selected
                      ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "border-border hover:shadow-md"
                  }`}
                >
                  <img
                    src={bg.src}
                    alt={bg.label}
                    draggable={false}
                    className="block h-16 w-28 object-cover"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
