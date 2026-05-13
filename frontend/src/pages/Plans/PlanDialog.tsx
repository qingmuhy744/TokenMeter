import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Plan } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipPortal,
  TooltipPositioner,
  TooltipPopup,
} from "@/components/ui/tooltip";
import { Info, Play } from "lucide-react";
import type { PlanForm } from "./index";

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  form: PlanForm;
  setForm: (form: PlanForm) => void;
  onSubmit: () => void;
  plans: Plan[];
}

export const PlanDialog = ({
  open,
  onOpenChange,
  editingId,
  form,
  setForm,
  onSubmit,
  plans,
}: PlanDialogProps) => {
  const { t } = useTranslation();

  const parentEffective = useMemo(() => {
    if (!form.parent_id) return null;
    return plans.find((p) => p.id === form.parent_id) || null;
  }, [form.parent_id, plans]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  <SelectValue placeholder={t("plans.none")}>
                    {form.parent_id
                      ? plans.find((p) => p.id === form.parent_id)?.name ?? form.parent_id
                      : t("plans.none")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" label={t("plans.none") as string}>
                    {t("plans.none")}
                  </SelectItem>
                  {plans
                    .filter((p) => !p.parent_id && p.id !== editingId)
                    .map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id.toString()}
                        label={p.name}
                      >
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
                className={!form.parent_id ? "bg-muted cursor-not-allowed" : ""}
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
              placeholder={
                parentEffective?.has_effective_api_key
                  ? "Inherited API key configured"
                  : undefined
              }
            />
          </div>

          <div className="space-y-2">
            <Label>{t("plans.customPrompt")}</Label>
            <Textarea
              rows={3}
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
                    <TooltipTrigger
                      render={
                        <Info className="h-3 w-3 text-muted-foreground" />
                      }
                    />
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

          <Button onClick={onSubmit} className="w-full mt-4">
            {editingId ? t("plans.update") : t("plans.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
