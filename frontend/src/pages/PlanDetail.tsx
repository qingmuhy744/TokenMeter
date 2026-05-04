import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import HistoryView from "@/components/HistoryView";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PlanDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isPublic = window.location.pathname.startsWith("/public");
  const backPath = isPublic ? "/status" : "/history";
  const backLabel = isPublic ? t("publicHistory.backToStatus") : t("history.title");

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-3">
          <Link
            to={backPath}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex items-center rounded-xl text-muted-foreground hover:text-foreground transition-colors w-fit")}
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-2" />
            {backLabel}
          </Link>
          <h1 className="text-2xl font-heading font-bold text-foreground tracking-tight">{t("planDetail.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("planDetail.description")}</p>
        </div>

        <div className="bg-card/50 border border-border/50 rounded-3xl p-1">
          <HistoryView planId={id} isPublic={isPublic} />
        </div>
      </div>
    </div>
  );
}