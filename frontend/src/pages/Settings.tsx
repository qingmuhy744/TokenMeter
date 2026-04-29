import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function Settings() {
  const [settings, setSettings] = useState({ default_prompt: "", timeout_seconds: 30 });
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => { api.getSettings().then(setSettings); }, []);

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
    </div>
  );
}
