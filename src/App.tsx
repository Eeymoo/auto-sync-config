import { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LauncherHome } from "@/components/launcher/LauncherHome";
import { AccountsPage } from "@/components/accounts/AccountsPage";
import { SyncPage } from "@/components/sync/SyncPage";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { AdvancedTab } from "@/components/settings/AdvancedTab";
import { AboutTab } from "@/components/settings/AboutTab";
import { getGamePath, setGamePath } from "@/lib/game";
import {
  getShowSyncVariantSettings,
  setShowSyncVariantSettings,
} from "@/lib/sync";
import { getVaultPathSetting, setVaultPathSetting } from "@/lib/vault";
import {
  getBackgroundMode,
  getFixedBackgroundId,
  setBackgroundMode,
  setFixedBackgroundId,
  type BackgroundMode,
} from "@/lib/background";

const LicensesTab = lazy(() =>
  import("@/components/settings/LicensesTab").then(({ LicensesTab }) => ({ default: LicensesTab }))
);

function App() {
  const [dark, setDark] = useState(false);
  const [gamePath, setGamePathState] = useState(getGamePath);
  const [vaultPath, setVaultPathState] = useState(getVaultPathSetting);
  const [showSyncVariantSettings, setShowSyncVariantSettingsState] = useState(
    getShowSyncVariantSettings,
  );
  const [backgroundMode, setBackgroundModeState] = useState<BackgroundMode>(
    getBackgroundMode,
  );
  const [fixedBackgroundId, setFixedBackgroundIdState] = useState(
    getFixedBackgroundId,
  );
  const [view, setView] = useState<"home" | "settings" | "accounts" | "sync">("home");

  const toggleTheme = (checked: boolean) => {
    setDark(checked);
    document.documentElement.classList.toggle("dark", checked);
  };

  const handleGamePathChange = (path: string) => {
    setGamePathState(path);
    setGamePath(path);
  };

  const handleVaultPathChange = (path: string) => {
    setVaultPathState(path);
    setVaultPathSetting(path);
  };

  const handleShowSyncVariantSettingsChange = (checked: boolean) => {
    setShowSyncVariantSettingsState(checked);
    setShowSyncVariantSettings(checked);
  };

  const handleBackgroundModeChange = (mode: BackgroundMode) => {
    setBackgroundModeState(mode);
    setBackgroundMode(mode);
  };

  const handleFixedBackgroundChange = (id: string) => {
    setFixedBackgroundIdState(id);
    setFixedBackgroundId(id);
  };

  if (view === "settings") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => setView("home")}>
            ← 返回
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">设置</h1>
        </header>

        <main className="mx-auto min-h-0 w-full max-w-2xl flex-1 p-6">
          <Tabs defaultValue="general" className="flex h-full min-h-0 flex-col">
            <TabsList className="grid w-full shrink-0 grid-cols-4">
              <TabsTrigger value="general">常规</TabsTrigger>
              <TabsTrigger value="advanced">高级</TabsTrigger>
              <TabsTrigger value="licenses">开源许可证</TabsTrigger>
              <TabsTrigger value="about">关于</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="min-h-0 flex-1 overflow-hidden">
              <Card className="max-h-full overflow-y-auto">
                <CardContent className="pt-6">
                  <GeneralTab
                    dark={dark}
                    onDarkChange={toggleTheme}
                    gamePath={gamePath}
                    onGamePathChange={handleGamePathChange}
                    vaultPath={vaultPath}
                    onVaultPathChange={handleVaultPathChange}
                    backgroundMode={backgroundMode}
                    onBackgroundModeChange={handleBackgroundModeChange}
                    fixedBackgroundId={fixedBackgroundId}
                    onFixedBackgroundChange={handleFixedBackgroundChange}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="min-h-0 flex-1 overflow-hidden">
              <Card className="max-h-full overflow-y-auto">
                <CardContent className="pt-6">
                  <AdvancedTab
                    showSyncVariantSettings={showSyncVariantSettings}
                    onShowSyncVariantSettingsChange={handleShowSyncVariantSettingsChange}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="licenses" className="min-h-0 flex-1 overflow-hidden">
              <Card className="max-h-full overflow-y-auto">
                <CardContent className="pt-6">
                  <Suspense fallback={<p className="text-sm text-muted-foreground">正在加载许可证…</p>}>
                    <LicensesTab />
                  </Suspense>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="about" className="min-h-0 flex-1 overflow-hidden">
              <Card className="max-h-full overflow-y-auto">
                <CardContent className="pt-6">
                  <AboutTab />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    );
  }

  if (view === "accounts") {
    return <AccountsPage gamePath={gamePath} onBack={() => setView("home")} />;
  }

  if (view === "sync") {
    return (
      <SyncPage
        gamePath={gamePath}
        showVariantSettings={showSyncVariantSettings}
        onBack={() => setView("home")}
      />
    );
  }

  return (
    <LauncherHome
      gamePath={gamePath}
      onOpenSettings={() => setView("settings")}
      onOpenAccounts={() => setView("accounts")}
      onOpenSync={() => setView("sync")}
    />
  );
}

export default App;
