import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { Settings as SettingsType } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

export default function Settings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SettingsType>({ default_prompt: "", timeout_seconds: 30, custom_banner: "" });
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLogs = async () => {
    setLogLoading(true);
    try {
      const data = await api.getLogs(200);
      setLogs(data.lines);
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    api.getSettings().then((data) => setSettings(s => ({ ...s, ...data })));
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const handleSaveSettings = async () => {
    try {
      await api.updateSettings(settings);
      toast.success(t("settings.settingsSaved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t("settings.passwordsNoMatch")); return;
    }
    if (newPassword.length < 8) {
      toast.error(t("settings.passwordTooShort")); return;
    }
    try {
      await api.changePassword(oldPassword, newPassword);
      toast.success(t("settings.passwordChanged")); setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-heading font-bold text-foreground tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("settings.description")}</p>
      </div>

      <div className="grid gap-8">
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-lg font-heading font-semibold text-foreground/90">{t("settings.testConfig")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/70">{t("settings.defaultPrompt")}</Label>
              <Textarea 
                rows={4} 
                value={settings.default_prompt} 
                onChange={(e) => setSettings({ ...settings, default_prompt: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/70">{t("settings.timeout")}</Label>
              <div className="flex items-center gap-3">
                <Input 
                  type="number" 
                  className="max-w-[120px]"
                  value={settings.timeout_seconds} 
                  onChange={(e) => setSettings({ ...settings, timeout_seconds: +e.target.value })} 
                />
                <span className="text-sm text-muted-foreground font-medium uppercase tracking-wide">{t("settings.seconds")}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/70">{t("settings.customBanner")}</Label>
              <Textarea
                rows={3}
                placeholder="HTML..."
                value={settings.custom_banner || ""}
                onChange={(e) => setSettings({ ...settings, custom_banner: e.target.value })}
              />
              <p className="text-xs text-muted-foreground/50 font-medium mt-1.5 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                {t("settings.bannerHint")}
              </p>
            </div>
            <div className="pt-2">
              <Button onClick={handleSaveSettings} className="rounded-xl px-6 font-medium shadow-sm">
                {t("settings.saveSettings")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-lg font-heading font-semibold text-foreground/90">{t("settings.changePassword")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground/70">{t("settings.oldPassword")}</Label>
                <PasswordInput 
                  value={oldPassword} 
                  onChange={(e) => setOldPassword(e.target.value)} 
                />
              </div>
              <div />
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground/70">{t("settings.newPassword")}</Label>
                <PasswordInput 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground/70">{t("settings.confirmNewPassword")}</Label>
                <PasswordInput 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={handleChangePassword} className="rounded-xl px-6 font-medium shadow-sm">
                {t("settings.changePassword")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-heading font-semibold text-foreground/90">{t("settings.serverLogs")}</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border/50 rounded-xl">
                  <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">{t("settings.autoRefresh")}</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchLogs} 
                  disabled={logLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${logLoading ? "animate-spin" : ""}`} />
                  {t("settings.refresh")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {logs.length === 0 ? (
              <div className="flex items-center justify-center py-12 bg-muted rounded-2xl border border-dashed border-border/50">
                <p className="text-muted-foreground/50 text-sm font-medium italic">{t("settings.clickRefresh")}</p>
              </div>
            ) : (
              <div className="relative group">
                <pre
                  ref={logRef}
                  className="text-[11px] bg-slate-950 text-slate-300 p-6 rounded-2xl overflow-auto max-h-[500px] font-mono whitespace-pre-wrap leading-relaxed shadow-inner border border-border/50"
                >
                  {logs.join("\n")}
                </pre>
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Badge className="bg-muted text-muted-foreground/60 border-border/50 font-mono text-[9px] uppercase">{t("settings.logsConsole")}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
