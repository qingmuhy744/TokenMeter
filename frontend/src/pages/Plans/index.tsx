import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { Plan } from "@/api/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { buildPlanTree } from "./utils";
import { PlanTable } from "./PlanTable";
import { PlanDialog } from "./PlanDialog";
import { DeleteDialog } from "./DeleteDialog";

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

  const handleSubmit = async () => {
    try {
      const models = form.model
        .split(/[，,]/)
        .map((m) => m.trim())
        .filter((m) => m !== "");

      if (!editingId && models.length > 1) {
        // Batch creation mode
        for (let i = 0; i < models.length; i++) {
          const m = models[i];
          toast.info(
            t("plans.importing", { current: i + 1, total: models.length })
          );
          // Find parent name to generate a clear plan name
          const parentName =
            plans.find((p) => p.id === form.parent_id)?.name || "Plan";
          await api.createPlan({
            ...form,
            name: `${parentName} (${m})`,
            model: m,
          });
        }
        toast.success(t("plans.importSuccess", { count: models.length }));
      } else {
        // Original single creation/update logic
        if (editingId) {
          const { api_key, ...rest } = form;
          const payload = originalKey !== api_key ? { ...rest, api_key } : rest;
          await api.updatePlan(editingId, payload);
          toast.success(t("plans.planUpdated"));
        } else {
          await api.createPlan(form);
          toast.success(t("plans.planCreated"));
        }
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
    setOriginalKey(plan.api_key || "");
    setForm({
      name: plan.name,
      api_type: (plan.api_type as "openai" | "anthropic") || "openai",
      api_base: plan.api_base || "",
      api_key: plan.api_key || "",
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

  const handleDeleteClick = (id: number) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("plans.title")}</h1>
        <Button
          onClick={() => {
            setForm(defaultForm);
            setEditingId(null);
            setOriginalKey("");
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> {t("plans.newPlan")}
        </Button>
      </div>

      <PlanTable
        planTree={planTree}
        onTest={handleTest}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
      />

      <PlanDialog
        open={open}
        onOpenChange={setOpen}
        editingId={editingId}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        plans={plans}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        target={deleteTarget}
        planTree={planTree}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
