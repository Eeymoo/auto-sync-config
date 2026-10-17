import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createSyncPlan,
  executeSync,
  listSyncAdapters,
  listSyncTransactions,
  redoSync,
  scanSyncRoles,
  undoSync,
  type SyncAdapterSummary,
  type SyncPlan,
  type SyncRequest,
  type SyncRole,
  type TransactionState,
  type TransactionSummary,
} from "@/lib/sync";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Redo2,
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
} from "lucide-react";

interface SyncPageProps {
  gamePath: string;
  showVariantSettings: boolean;
  onBack: () => void;
}

export function SyncPage({ gamePath, showVariantSettings, onBack }: SyncPageProps) {
  const [adapters, setAdapters] = useState<SyncAdapterSummary[]>([]);
  const [adapterId, setAdapterId] = useState("jx3");
  const [sourceVariant, setSourceVariant] = useState("official");
  const [targetVariant, setTargetVariant] = useState("official");
  const [sourceRoles, setSourceRoles] = useState<SyncRole[]>([]);
  const [targetRoles, setTargetRoles] = useState<SyncRole[]>([]);
  const [sourceRoleIndex, setSourceRoleIndex] = useState("");
  const [targetRoleIndex, setTargetRoleIndex] = useState("");
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const adapter = useMemo(
    () => adapters.find((item) => item.id === adapterId) ?? null,
    [adapterId, adapters],
  );

  const refreshTransactions = useCallback(async () => {
    setTransactions(await listSyncTransactions());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await listSyncAdapters();
        setAdapters(loaded);
        const initial = loaded.find((item) => item.id === "jx3") ?? loaded[0];
        if (initial) {
          setAdapterId(initial.id);
          const initialVariant = preferredVariantId(initial);
          setSourceVariant(initialVariant);
          setTargetVariant(initialVariant);
          setGroups(
            new Set(
              initial.groups
                .filter((group) => group.defaultEnabled)
                .map((group) => group.id),
            ),
          );
          if (gamePath) {
            const roles = await scanSyncRoles(initial.id, gamePath, initialVariant);
            setSourceRoles(roles);
            setTargetRoles(roles);
            setSourceRoleIndex(roles.length > 0 ? "0" : "");
            setTargetRoleIndex(roles.length > 1 ? "1" : roles.length > 0 ? "0" : "");
            if (roles.length === 0) {
              setError(`设置的游戏目录中没有扫描到角色：${gamePath}`);
            }
          } else {
            setError("请先在设置中配置游戏目录。");
          }
        }
        await refreshTransactions();
      } catch (reason) {
        setError(String(reason));
      }
    })();
  }, [gamePath, refreshTransactions]);

  const chooseAdapter = (id: string) => {
    const next = adapters.find((item) => item.id === id);
    setAdapterId(id);
    setPlan(null);
    setSourceRoles([]);
    setTargetRoles([]);
    setSourceRoleIndex("");
    setTargetRoleIndex("");
    if (next) {
      const initialVariant = preferredVariantId(next);
      setSourceVariant(initialVariant);
      setTargetVariant(initialVariant);
      setGroups(
        new Set(
          next.groups
            .filter((group) => group.defaultEnabled)
            .map((group) => group.id),
        ),
      );
    }
  };

  const scan = async (
    side: "source" | "target",
    requestedVariant?: string,
  ) => {
    const variant =
      requestedVariant ?? (side === "source" ? sourceVariant : targetVariant);
    setBusy(`scan-${side}`);
    setError(null);
    setNotice(null);
    setPlan(null);
    if (side === "source") {
      setSourceRoles([]);
      setSourceRoleIndex("");
    } else {
      setTargetRoles([]);
      setTargetRoleIndex("");
    }
    try {
      if (!gamePath) throw new Error("请先在设置中配置游戏目录。");
      const roles = await scanSyncRoles(adapterId, gamePath, variant);
      if (side === "source") {
        setSourceRoles(roles);
        setSourceRoleIndex(roles.length > 0 ? "0" : "");
      } else {
        setTargetRoles(roles);
        setTargetRoleIndex(roles.length > 0 ? "0" : "");
      }
      const variantLabel =
        adapter?.variants.find((item) => item.id === variant)?.label ?? variant;
      setNotice(
        `${side === "source" ? "来源" : "目标"}${variantLabel}扫描到 ${roles.length} 个角色。`,
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(null);
    }
  };

  const request = (): SyncRequest | null => {
    if (sourceRoleIndex === "" || targetRoleIndex === "") return null;
    const sourceRole = sourceRoles[Number(sourceRoleIndex)];
    const targetRole = targetRoles[Number(targetRoleIndex)];
    if (!sourceRole || !targetRole) return null;
    return {
      adapterId,
      source: { root: gamePath, variant: sourceVariant, role: sourceRole },
      target: { root: gamePath, variant: targetVariant, role: targetRole },
      groups: Array.from(groups),
    };
  };

  const preview = async () => {
    const nextRequest = request();
    if (!nextRequest) {
      setError("请先扫描并选择来源角色和目标角色。");
      return;
    }
    if (groups.size === 0) {
      setError("请至少选择一个同步分组。");
      return;
    }
    setBusy("plan");
    setError(null);
    setNotice(null);
    try {
      setPlan(await createSyncPlan(nextRequest));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(null);
    }
  };

  const execute = async () => {
    const nextRequest = request();
    if (!nextRequest || !plan) return;
    const changed = plan.files.filter((file) => file.action !== "unchanged").length;
    if (!window.confirm(`将修改目标角色的 ${changed} 个文件。执行前会自动备份目标数据，是否继续？`)) {
      return;
    }
    setBusy("execute");
    setError(null);
    setNotice(null);
    try {
      const result = await executeSync(nextRequest);
      setNotice(
        `同步完成：修改 ${result.changedFiles} 个文件，${result.unchangedFiles} 个无需修改。事务 ${result.transactionId}`,
      );
      setPlan(null);
      await refreshTransactions();
    } catch (reason) {
      setError(String(reason));
      await refreshTransactions();
    } finally {
      setBusy(null);
    }
  };

  const transition = async (transaction: TransactionSummary, direction: "undo" | "redo") => {
    setBusy(`${direction}-${transaction.id}`);
    setError(null);
    setNotice(null);
    try {
      const result =
        direction === "undo"
          ? await undoSync(transaction.id)
          : await redoSync(transaction.id);
      setNotice(
        `${direction === "undo" ? "撤销" : "重做"}完成，处理 ${result.restoredFiles} 个文件。`,
      );
      await refreshTransactions();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(null);
    }
  };

  const toggleGroup = (id: string) => {
    setGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPlan(null);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">配置同步</h1>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          每次同步前自动备份，方便恢复
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {notice && (
            <div className="flex items-center gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-4 py-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4" />
              {notice}
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">同步端点</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">适配源</span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3"
                  value={adapterId}
                  onChange={(event) => chooseAdapter(event.target.value)}
                >
                  {adapters.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.version}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-md border px-3 py-2">
                <span className="block text-xs text-muted-foreground">设置中的游戏目录</span>
                <span className="block truncate font-mono text-sm" title={gamePath}>
                  {gamePath || "尚未设置，请返回设置页面配置"}
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
                <EndpointEditor
                  title="来源角色"
                  variants={adapter?.variants ?? []}
                  variant={sourceVariant}
                  showVariantSettings={showVariantSettings}
                  onVariantChange={(value) => {
                    setSourceVariant(value);
                    void scan("source", value);
                  }}
                  roles={sourceRoles}
                  roleIndex={sourceRoleIndex}
                  onRoleIndexChange={(value) => {
                    setSourceRoleIndex(value);
                    setPlan(null);
                  }}
                  onScan={() => scan("source")}
                  scanning={busy === "scan-source"}
                  disabled={busy !== null}
                />
                <ArrowRight className="hidden self-center text-muted-foreground lg:block" />
                <EndpointEditor
                  title="目标角色"
                  variants={adapter?.variants ?? []}
                  variant={targetVariant}
                  showVariantSettings={showVariantSettings}
                  onVariantChange={(value) => {
                    setTargetVariant(value);
                    void scan("target", value);
                  }}
                  roles={targetRoles}
                  roleIndex={targetRoleIndex}
                  onRoleIndexChange={(value) => {
                    setTargetRoleIndex(value);
                    setPlan(null);
                  }}
                  onScan={() => scan("target")}
                  scanning={busy === "scan-target"}
                  disabled={busy !== null}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">同步内容</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {adapter?.groups.map((group) => (
                  <label key={group.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={groups.has(group.id)}
                      onChange={() => toggleGroup(group.id)}
                    />
                    <span>
                      <span className="block text-sm font-medium">{group.name}</span>
                      <span className="block text-xs text-muted-foreground">{group.description}</span>
                    </span>
                  </label>
                ))}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={preview} disabled={busy !== null}>
                    {busy === "plan" ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-1 h-4 w-4" />
                    )}
                    生成变更预览
                  </Button>
                  <Button onClick={execute} disabled={!plan || busy !== null}>
                    {busy === "execute" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    执行同步
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">变更预览</CardTitle>
              </CardHeader>
              <CardContent>
                {!plan ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    选择角色和同步内容后生成预览。
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>新增 {plan.files.filter((file) => file.action === "create").length}</span>
                      <span>替换 {plan.files.filter((file) => file.action === "replace").length}</span>
                      <span>不变 {plan.files.filter((file) => file.action === "unchanged").length}</span>
                    </div>
                    {plan.warnings.length > 0 && (
                      <div className="max-h-24 overflow-y-auto rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                        {plan.warnings.map((warning, index) => (
                          <div key={index}>{warning}</div>
                        ))}
                      </div>
                    )}
                    <div className="max-h-64 overflow-y-auto rounded-md border">
                      {plan.files.map((file) => (
                        <div key={file.target} className="flex gap-2 border-b px-3 py-2 text-xs last:border-0">
                          <span className={actionClass(file.action)}>{actionLabel(file.action)}</span>
                          <span className="min-w-0 flex-1 truncate font-mono" title={file.target}>
                            {file.logicalPath}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">同步与恢复记录</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => void refreshTransactions()}>
                <RefreshCw className="mr-1 h-4 w-4" />刷新
              </Button>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">尚无同步事务。</p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center gap-3 rounded-md border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{stateLabel(transaction.state)}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(transaction.createdUnixMs).toLocaleString()}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground" title={transaction.targetDataRoot}>
                          {transaction.fileCount} 个文件 · {transaction.id}
                        </p>
                      </div>
                      {transaction.state !== "rolledBack" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => transition(transaction, "undo")}
                        >
                          <Undo2 className="mr-1 h-4 w-4" />
                          {transaction.state === "committed" ? "撤销" : "恢复"}
                        </Button>
                      )}
                      {transaction.state === "rolledBack" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => transition(transaction, "redo")}
                        >
                          <Redo2 className="mr-1 h-4 w-4" />重做
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

interface EndpointEditorProps {
  title: string;
  variants: Array<{ id: string; label: string }>;
  variant: string;
  showVariantSettings: boolean;
  onVariantChange: (value: string) => void;
  roles: SyncRole[];
  roleIndex: string;
  onRoleIndexChange: (value: string) => void;
  onScan: () => void;
  scanning: boolean;
  disabled: boolean;
}

function EndpointEditor(props: EndpointEditorProps) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <h3 className="text-sm font-medium">{props.title}</h3>
      <div
        className={`grid gap-2 ${
          props.showVariantSettings
            ? "grid-cols-[8rem_1fr_auto]"
            : "grid-cols-[1fr_auto]"
        }`}
      >
        {props.showVariantSettings && (
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={props.variant}
            onChange={(event) => props.onVariantChange(event.target.value)}
            disabled={props.disabled}
          >
            {props.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>{variant.label}</option>
            ))}
          </select>
        )}
        <select
          className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
          value={props.roleIndex}
          onChange={(event) => props.onRoleIndexChange(event.target.value)}
          disabled={props.disabled}
        >
          <option value="">选择角色</option>
          {props.roles.map((role, index) => (
            <option key={`${role.account}/${role.area}/${role.server}/${role.role}`} value={index}>
              {role.role} · {role.server} · {role.account}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={props.onScan} disabled={props.disabled} title="重新扫描角色">
          <RefreshCw
            className={`h-4 w-4 ${props.scanning ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
    </div>
  );
}

function preferredVariantId(adapter: SyncAdapterSummary) {
  return (
    adapter.variants.find((variant) => variant.id === "official")?.id ??
    adapter.variants[0]?.id ??
    ""
  );
}

function actionLabel(action: "create" | "replace" | "unchanged") {
  return action === "create" ? "新增" : action === "replace" ? "替换" : "不变";
}

function actionClass(action: "create" | "replace" | "unchanged") {
  if (action === "create") return "w-8 shrink-0 text-green-600";
  if (action === "replace") return "w-8 shrink-0 text-amber-600";
  return "w-8 shrink-0 text-muted-foreground";
}

function stateLabel(state: TransactionState) {
  if (state === "committed") return "已提交";
  if (state === "rolledBack") return "已撤销";
  if (state === "preparing") return "准备中";
  return "需处理";
}
