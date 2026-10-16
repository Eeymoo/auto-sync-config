import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createVault,
  openVault,
  lockVault,
  listAccounts,
  deleteAccount,
  getVaultStatus,
  getDefaultVaultPath,
  enableHello,
  disableHello,
  unlockWithHello,
  type AccountSummary,
  type VaultStatus,
} from "@/lib/vault";
import { AccountEditor } from "./AccountEditor";
import { SectIcon } from "@/lib/sects";
import {
  ArrowLeft,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  Fingerprint,
} from "lucide-react";
import { getAccountCredentials } from "@/lib/vault";

interface AccountsPageProps {
  onBack: () => void;
}

/** 账号管理页:密码库解锁 + jx3 分组账号列表。 */
export function AccountsPage({ onBack }: AccountsPageProps) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AccountSummary | "new" | null>(null);
  const [showPasswordId, setShowPasswordId] = useState<string | null>(null);
  const [passwordCache, setPasswordCache] = useState<Record<string, string>>({});

  const refreshAccounts = useCallback(async () => {
    try {
      setAccounts(await listAccounts());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getVaultStatus();
      setStatus(s);
      if (s.unlocked) {
        await refreshAccounts();
      } else {
        setAccounts([]);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [refreshAccounts]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return accounts;
    return accounts.filter(
      (a) =>
        a.title.toLowerCase().includes(kw) ||
        a.username.toLowerCase().includes(kw) ||
        a.characters.some(
          (c) =>
            c.name.toLowerCase().includes(kw) ||
            c.server.toLowerCase().includes(kw),
        ),
    );
  }, [accounts, search]);

  const toggleShowPassword = async (id: string) => {
    if (showPasswordId === id) {
      setShowPasswordId(null);
      return;
    }
    if (!passwordCache[id]) {
      try {
        const [, password] = await getAccountCredentials(id);
        setPasswordCache((prev) => ({ ...prev, [id]: password }));
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    setShowPasswordId(id);
  };

  const copyPassword = async (id: string) => {
    try {
      const [, password] = passwordCache[id]
        ? [null, passwordCache[id]]
        : await getAccountCredentials(id);
      await navigator.clipboard.writeText(password);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDelete = async (account: AccountSummary) => {
    if (!window.confirm(`删除账号「${account.title}」?条目会移入回收站。`)) return;
    try {
      await deleteAccount(account.id);
      await refreshAccounts();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleLock = async () => {
    await lockVault();
    setShowPasswordId(null);
    setPasswordCache({});
    await refreshStatus();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b px-6 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">账号管理</h1>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {status?.unlocked && (
            <>
              <span className="flex items-center gap-1">
                <LockOpen className="h-3.5 w-3.5 text-green-600" />
                {status.name}
              </span>
              <Button variant="outline" size="sm" onClick={handleLock}>
                <Lock className="mr-1 h-3.5 w-3.5" />
                锁定
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
            <button className="ml-2 underline" onClick={() => setError(null)}>
              关闭
            </button>
          </div>
        )}

        {!status?.unlocked ? (
          <UnlockPanel onUnlocked={refreshStatus} status={status} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="搜索账号或角色…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button onClick={() => setEditing("new")}>
                <Plus className="mr-1 h-4 w-4" />
                添加账号
              </Button>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
                {accounts.length === 0
                  ? "还没有账号,点击右上角「添加账号」开始。"
                  : "没有匹配的账号。"}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    showPassword={showPasswordId === account.id}
                    password={passwordCache[account.id]}
                    onTogglePassword={() => toggleShowPassword(account.id)}
                    onCopyPassword={() => copyPassword(account.id)}
                    onEdit={() => setEditing(account)}
                    onDelete={() => handleDelete(account)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {editing && status?.unlocked && (
        <AccountEditor
          account={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refreshAccounts();
          }}
        />
      )}
    </div>
  );
}

/** 解锁面板:新建密码库 / 打开现有库 / Windows Hello 解锁。 */
function UnlockPanel({
  onUnlocked,
  status,
}: {
  onUnlocked: () => Promise<void>;
  status: VaultStatus | null;
}) {
  const [mode, setMode] = useState<"open" | "create">("open");
  const [path, setPath] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [keyFile, setKeyFile] = useState<string | null>(null);
  const [useKeyFile, setUseKeyFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const p = await getDefaultVaultPath();
        if (mode === "create") setPath(p);
      } catch {
        /* 仅用于显示默认路径 */
      }
    })();
  }, [mode]);

  const pickVaultFile = async () => {
    const selected = await open({
      title: "选择密码库",
      filters: [{ name: "KeePass 数据库", extensions: ["kdbx"] }],
    });
    if (typeof selected === "string") setPath(selected);
  };

  const pickKeyFile = async () => {
    const selected = await open({ title: "选择密钥文件" });
    if (typeof selected === "string") setKeyFile(selected);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        if (password !== password2) {
          setError("两次输入的主密码不一致");
          return;
        }
        await createVault(path || null, password, useKeyFile);
      } else {
        if (!path) {
          setError("请选择密码库文件");
          return;
        }
        await openVault(path, password, keyFile);
      }
      await onUnlocked();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleHelloUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithHello();
      await onUnlocked();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5 rounded-lg border p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-medium">解锁密码库</h2>
      </div>

      {status?.helloEnabled && (
        <Button
          className="w-full"
          variant="outline"
          disabled={busy}
          onClick={handleHelloUnlock}
        >
          <Fingerprint className="mr-2 h-4 w-4" />
          使用 Windows Hello 解锁
        </Button>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
        <button
          className={`rounded px-3 py-1.5 ${mode === "open" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setMode("open")}
        >
          打开现有库
        </button>
        <button
          className={`rounded px-3 py-1.5 ${mode === "create" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setMode("create")}
        >
          新建密码库
        </button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>密码库文件</Label>
          <div className="flex gap-2">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={mode === "create" ? "默认保存在应用数据目录" : "选择 .kdbx 文件"}
              className="font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={pickVaultFile}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>主密码</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {mode === "create" && (
          <>
            <div className="space-y-1.5">
              <Label>确认主密码</Label>
              <Input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label htmlFor="use-keyfile" className="text-sm font-normal">
                同时生成密钥文件
              </Label>
              <Switch
                id="use-keyfile"
                checked={useKeyFile}
                onCheckedChange={setUseKeyFile}
              />
            </div>
          </>
        )}

        {mode === "open" && (
          <div className="space-y-1.5">
            <Label>密钥文件(可选)</Label>
            <div className="flex gap-2">
              <Input
                value={keyFile ?? ""}
                onChange={(e) => setKeyFile(e.target.value || null)}
                placeholder="需要密钥文件的库在此选择"
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={pickKeyFile}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" disabled={busy} onClick={submit}>
        {busy ? "处理中…" : mode === "create" ? "创建并解锁" : "解锁"}
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        密码库使用 KDBX 4.0 格式,与 KeePass 兼容。闲置 5 分钟自动锁定。
        Windows Hello 解锁仅在本机可用,主密码始终是恢复方式。
      </p>
    </div>
  );
}

function AccountRow({
  account,
  showPassword,
  password,
  onTogglePassword,
  onCopyPassword,
  onEdit,
  onDelete,
}: {
  account: AccountSummary;
  showPassword: boolean;
  password: string | undefined;
  onTogglePassword: () => void;
  onCopyPassword: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium">{account.title}</h3>
            <span className="text-sm text-muted-foreground">{account.username}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="font-mono text-muted-foreground">
              {showPassword ? (password ?? "••••••••") : "••••••••"}
            </span>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={onTogglePassword}
              title={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={onCopyPassword}
              title="复制密码"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          {account.note && (
            <p className="mt-1 text-xs text-muted-foreground">{account.note}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} title="编辑">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} title="删除">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {account.characters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {account.characters.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-1 pr-3 text-xs"
            >
              <SectIcon sectId={c.sect} size={20} />
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">
                {c.server}
                {c.level != null ? ` · Lv.${c.level}` : ""}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Windows Hello 开关,放在账号管理页底部之外的独立小组件中由设置页引用。 */
export function HelloSettings({ status, onChanged }: { status: VaultStatus; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (checked: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (checked) {
        if (!status.path) throw new Error("请先解锁密码库");
        const password = window.prompt("输入主密码以启用 Windows Hello 解锁:");
        if (password == null) return;
        await enableHello(status.path, password, null);
      } else {
        await disableHello();
      }
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <Fingerprint className="h-4 w-4 text-muted-foreground" />
        <div>
          <Label className="text-sm">Windows Hello 解锁</Label>
          <p className="text-xs text-muted-foreground">
            {status.helloAvailable
              ? "仅本机可用;主密码仍是恢复方式。"
              : "当前电脑未配置 Windows Hello。"}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <Switch
        checked={status.helloEnabled}
        disabled={busy || !status.helloAvailable || !status.unlocked}
        onCheckedChange={toggle}
      />
    </div>
  );
}
