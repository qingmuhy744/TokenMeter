import { useState } from "react";
import HistoryView from "@/components/HistoryView";
import { api } from "@/api/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-heading font-bold text-foreground tracking-tight">{t("history.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("history.description")}</p>
        </div>
        <div className="flex bg-muted p-1 rounded-xl border border-border/50">
          {[1, 7, 30].map(d => (
            <Button 
              key={d}
              variant={statsRange === d ? "default" : "ghost"} 
              size="sm" 
              className={cn(
                "h-8 text-xs px-4 rounded-lg font-medium transition-all",
                statsRange === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setStatsRange(d)}
            >
              {d}d Stats
            </Button>
          ))}
        </div>
      </div>
      
      <div className="bg-card/50 border border-border/50 rounded-3xl p-1">
        <HistoryView onDelete={handleDelete} statsDays={statsRange} />
      </div>
    </div>
  );
}
