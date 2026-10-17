import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

/** 密码强度:按长度和字符种类评分,1=弱 2=中 3=强。 */
export function passwordStrength(pw: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
} {
  if (!pw) return { score: 0, label: "" };
  const kinds =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/[0-9]/.test(pw)) +
    Number(/[^a-zA-Z0-9]/.test(pw));
  if (pw.length >= 12 && kinds >= 3) return { score: 3, label: "强" };
  if (pw.length >= 8 && kinds >= 2) return { score: 2, label: "中" };
  return { score: 1, label: "弱" };
}

const BAR_COLORS = ["bg-muted", "bg-red-500", "bg-yellow-500", "bg-green-500"];
const LABEL_COLORS = [
  "text-muted-foreground",
  "text-red-500",
  "text-yellow-500",
  "text-green-600",
];

/** 三段式强度条 + 文字,新建密码库时实时显示。 */
export function StrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i <= score ? BAR_COLORS[score] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <span className={`text-xs ${LABEL_COLORS[score]}`}>{label}</span>
    </div>
  );
}

interface CreateVaultConfirmDialogProps {
  password: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 创建密码库前的确认弹窗:强调主密码丢失无法找回。 */
export function CreateVaultConfirmDialog({
  password,
  busy,
  onCancel,
  onConfirm,
}: CreateVaultConfirmDialogProps) {
  const { score, label } = passwordStrength(password);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg">
        <h2 className="flex items-center gap-2 font-medium">
          <ShieldAlert className="h-4 w-4 text-yellow-500" />
          创建密码库
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            主密码强度:
            <span className={`ml-1 font-medium ${LABEL_COLORS[score]}`}>
              {label}
            </span>
          </p>
          <p className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-yellow-700 dark:text-yellow-400">
            主密码是解锁密码库的唯一凭证,丢失后
            <span className="font-medium">无法找回</span>
            ,库内所有账号密码将无法读取。请确认已牢记或妥善备份。
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            返回修改
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "创建中…" : "我已牢记,创建"}
          </Button>
        </div>
      </div>
    </div>
  );
}
