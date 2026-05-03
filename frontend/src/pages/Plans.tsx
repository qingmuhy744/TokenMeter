import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { Plan } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Play, Pencil, Trash2, PlayCircle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipPortal,
  TooltipPositioner,
  TooltipPopup,
} from "@/components/ui/tooltip";

const defaultForm = {
  name: "",
  api_type: "openai",
  api_base: "",
  api_key: "",
  model: "",
  prompt: "",
  max_tokens: 256,
  test_count: 3,
  interval_minutes: 60,
  is_active: true,
  parent_id: null as number | null,
  multiplier: 1.0,
};

interface PlanWithChildren extends Plan {
  children: PlanWithChildren[];
}

const buildPlanTree = (plans: Plan[]): PlanWithChildren[] => {
  const map: Record<number, PlanWithChildren> = {};
  const roots: PlanWithChildren[] = [];

  plans.forEach((p) => {
    map[p.id] = { ...p, children: [] };
  });

  plans.forEach((p) => {
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const loadPlans = () => api.getPlans().then(setPlans);
  useEffect(() => {
    loadPlans();
  }, []);

  const parentEffective = useMemo(() => {
    if (!form.parent_id) return null;
    return plans.find((p) => p.id === form.parent_id) || null;
  }, [form.parent_id, plans]);

  const findInTree = (
    tree: PlanWithChildren[],
    id: number
  ): PlanWithChildren | null => {
    for (const node of tree) {
      if (node.id === id) return node;
      const found = findInTree(node.children, id);
      if (found) return found;
    }
    return null;
  };

  const handleSubmit = async () => {
    try {
      if (editingId) {
        const { api_key, ...rest } = form;
        const payload = originalKey !== api_key ? { ...rest, api_key } : rest;
        await api.updatePlan(editingId, payload);
        toast.success(t("plans.planUpdated"));
      } else {
        await api.createPlan(form);
        toast.success(t("plans.planCreated"));
      }
      setOpen(false);
      setForm(defaultForm);
      setEditingId(null);
      loadPlans();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleEdit = (plan: Plan) => {
    const key = plan.api_key;
    setOriginalKey(key);
    setForm({
      name: plan.name,
      api_type: (plan.api_type as "openai" | "anthropic") || "openai",
      api_base: plan.api_base || "",
      api_key: key || "",
      model: plan.model || "",
      prompt: plan.prompt || "",
      max_tokens: plan.max_tokens ?? 256,
      test_count: plan.test_count ?? 3,
      interval_minutes: plan.interval_minutes,
      is_active: plan.is_active,
      parent_id: plan.parent_id ?? null,
      multiplier: plan.multiplier ?? 1.0,
    });
    setEditingId(plan.id);
    setOpen(true);
  };

  const openDeleteConfirm = (id: number) => {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    setDeleteTarget(plan);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deletePlan(deleteTarget.id);
      toast.success(t("plans.planDeleted"));
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      loadPlans();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleTest = async (id: number, isSuite: boolean) => {
    toast.info(t("plans.runningTest"));
    try {
      await api.triggerTest(id);
      if (isSuite) {
        toast.success(t("plans.testStarted"));
      } else {
        toast.success(t("plans.testCompleted"));
      }
      loadPlans();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const fieldDisplay = (
    own: string | number | null | undefined,
    effective: string | number | null | undefined
  ) => {
    if (own != null && own !== "") return <>{own}</>;
    if (effective != null && effective !== "")
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="text-muted-foreground italic cursor-default"
                tabIndex={0}
              >
                {effective}
              </span>
            }
          />
          <TooltipPortal>
            <TooltipPositioner>
              <TooltipPopup>{t("plans.inheritedFromParent")}</TooltipPopup>
            </TooltipPositioner>
          </TooltipPortal>
        </Tooltip>
      );
    return <span className="text-muted-foreground italic">-</span>;
  };

  const renderRow = (
    node: PlanWithChildren,
    depth: number = 0
  ): React.ReactNode => (
    <Fragment key={node.id}>
      <TableRow className={depth > 0 ? "bg-muted/30" : ""}>
        <TableCell className="font-medium">
          <span style={{ paddingLeft: `${depth * 2}rem` }}>
            {depth > 0 && (
              <span className="text-muted-foreground select-none">
                {"└─ "}
              </span>
            )}
            {node.name}
          </span>
        </TableCell>
        <TableCell>
          {fieldDisplay(node.api_type, node.effective_api_type)}
        </TableCell>
        <TableCell>
          {fieldDisplay(node.api_base, node.effective_api_base)}
        </TableCell>
        <TableCell>
          {fieldDisplay(node.model, node.effective_model)}
        </TableCell>
        <TableCell>
          {node.interval_minutes}m
          {node.parent_id && node.multiplier !== 1 && (
            <span className="text-[10px] text-muted-foreground ml-1">
              (x{node.multiplier})
            </span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={node.is_active ? "default" : "secondary"}>
            {node.is_active ? t("dashboard.active") : t("dashboard.inactive")}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(node.id, !node.parent_id)}
                  >
                    {node.parent_id ? (
                      <Play className="h-3 w-3" />
                    ) : (
                      <PlayCircle className="h-3 w-3 text-primary" />
                    )}
                  </Button>
                }
              />
              <TooltipPortal>
                <TooltipPositioner>
                  <TooltipPopup>
                    {node.parent_id ? t("plans.runningTest") : t("plans.runAll")}
                  </TooltipPopup>
                </TooltipPositioner>
              </TooltipPortal>
            </Tooltip>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEdit(node)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDeleteConfirm(node.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {node.children.map((child) => renderRow(child, depth + 1))}
    </Fragment>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("plans.title")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button
                onClick={() => {
                  setForm(defaultForm);
                  setEditingId(null);
                  setOriginalKey("");
                }}
              >
                <Plus className="h-4 w-4 mr-2" /> {t("plans.addPlan")}
              </Button>
            }
          />
          <DialogContent className="max-w-lg overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>
                {editingId ? t("plans.editPlan") : t("plans.addPlan")}
              </DialogTitle>
              {!editingId && (
                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-100 dark:border-blue-900 flex gap-2 items-start mt-2">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-normal">
                    {t("plans.providerHelp")}
                  </p>
                </div>
              )}
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("plans.name")}</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("plans.parentPlan")}</Label>
                  <Select
                    value={form.parent_id?.toString() || "none"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        parent_id: v === "none" ? null : parseInt(v as string),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("plans.none")}</SelectItem>
                      {plans
                        .filter((p) => !p.parent_id && p.id !== editingId)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("plans.apiType")}</Label>
                  <Select
                    value={form.api_type || "openai"}
                    onValueChange={(v) =>
                      setForm({ ...form, api_type: v as "openai" | "anthropic" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI Compatible</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                  {!form.api_type && (
                    <p className="text-[10px] text-muted-foreground italic">
                      {t("plans.inheritedFromParent")}: {parentEffective?.effective_api_type}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t("plans.model")}</Label>
                  <Input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder={
                      !form.parent_id
                        ? "Provider Suite (No Model needed)"
                        : parentEffective?.effective_model || undefined
                    }
                    disabled={!form.parent_id}
                    className={
                      !form.parent_id ? "bg-muted cursor-not-allowed" : ""
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("plans.apiBaseUrl")}</Label>
                <Input
                  value={form.api_base}
                  onChange={(e) => setForm({ ...form, api_base: e.target.value })}
                  placeholder={parentEffective?.effective_api_base || undefined}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("plans.apiKey")}</Label>
                <PasswordInput
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder={parentEffective?.effective_api_key || undefined}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("plans.customPrompt")}</Label>
                <Input
                  value={form.prompt}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  placeholder={parentEffective?.effective_prompt || undefined}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t("plans.maxTokens")}</Label>
                  <Input
                    type="number"
                    value={form.max_tokens || ""}
                    onChange={(e) =>
                      setForm({ ...form, max_tokens: parseInt(e.target.value) })
                    }
                    placeholder={parentEffective?.effective_max_tokens?.toString()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("plans.testCount")}</Label>
                  <Input
                    type="number"
                    value={form.test_count || ""}
                    onChange={(e) =>
                      setForm({ ...form, test_count: parseInt(e.target.value) })
                    }
                    placeholder={parentEffective?.effective_test_count?.toString()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("plans.interval")}</Label>
                  <Input
                    type="number"
                    value={form.interval_minutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        interval_minutes: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              {form.parent_id && (
                <div className="space-y-2 border-t pt-4">
                  <div className="flex justify-between items-center">
                    <Label className="flex items-center gap-1">
                      {t("plans.multiplier")}
                      <Tooltip>
                        <TooltipTrigger render={<Info className="h-3 w-3 text-muted-foreground" />} />
                        <TooltipPortal>
                          <TooltipPositioner>
                            <TooltipPopup>{t("plans.multiplierDesc")}</TooltipPopup>
                          </TooltipPositioner>
                        </TooltipPortal>
                      </Tooltip>
                    </Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      x{form.multiplier.toFixed(1)}
                    </span>
                  </div>
                  <Input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={form.multiplier}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        multiplier: parseFloat(e.target.value),
                      })
                    }
                    className="h-8"
                  />
                  {parentEffective && (
                    <div className="bg-muted/50 p-2 rounded text-[11px] text-muted-foreground flex flex-col gap-1">
                      <p className="font-medium text-foreground flex items-center gap-1">
                        <Play className="h-3 w-3" />
                        {t("plans.actualInterval")}:{" "}
                        {Math.round(
                          parentEffective.interval_minutes / form.multiplier
                        )}
                        m
                      </p>
                      <p>
                        {t("plans.actualIntervalDesc", {
                          minutes: Math.round(
                            parentEffective.interval_minutes / form.multiplier
                          ),
                          parent: parentEffective.interval_minutes,
                          mult: form.multiplier.toFixed(1),
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label>{t("plans.active")}</Label>
              </div>

              <Button onClick={handleSubmit} className="w-full mt-4">
                {editingId ? t("plans.update") : t("plans.create")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("plans.name")}</TableHead>
              <TableHead>{t("plans.apiType")}</TableHead>
              <TableHead>{t("plans.apiBaseUrl")}</TableHead>
              <TableHead>{t("plans.model")}</TableHead>
              <TableHead>{t("plans.interval")}</TableHead>
              <TableHead>{t("plans.active")}</TableHead>
              <TableHead className="text-right">{t("plans.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {planTree.length > 0 ? (
              planTree.map((node) => renderRow(node, 0))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-10 text-muted-foreground"
                >
                  {t("dashboard.noPlans")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("plans.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {(() => {
                if (!deleteTarget) return "";
                const node = findInTree(planTree, deleteTarget.id);
                const childCount = node ? node.children.length : 0;
                if (childCount > 0) {
                  return t("plans.cascadeDeleteWarning", {
                    count: childCount,
                    name: deleteTarget.name,
                  });
                }
                return t("plans.deleteConfirm", { name: deleteTarget.name });
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteTarget(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t("plans.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
