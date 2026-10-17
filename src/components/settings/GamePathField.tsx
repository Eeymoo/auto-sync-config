import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen, CheckCircle2, XCircle, X } from "lucide-react";
import { isGamePathValid } from "@/lib/game";

interface GamePathFieldProps {
  value: string;
  onChange: (path: string) => void;
}

/** 游戏路径设置:目录选择 + 有效性校验(检查 bin64\JX3ClientX64.exe)。 */
export function GamePathField({ value, onChange }: GamePathFieldProps) {
  const [valid, setValid] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const validate = async (path: string) => {
    setChecking(true);
    setValid(await isGamePathValid(path));
    setChecking(false);
  };

  const pickFolder = async () => {
    const selected = await open({ directory: true, title: "选择游戏目录(zhcn_hd)" });
    if (typeof selected === "string") {
      onChange(selected);
      await validate(selected);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => value && validate(value)}
            placeholder="D:\JX3\bin\zhcn_hd"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pr-8 font-mono text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {value && (
            <button
              type="button"
              title="清除"
              onClick={() => {
                onChange("");
                setValid(null);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={pickFolder}>
          <FolderOpen className="mr-1 h-4 w-4" />
          浏览
        </Button>
      </div>
      {!checking && valid === true && (
        <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          路径有效,已找到客户端。
        </p>
      )}
      {!checking && valid === false && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          未找到 bin64\JX3ClientX64.exe,请确认选择的是 zhcn_hd 目录。
        </p>
      )}
    </div>
  );
}
