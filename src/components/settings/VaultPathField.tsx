import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen, X } from "lucide-react";

interface VaultPathFieldProps {
  value: string;
  onChange: (path: string) => void;
}

/** 密码库路径设置:选择 .kdbx 文件;留空则使用应用数据目录的默认路径。 */
export function VaultPathField({ value, onChange }: VaultPathFieldProps) {
  const pickFile = async () => {
    const selected = await open({
      title: "选择密码库",
      filters: [{ name: "KeePass 数据库", extensions: ["kdbx"] }],
    });
    if (typeof selected === "string") onChange(selected);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="留空使用应用数据目录的默认密码库"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pr-8 font-mono text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {value && (
            <button
              type="button"
              title="清除,恢复默认路径"
              onClick={() => onChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={pickFile}>
          <FolderOpen className="mr-1 h-4 w-4" />
          浏览
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        修改后需在账号管理页重新解锁;已有的密码库文件不会移动。
      </p>
    </div>
  );
}
