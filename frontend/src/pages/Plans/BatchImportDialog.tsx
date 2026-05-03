import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Plan } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface BatchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: Plan[];
  onSuccess: () => void;
}

export const BatchImportDialog = ({
  open,
  onOpenChange,
  plans,
  onSuccess,
}: BatchImportDialogProps) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"text" | "json">("text");
  const [parentId, setParentId] = useState<number | null>(null);
  const [textValue, setTextValue] = useState("");
  const [jsonValue, setJsonValue] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      if (mode === "text") {
        if (!parentId) {
          toast.error(t("plans.selectParent") || "Please select a provider suite");
          return;
        }
        const models = textValue
          .split("\n")
          .map((m) => m.trim())
          .filter((m) => m !== "");

        if (models.length === 0) return;

        const parent = plans.find((p) => p.id === parentId);
        const parentName = parent?.name || "Provider";

        for (let i = 0; i < models.length; i++) {
          const m = models[i];
          toast.info(t("plans.importing", { current: i + 1, total: models.length }));
          await api.createPlan({
            name: `${parentName} (${m})`,
            parent_id: parentId,
            model: m,
            is_active: true,
            api_type: parent?.api_type || "openai",
          });
        }
        toast.success(t("plans.importSuccess", { count: models.length }));
      } else {
        // JSON mode
        let items: Partial<Plan>[];
        try {
          items = JSON.parse(jsonValue);
          if (!Array.isArray(items)) {
            items = [items];
          }
        } catch {
          toast.error(t("plans.invalidJson"));
          return;
        }

        for (let i = 0; i < items.length; i++) {
          toast.info(t("plans.importing", { current: i + 1, total: items.length }));
          await api.createPlan(items[i]);
        }
        toast.success(t("plans.importSuccess", { count: items.length }));
      }
      onSuccess();
      onOpenChange(false);
      setTextValue("");
      setJsonValue("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("plans.batchImport")}</DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "text" | "json")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="text">{t("plans.textMode")}</TabsTrigger>
            <TabsTrigger value="json">{t("plans.jsonMode")}</TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("plans.parentPlan")}</Label>
              <Select
                value={parentId?.toString() || ""}
                onValueChange={(v) => setParentId(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("plans.parentPlan")} />
                </SelectTrigger>
                <SelectContent>
                  {plans
                    .filter((p) => !p.parent_id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("plans.model")}</Label>
              <Textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder={t("plans.modelListPlaceholder")}
                className="h-64 font-mono"
              />
            </div>
          </TabsContent>

          <TabsContent value="json" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>JSON</Label>
              <Textarea
                value={jsonValue}
                onChange={(e) => setJsonValue(e.target.value)}
                placeholder={t("plans.jsonPlaceholder")}
                className="h-[400px] font-mono text-xs"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleImport} disabled={isImporting || (mode === "text" && (!parentId || !textValue)) || (mode === "json" && !jsonValue)}>
            {isImporting ? t("plans.parsing") : t("plans.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
