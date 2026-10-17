import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getSyncSourceDirectory,
  materializeAdapterSource,
} from "@/lib/sync";

interface AdvancedTabProps {
  showSyncVariantSettings: boolean;
  onShowSyncVariantSettingsChange: (checked: boolean) => void;
}

export function AdvancedTab({
  showSyncVariantSettings,
  onShowSyncVariantSettingsChange,
}: AdvancedTabProps) {
  const [sourceDirectory, setSourceDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getSyncSourceDirectory()
      .then(setSourceDirectory)
      .catch((reason) => setError(String(reason)));
  }, []);

  const createLocalSource = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const path = await materializeAdapterSource("jx3");
      setNotice(`可编辑副本已就绪：${path}`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">同步</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          默认使用正式服，仅在需要测试服或跨服同步时开启服务器版本选择。
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div>
          <Label htmlFor="sync-variant-settings" className="text-sm">
            允许选择服务器版本
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            开启后可在同步页分别设置来源服和目标服。
          </p>
        </div>
        <Switch
          id="sync-variant-settings"
          checked={showSyncVariantSettings}
          onCheckedChange={onShowSyncVariantSettingsChange}
        />
      </div>

      <div>
        <h3 className="text-sm font-medium">外部适配源</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          仅在游戏目录结构变化或需要自定义同步规则时使用。
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <p className="text-xs text-muted-foreground">适配源目录</p>
          <p
            className="mt-1 break-all font-mono text-xs"
            title={sourceDirectory}
          >
            {sourceDirectory || "正在读取…"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={createLocalSource}
        >
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          创建 JX3 可编辑副本
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {notice && <p className="break-all text-xs text-green-600">{notice}</p>}
      </div>
    </div>
  );
}
