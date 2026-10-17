import { useEffect, useState } from "react";
import {
  checkUpdate,
  isGamePathValid,
  launchGameDirect,
  launchGameViaLauncher,
  type UpdateCheckResult,
} from "@/lib/game";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, ChevronDown, RefreshCw, Play, KeyRound, ArrowLeftRight } from "lucide-react";
import jx3Logo from "@/assets/jx3-logo.webp";
import { resolveBackground } from "@/lib/background";

interface LauncherHomeProps {
  gamePath: string;
  onOpenSettings: () => void;
  onOpenAccounts: () => void;
  onOpenSync: () => void;
}

/** 启动器首页。 */
export function LauncherHome({ gamePath, onOpenSettings, onOpenAccounts, onOpenSync }: LauncherHomeProps) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [launching, setLaunching] = useState(false);
  // 挂载时解析一次：随机模式此时抽取并缓存结果，回到首页不会反复切换
  const [background] = useState(resolveBackground);
  const needsUpdate = result?.needsUpdate === true;

  useEffect(() => {
    void (async () => {
      const valid = await isGamePathValid(gamePath);
      setPathValid(valid);
      if (valid) {
        setChecking(true);
        setResult(await checkUpdate(gamePath));
        setChecking(false);
      } else {
        setResult(null);
      }
    })();
  }, [gamePath]);

  const handleLaunch = async (viaLauncher: boolean) => {
    setLaunching(true);
    try {
      if (viaLauncher) {
        await launchGameViaLauncher(gamePath);
      } else {
        await launchGameDirect(gamePath);
      }
    } catch (e) {
      console.error("[launch] failed:", e);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="launcher-root relative h-screen w-full select-none overflow-hidden bg-background text-foreground">
      {/* 背景：固定 3:2 视口并等比缩放裁剪，布局不随窗口变化 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={background.src}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 select-none object-cover"
        />
      </div>

      <img
        src={jx3Logo}
        alt="剑网3"
        className="absolute left-6 top-6 h-auto w-32 mix-blend-lighten sm:w-[184px]"
        draggable={false}
      />

      {/* 右上角:配置同步 + 账号管理 + 设置(方形按钮,背景模糊) */}
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="bg-white/10 text-white/85 backdrop-blur-md hover:bg-white/25 hover:text-white"
          onClick={onOpenSync}
          title="配置同步"
        >
          <ArrowLeftRight className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="bg-white/10 text-white/85 backdrop-blur-md hover:bg-white/25 hover:text-white"
          onClick={onOpenAccounts}
          title="账号管理"
        >
          <KeyRound className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="bg-white/10 text-white/85 backdrop-blur-md hover:bg-white/25 hover:text-white"
          onClick={onOpenSettings}
          title="设置"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* 右下角:启动操作和版本状态 */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
        {pathValid === false || !gamePath ? (
          <Button size="lg" onClick={onOpenSettings}>
            设置游戏路径
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {needsUpdate && (
              <Button
                size="lg"
                className="h-12 bg-amber-500 px-6 text-base text-black hover:bg-amber-400"
                disabled={launching || checking}
                onClick={() => handleLaunch(true)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                更新
              </Button>
            )}
            <div className="flex">
              <Button
                size="lg"
                className="h-12 rounded-r-none bg-blue-600/90 px-8 text-base hover:bg-blue-500/90"
                disabled={launching || checking}
                onClick={() => handleLaunch(false)}
              >
                <Play className="mr-2 h-4 w-4" />
                开始游戏
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="lg"
                    className="h-12 rounded-l-none border-l border-white/20 bg-blue-600/90 px-2 hover:bg-blue-500/90"
                    disabled={launching || checking}
                    title="启动方式"
                    aria-label="启动方式"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleLaunch(false)}>
                    直接启动
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleLaunch(true)}>
                    通过启动器启动
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        {gamePath && pathValid !== false && (
          <div className="flex items-center gap-1 rounded-full border border-white/25 bg-black/25 px-3 py-1 text-xs text-white/85 backdrop-blur-md">
            {checking && <RefreshCw className="h-3 w-3 animate-spin" />}
            {checking ? (
              <span>检查更新中…</span>
            ) : (
              <>
                <span>{result?.localVersion ?? "—"}</span>
                <span>/</span>
                <span className="text-amber-300">{result?.remoteVersion ?? "—"}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
