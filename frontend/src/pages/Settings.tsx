import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, Settings as SettingsType } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
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
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      <Card>
        <CardHeader><CardTitle>{t("settings.testConfig")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>{t("settings.defaultPrompt")}</Label><Textarea rows={4} value={settings.default_prompt} onChange={(e) => setSettings({ ...settings, default_prompt: e.target.value })} /></div>
          <div><Label>{t("settings.timeout")}</Label><Input type="number" value={settings.timeout_seconds} onChange={(e) => setSettings({ ...settings, timeout_seconds: +e.target.value })} /></div>
          <div>
            <Label>{t("settings.customBanner")}</Label>
            <Textarea
              rows={3}
              placeholder="HTML... (留空关闭)"
              value={settings.custom_banner || ""}
              onChange={(e) => setSettings({ ...settings, custom_banner: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">支持 HTML，显示在 Status 页面顶部</p>
          </div>
          <Button onClick={handleSaveSettings}>{t("settings.saveSettings")}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("settings.changePassword")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>{t("settings.oldPassword")}</Label><PasswordInput value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} /></div>
          <div><Label>{t("settings.newPassword")}</Label><PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <div><Label>{t("settings.confirmNewPassword")}</Label><PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
          <Button onClick={handleChangePassword}>{t("settings.changePassword")}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("settings.serverLogs")}</CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                <span className="text-xs text-muted-foreground">{t("settings.autoRefresh")}</span>
              </div>
              <Button variant="outline" size="sm" onClick={fetchLogs} disabled={logLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${logLoading ? "animate-spin" : ""}`} />
                {t("settings.refresh")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.clickRefresh")}</p>
          ) : (
            <pre
              ref={logRef}
              className="text-xs bg-black text-green-400 p-4 rounded-md overflow-auto max-h-[400px] font-mono whitespace-pre-wrap"
            >
              {logs.join("\n")}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
