import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export default function Settings() {
  const [settings, setSettings] = useState({ default_prompt: "", timeout_seconds: 30 });
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => { api.getSettings().then(setSettings); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const fetchLogs = async () => {
    setLogLoading(true);
    try {
      const data = await api.getLogs(200);
      setLogs(data.lines);
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLogLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try { await api.updateSettings(settings); toast.success("Settings saved"); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match"); return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters"); return;
    }
    try {
      await api.changePassword(oldPassword, newPassword);
      toast.success("Password changed"); setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Test Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Default Prompt</Label><Textarea rows={4} value={settings.default_prompt} onChange={(e) => setSettings({ ...settings, default_prompt: e.target.value })} /></div>
          <div><Label>Timeout (seconds)</Label><Input type="number" value={settings.timeout_seconds} onChange={(e) => setSettings({ ...settings, timeout_seconds: +e.target.value })} /></div>
          <Button onClick={handleSaveSettings}>Save Settings</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Old Password</Label><Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} /></div>
          <div><Label>New Password</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <div><Label>Confirm New Password</Label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
          <Button onClick={handleChangePassword}>Change Password</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Server Logs</CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                <span className="text-xs text-muted-foreground">Auto</span>
              </div>
              <Button variant="outline" size="sm" onClick={fetchLogs} disabled={logLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${logLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Click Refresh to load logs</p>
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
