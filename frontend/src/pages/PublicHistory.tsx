import { useTranslation } from "react-i18next";
import HistoryView from "@/components/HistoryView";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PublicHistory() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("plan_id") || undefined;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-2">
            <Link 
              to="/status" 
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex items-center rounded-xl text-muted-foreground hover:text-foreground transition-colors")}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              {t("publicHistory.backToStatus")}
            </Link>
          </div>
          <h1 className="text-2xl font-heading font-bold text-foreground tracking-tight">{t("publicHistory.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("publicHistory.description")}</p>
        </div>

        <div className="bg-card/50 border border-border/50 rounded-3xl p-1">
          <HistoryView planId={planId} isPublic={true} />
        </div>
      </div>
    </div>
  );
}