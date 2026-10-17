import { useCallback, useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile, exists } from "@tauri-apps/plugin-fs";
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
  getVaultPathSetting,
  getDefaultVaultPath,
  enableHello,
  disableHello,
  unlockWithHello,
  scanUserdataAccounts,
  type AccountSummary,
  type VaultStatus,
  type ScannedAccount,
} from "@/lib/vault";
import { AccountEditor } from "./AccountEditor";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { SyncConfirmDialog } from "./SyncConfirmDialog";
import {
  CreateVaultConfirmDialog,
  StrengthMeter,
} from "./CreateVaultConfirmDialog";
import { SectIcon } from "@/lib/sects";
import {
  ArrowLeft,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
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
  gamePath: string;
}

/** 账号管理页:密码库解锁 + jx3 分组账号列表。 */
export function AccountsPage({ onBack, gamePath }: AccountsPageProps) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AccountSummary | "new" | null>(null);
  const [showPasswordId, setShowPasswordId] = useState<string | null>(null);
  const [passwordCache, setPasswordCache] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<ScannedAccount[] | null>(null);
  const [deleting, setDeleting] = useState<AccountSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
      // The backend auto-locks after idle; reflect that so cached passwords
      // and the unlocked UI do not linger past the timeout.
      if (!s.unlocked && status?.unlocked) {
        setShowPasswordId(null);
        setPasswordCache({});
        setEditing(null);
      }
      setStatus(s);
      if (s.unlocked) {
        await refreshAccounts();
      } else {
        setAccounts([]);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [refreshAccounts, status?.unlocked]);

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
    if (!status?.unlocked) {
      setError("密码库已锁定，请重新解锁");
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
      if (!status?.unlocked) {
        setError("密码库已锁定，请重新解锁");
        return;
      }
      const [, password] = passwordCache[id]
        ? [null, passwordCache[id]]
        : await getAccountCredentials(id);
      await navigator.clipboard.writeText(password);
    } catch (e) {
      setError(String(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteAccount(deleting.id);
      setDeleting(null);
      await refreshAccounts();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleLock = async () => {
    await lockVault();
    setShowPasswordId(null);
    setPasswordCache({});
    await refreshStatus();
  };

  const handleSync = async () => {
    if (!gamePath) {
      setError("请先在设置中配置游戏路径");
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const result = await scanUserdataAccounts(gamePath);
      if (result.length === 0) {
        setError("userdata 目录中没有找到账号");
        return;
      }
      setSyncResult(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
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
              <Button
                variant="outline"
                disabled={syncing}
                onClick={handleSync}
                title="扫描 userdata 目录导入账号"
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                同步
              </Button>
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
                    onDelete={() => setDeleting(account)}
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
            await refreshStatus();
          }}
        />
      )}

      {syncResult && status?.unlocked && (
        <SyncConfirmDialog
          scanned={syncResult}
          onClose={() => setSyncResult(null)}
          onImported={async (count) => {
            setSyncResult(null);
            await refreshAccounts();
            if (count > 0) {
              setError(null);
            }
          }}
        />
      )}

      {deleting && (
        <DeleteConfirmDialog
          account={deleting}
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

/** 解锁面板:新建密码库 / 打开现有库 / Windows Hello 解锁。
 * 密码库路径来自设置页;未设置时新建库保存到应用数据目录。 */
/** Best-effort check whether a vault file already exists at the default path. */
async function defaultVaultExists(): Promise<boolean> {
  try {
    const p = await getDefaultVaultPath();
    return await exists(p);
  } catch {
    return false;
  }
}

/** Ask where to save the generated key file and write it. Returns false if
 * the user cancels or the write fails. */
async function saveKeyFile(base64: string): Promise<boolean> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const chosen = await save({
    title: "保存密钥文件",
    defaultPath: "jx3-accounts.keyfile",
    filters: [{ name: "密钥文件", extensions: ["keyfile", "key"] }],
  });
  if (typeof chosen !== "string" || !chosen) return false;
  try {
    await writeFile(chosen, bytes);
    return true;
  } catch {
    return false;
  }
}

function UnlockPanel({
  onUnlocked,
  status,
}: {
  onUnlocked: () => Promise<void>;
  status: VaultStatus | null;
}) {
  const [path] = useState(() => getVaultPathSetting());
  // Default to opening when a vault already exists at the configured (or
  // default) path, so a returning user is not forced through "create" again.
  const [mode, setMode] = useState<"open" | "create">(() => {
    const configured = getVaultPathSetting();
    if (configured) return "open";
    return "create";
  });
  useEffect(() => {
    if (!getVaultPathSetting()) {
      void defaultVaultExists().then((existsNow) => {
        if (existsNow) setMode("open");
      });
    }
  }, []);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [keyFile, setKeyFile] = useState<string | null>(null);
  const [useKeyFile, setUseKeyFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCreate, setConfirmingCreate] = useState(false);

  const pickKeyFile = async () => {
    const selected = await open({ title: "选择密钥文件" });
    if (typeof selected === "string") setKeyFile(selected);
  };

  /** 点主按钮:open 直接解锁;create 先校验并弹确认,确认后才真正创建。 */
  const submit = () => {
    setError(null);
    if (mode === "create") {
      if (!password) {
        setError("请输入主密码");
        return;
      }
      if (password !== password2) {
        setError("两次输入的主密码不一致");
        return;
      }
      setConfirmingCreate(true);
      return;
    }
    void doOpen();
  };

  const doOpen = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!path) {
        setError("请先在「设置 → 常规」中配置密码库文件");
        return;
      }
      await openVault(path, password, keyFile);
      await onUnlocked();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const [, keyFileBase64] = await createVault(path || null, password, useKeyFile);
      // The generated key file is required to reopen the vault; offer to save
      // it before proceeding. Declining keeps the vault open now but it cannot
      // be unlocked again without the key file.
      if (keyFileBase64) {
        const saved = await saveKeyFile(keyFileBase64);
        if (!saved) {
          setError("未保存密钥文件：本次可继续使用，但重新解锁时需要它");
        }
      }
      setConfirmingCreate(false);
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

      <p className="text-sm text-muted-foreground">
        {mode === "create"
          ? "首次使用,设置主密码创建密码库。保存位置可在「设置 → 常规 → 密码库」中修改。"
          : "输入主密码解锁密码库。"}
      </p>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>主密码</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "create" && <StrengthMeter password={password} />}
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

      {confirmingCreate && (
        <CreateVaultConfirmDialog
          password={password}
          busy={busy}
          onCancel={() => setConfirmingCreate(false)}
          onConfirm={doCreate}
        />
      )}
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
