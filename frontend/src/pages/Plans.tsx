import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { Plan } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Play, Pencil, Trash2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPortal, TooltipPositioner, TooltipPopup } from "@/components/ui/tooltip";

const defaultForm = {
  name: "", api_type: "openai", api_base: "", api_key: "", model: "",
  prompt: "", max_tokens: 256, test_count: 3, interval_minutes: 60, is_active: true,
};

interface PlanWithChildren extends Plan {
  children: PlanWithChildren[];
}

const buildPlanTree = (plans: Plan[]): PlanWithChildren[] => {
  const map: Record<number, PlanWithChildren> = {};
  const roots: PlanWithChildren[] = [];

  plans.forEach(p => {
    map[p.id] = { ...p, children: [] };
  });

  plans.forEach(p => {
    if (p.parent_id && map[p.parent_id]) {
      map[p.parent_id].children.push(map[p.id]);
    } else {
      roots.push(map[p.id]);
    }
  });

  return roots;
};

export default function Plans() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const planTree = useMemo(() => buildPlanTree(plans), [plans]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [originalKey, setOriginalKey] = useState("");

  const loadPlans = () => api.getPlans().then(setPlans);
  useEffect(() => { loadPlans(); }, []);

  const handleSubmit = async () => {
    try {
      if (editingId) {
        const { api_key, ...rest } = form;
        const payload = originalKey !== api_key ? { ...rest, api_key } : rest;
        await api.updatePlan(editingId, payload); toast.success(t("plans.planUpdated"));
      }
      else { await api.createPlan(form); toast.success(t("plans.planCreated")); }
      setOpen(false); setForm(defaultForm); setEditingId(null); loadPlans();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleEdit = (plan: Plan) => {
    const key = plan.api_key;
    setOriginalKey(key);
    setForm({ name: plan.name, api_type: plan.api_type as "openai" | "anthropic", api_base: plan.api_base,
      api_key: key, model: plan.model, prompt: plan.prompt || "",
      max_tokens: plan.max_tokens, test_count: plan.test_count,
      interval_minutes: plan.interval_minutes, is_active: plan.is_active });
    setEditingId(plan.id); setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("plans.deleteConfirm"))) return;
    await api.deletePlan(id); toast.success(t("plans.planDeleted")); loadPlans();
  };

  const handleTest = async (id: number) => {
    toast.info(t("plans.runningTest"));
    try { await api.triggerTest(id); toast.success(t("plans.testCompleted")); loadPlans(); }
    catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const fieldDisplay = (own: string | null | undefined, effective: string | null | undefined) => {
    if (own != null && own !== "") return <>{own}</>;
    if (effective) return (
      <Tooltip>
        <TooltipTrigger render={<span className="text-muted-foreground italic cursor-default" tabIndex={0}>{effective}</span>} />
        <TooltipPortal>
          <TooltipPositioner>
            <TooltipPopup>{t("plans.inheritedFromParent")}</TooltipPopup>
          </TooltipPositioner>
        </TooltipPortal>
      </Tooltip>
    );
    return <span className="text-muted-foreground italic">-</span>;
  };

  const renderRow = (node: PlanWithChildren, depth: number = 0): React.ReactNode => (
    <Fragment key={node.id}>
      <TableRow>
        <TableCell className="font-medium">
          <span style={{ paddingLeft: `${depth * 2}rem` }}>
            {depth > 0 && <span className="text-muted-foreground select-none">{"└─ "}</span>}
            {node.name}
          </span>
        </TableCell>
        <TableCell>{fieldDisplay(node.api_type, node.effective_api_type)}</TableCell>
        <TableCell>{fieldDisplay(node.api_base, node.effective_api_base)}</TableCell>
        <TableCell>{fieldDisplay(node.model, node.effective_model)}</TableCell>
        <TableCell>{node.interval_minutes}m</TableCell>
        <TableCell><Badge variant={node.is_active ? "default" : "secondary"}>{node.is_active ? t("dashboard.active") : t("dashboard.inactive")}</Badge></TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => handleTest(node.id)}><Play className="h-3 w-3" /></Button>
            <Button size="sm" variant="outline" onClick={() => handleEdit(node)}><Pencil className="h-3 w-3" /></Button>
            <Button size="sm" variant="outline" onClick={() => handleDelete(node.id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        </TableCell>
      </TableRow>
      {node.children.map(child => renderRow(child, depth + 1))}
    </Fragment>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("plans.title")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button onClick={() => { setForm(defaultForm); setEditingId(null); setOriginalKey(""); }} />}>
            <Plus className="h-4 w-4 mr-2" /> {t("plans.newPlan")}
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? t("plans.editPlan") : t("plans.newPlan")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>{t("plans.name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>{t("plans.apiType")}</Label>
                <Select value={form.api_type} onValueChange={(v) => setForm({ ...form, api_type: v ?? "openai" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="openai">OpenAI Compatible</SelectItem><SelectItem value="anthropic">Anthropic</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>{t("plans.apiBaseUrl")}</Label><Input value={form.api_base} onChange={(e) => setForm({ ...form, api_base: e.target.value })} /></div>
              <div><Label>{t("plans.apiKey")}</Label><PasswordInput value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /></div>
              <div><Label>{t("plans.model")}</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
              <div><Label>{t("plans.customPrompt")}</Label><Input value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{t("plans.maxTokens")}</Label>
                  <Input type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: +e.target.value })} />
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                    {t("plans.maxTokensDesc")}
                  </p>
                </div>
                <div><Label>{t("plans.testCount")}</Label><Input type="number" value={form.test_count} onChange={(e) => setForm({ ...form, test_count: +e.target.value })} /></div>
                <div><Label>{t("plans.interval")}</Label><Input type="number" value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: +e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>{t("plans.active")}</Label>
              </div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? t("plans.update") : t("plans.create")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>{t("plans.name")}</TableHead><TableHead>{t("plans.apiType")}</TableHead><TableHead>{t("plans.apiBaseUrl")}</TableHead><TableHead>{t("plans.model")}</TableHead><TableHead>{t("plans.interval")}</TableHead><TableHead>{t("plans.active")}</TableHead><TableHead>Actions</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {planTree.map(node => renderRow(node, 0))}
        </TableBody>
      </Table>
    </div>
  );
}
