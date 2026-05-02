import { useState } from "react";
import HistoryView from "@/components/HistoryView";
import { api } from "@/api/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function History() {
  const { t } = useTranslation();
  const [statsRange, setStatsRange] = useState<number>(7);
  
  const handleDelete = async (id: number) => {
    if (!confirm(t("history.deleteConfirm"))) return;
    try {
      await api.deleteResult(id);
      toast.success("Result deleted");
      window.location.reload(); 
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("history.title")}</h1>
        <div className="flex bg-muted p-1 rounded-lg">
          {[1, 7, 30].map(d => (
            <Button 
              key={d}
              variant={statsRange === d ? "default" : "ghost"} 
              size="sm" 
              className="h-7 text-xs px-3"
              onClick={() => setStatsRange(d)}
            >
              {d}d Stats
            </Button>
          ))}
        </div>
      </div>
      <HistoryView onDelete={handleDelete} statsDays={statsRange} />
    </div>
  );
}
