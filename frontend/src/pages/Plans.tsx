import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Play, Pencil, Trash2 } from "lucide-react";

const defaultForm = {
  name: "", api_type: "openai", api_base: "", api_key: "", model: "",
  prompt: "", max_tokens: 256, test_count: 3, interval_minutes: 60, is_active: true,
};

export default function Plans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadPlans = () => api.getPlans().then(setPlans);
  useEffect(() => { loadPlans(); }, []);

  const handleSubmit = async () => {
    try {
      if (editingId) { await api.updatePlan(editingId, form); toast.success("Plan updated"); }
      else { await api.createPlan(form); toast.success("Plan created"); }
      setOpen(false); setForm(defaultForm); setEditingId(null); loadPlans();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleEdit = (plan: any) => {
    setForm({ name: plan.name, api_type: plan.api_type, api_base: plan.api_base,
      api_key: plan.api_key, model: plan.model, prompt: plan.prompt || "",
      max_tokens: plan.max_tokens, test_count: plan.test_count,
      interval_minutes: plan.interval_minutes, is_active: plan.is_active });
    setEditingId(plan.id); setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this plan?")) return;
    await api.deletePlan(id); toast.success("Plan deleted"); loadPlans();
  };

  const handleTest = async (id: number) => {
    toast.info("Running speed test...");
    try { await api.triggerTest(id); toast.success("Test completed"); loadPlans(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Token Plans</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button onClick={() => { setForm(defaultForm); setEditingId(null); }} />}>
            <Plus className="h-4 w-4 mr-2" /> New Plan
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Edit Plan" : "New Plan"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>API Type</Label>
                <Select value={form.api_type} onValueChange={(v) => setForm({ ...form, api_type: v ?? "openai" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="openai">OpenAI Compatible</SelectItem><SelectItem value="anthropic">Anthropic</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>API Base URL</Label><Input value={form.api_base} onChange={(e) => setForm({ ...form, api_base: e.target.value })} /></div>
              <div><Label>API Key</Label><Input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /></div>
              <div><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
              <div><Label>Custom Prompt (optional)</Label><Input value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Max Tokens</Label><Input type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: +e.target.value })} /></div>
                <div><Label>Test Count</Label><Input type="number" value={form.test_count} onChange={(e) => setForm({ ...form, test_count: +e.target.value })} /></div>
                <div><Label>Interval (min)</Label><Input type="number" value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: +e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? "Update" : "Create"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Model</TableHead><TableHead>Interval</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan.id}>
              <TableCell className="font-medium">{plan.name}</TableCell>
              <TableCell>{plan.api_type}</TableCell>
              <TableCell>{plan.model}</TableCell>
              <TableCell>{plan.interval_minutes}m</TableCell>
              <TableCell><Badge variant={plan.is_active ? "default" : "secondary"}>{plan.is_active ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => handleTest(plan.id)}><Play className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => handleEdit(plan)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(plan.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
