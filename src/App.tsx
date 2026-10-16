import { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LauncherHome } from "@/components/launcher/LauncherHome";
import { AccountsPage } from "@/components/accounts/AccountsPage";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { AboutTab } from "@/components/settings/AboutTab";
import { getGamePath, setGamePath } from "@/lib/game";

const LicensesTab = lazy(() =>
  import("@/components/settings/LicensesTab").then(({ LicensesTab }) => ({ default: LicensesTab }))
);

function App() {
  const [dark, setDark] = useState(false);
  const [gamePath, setGamePathState] = useState(getGamePath);
  const [view, setView] = useState<"home" | "settings" | "accounts">("home");

  const toggleTheme = (checked: boolean) => {
    setDark(checked);
    document.documentElement.classList.toggle("dark", checked);
  };

  const handleGamePathChange = (path: string) => {
    setGamePathState(path);
    setGamePath(path);
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
            <TabsList className="grid w-full shrink-0 grid-cols-3">
              <TabsTrigger value="general">常规</TabsTrigger>
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
    return <AccountsPage onBack={() => setView("home")} />;
  }

  return (
    <LauncherHome
      gamePath={gamePath}
      onOpenSettings={() => setView("settings")}
      onOpenAccounts={() => setView("accounts")}
    />
  );
}

export default App;
