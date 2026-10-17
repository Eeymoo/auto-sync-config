import { Button } from "@/components/ui/button";
import type { AccountSummary } from "@/lib/vault";
import { Trash2 } from "lucide-react";

interface DeleteConfirmDialogProps {
  account: AccountSummary;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 删除账号的确认弹窗:条目会移入 KeePass 回收站。 */
export function DeleteConfirmDialog({
  account,
  busy,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg">
        <h2 className="flex items-center gap-2 font-medium">
          <Trash2 className="h-4 w-4 text-destructive" />
          删除账号
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          确定删除账号「{account.title}」吗?条目会移入回收站,仍可用
          KeePass 恢复。
          {account.characters.length > 0 &&
            ` 该账号下有 ${account.characters.length} 个角色。`}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "删除中…" : "删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}
