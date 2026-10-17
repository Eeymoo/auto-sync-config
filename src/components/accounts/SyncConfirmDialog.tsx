import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectIcon } from "@/lib/sects";
import { importScannedAccounts, type ScannedAccount } from "@/lib/vault";
import { Check, X, Loader2 } from "lucide-react";

interface SyncConfirmDialogProps {
  scanned: ScannedAccount[];
  onClose: () => void;
  onImported: (count: number) => void;
}

/** 扫描结果确认弹窗:勾选要导入的账号和角色。 */
export function SyncConfirmDialog({
  scanned,
  onClose,
  onImported,
}: SyncConfirmDialogProps) {
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set(scanned.filter((a) => !a.exists).map((a) => a.username)),
  );
  const [selectedCharacters, setSelectedCharacters] = useState<
    Record<string, Set<number>>
  >(() => {
    const initial: Record<string, Set<number>> = {};
    for (const account of scanned) {
      if (!account.exists) {
        initial[account.username] = new Set(
          account.characters.map((_, i) => i),
        );
      }
    }
    return initial;
  });
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAccount = (username: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  };

  const toggleCharacter = (username: string, index: number) => {
    setSelectedCharacters((prev) => {
      const next = { ...prev };
      const charSet = new Set(next[username] ?? []);
      if (charSet.has(index)) {
        charSet.delete(index);
      } else {
        charSet.add(index);
      }
      next[username] = charSet;
      return next;
    });
  };

  const importable = scanned.filter((a) => !a.exists);
  const selectedCount = importable.filter((a) =>
    selectedAccounts.has(a.username),
  ).length;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const accounts = importable
        .filter((a) => selectedAccounts.has(a.username))
        .map((a) => {
          const charSet = selectedCharacters[a.username] ?? new Set<number>();
          return {
            title: a.username,
            username: a.username,
            password: passwords[a.username] ?? "",
            note: "从 userdata 同步",
            characters: a.characters.filter((_, i) => charSet.has(i)),
          };
        });
      const count = await importScannedAccounts(accounts);
      onImported(count);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-medium">同步 userdata 账号</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            扫描到 {scanned.length} 个账号,其中 {importable.length} 个可导入。
            已存在的账号不会重复导入。勾选角色可以只导入部分角色。密码可在导入后手动补填。
          </p>

          <div className="space-y-2">
            {scanned.map((account) => (
              <div
                key={account.username}
                className={`rounded-md border p-3 ${account.exists ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={selectedAccounts.has(account.username)}
                    disabled={account.exists}
                    onChange={() => toggleAccount(account.username)}
                  />
                  <div className="flex-1">
                    <span className="font-medium">{account.username}</span>
                    {account.exists && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        已存在
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {account.characters.length} 个角色
                    </span>
                  </div>
                  {!account.exists && selectedAccounts.has(account.username) && (
                    <Input
                      type="password"
                      className="h-7 w-36 text-xs"
                      placeholder="密码(可后补)"
                      value={passwords[account.username] ?? ""}
                      onChange={(e) =>
                        setPasswords((prev) => ({
                          ...prev,
                          [account.username]: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>

                {account.characters.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {account.characters.map((c, i) => {
                      const isSelected =
                        selectedCharacters[account.username]?.has(i) ?? false;
                      const disabled =
                        account.exists || !selectedAccounts.has(account.username);
                      return (
                        <label
                          key={i}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                            disabled
                              ? "cursor-not-allowed opacity-50"
                              : isSelected
                                ? "border-primary bg-primary/10"
                                : "border-border bg-muted/30 hover:bg-muted/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={isSelected}
                            disabled={disabled}
                            onChange={() => toggleCharacter(account.username, i)}
                          />
                          <SectIcon sectId={c.sect} size={14} />
                          {c.name}
                          <span className="text-muted-foreground">{c.server}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between border-t pt-4">
            <Label className="text-sm text-muted-foreground">
              已选 {selectedCount} / {importable.length}
            </Label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                disabled={busy || selectedCount === 0}
                onClick={submit}
              >
                {busy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1 h-4 w-4" />
                )}
                导入 {selectedCount} 个账号
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
