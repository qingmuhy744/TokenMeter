import HistoryView from "@/components/HistoryView";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PublicHistory() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("plan_id") || undefined;

  return (
    <div className="min-h-screen bg-slate-50/30 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-2">
            <Link 
              to="/status" 
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex items-center rounded-xl text-slate-500 hover:text-slate-900 transition-colors")}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back to Status
            </Link>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Public History</h1>
          <p className="text-slate-500 text-sm">View community performance data and historical trends.</p>
        </div>

        <div className="bg-white/50 rounded-3xl p-1">
          <HistoryView planId={planId} isPublic={true} />
        </div>
      </div>
    </div>
  );
}
