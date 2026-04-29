import { useEffect, useState, useRef } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export default function Settings() {
  const [settings, setSettings] = useState({ default_prompt: "", timeout_seconds: 30 });
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => { api.getSettings().then(setSettings); }, []);

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
    try {
      await api.changePassword(oldPassword, newPassword);
      toast.success("Password changed"); setOldPassword(""); setNewPassword("");
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
          <Button onClick={handleChangePassword}>Change Password</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Server Logs</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={logLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${logLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
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
