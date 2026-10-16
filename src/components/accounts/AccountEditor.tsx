import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SECTS, SectIcon } from "@/lib/sects";
import { saveAccount, type AccountSummary, type Character } from "@/lib/vault";
import { Plus, Trash2, X } from "lucide-react";

interface AccountEditorProps {
  account: AccountSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

const emptyCharacter = (): Character => ({
  id: "",
  name: "",
  server: "",
  level: null,
  sect: "",
  note: "",
});

/** 账号编辑对话框:基本信息 + 角色列表。 */
export function AccountEditor({ account, onClose, onSaved }: AccountEditorProps) {
  const [title, setTitle] = useState(account?.title ?? "");
  const [username, setUsername] = useState(account?.username ?? "");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState(account?.note ?? "");
  const [characters, setCharacters] = useState<Character[]>(
    account?.characters ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCharacter = (index: number, patch: Partial<Character>) => {
    setCharacters((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveAccount(account?.id ?? null, {
        title,
        username,
        password,
        note,
        characters: characters.map((c) => ({
          ...c,
          level: c.level === null || Number.isNaN(c.level) ? null : c.level,
        })),
      });
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-medium">{account ? "编辑账号" : "添加账号"}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如:大号 / 小号"
              />
            </div>
            <div className="space-y-1.5">
              <Label>账号</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{account ? "密码(留空则不修改)" : "密码"}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>备注</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>角色</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCharacters((prev) => [...prev, emptyCharacter()])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加角色
              </Button>
            </div>

            {characters.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                还没有角色,可以稍后再添加。
              </p>
            )}

            {characters.map((c, index) => (
              <div key={index} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SectIcon sectId={c.sect} size={24} />
                    <span className="text-sm font-medium">
                      {c.name || `角色 ${index + 1}`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      setCharacters((prev) => prev.filter((_, i) => i !== index))
                    }
                    title="移除角色"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="角色名称"
                    value={c.name}
                    onChange={(e) => updateCharacter(index, { name: e.target.value })}
                  />
                  <Input
                    placeholder="服务器"
                    value={c.server}
                    onChange={(e) => updateCharacter(index, { server: e.target.value })}
                  />
                  <Input
                    placeholder="等级"
                    type="number"
                    value={c.level ?? ""}
                    onChange={(e) =>
                      updateCharacter(index, {
                        level: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={c.sect}
                    onChange={(e) => updateCharacter(index, { sect: e.target.value })}
                  >
                    <option value="">选择门派</option>
                    {SECTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button disabled={busy} onClick={submit}>
              {busy ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
