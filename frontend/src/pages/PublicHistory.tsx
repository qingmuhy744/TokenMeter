import HistoryView from "@/components/HistoryView";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PublicHistory() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("plan_id") || undefined;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link 
            to="/status" 
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex items-center")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Status
          </Link>
        </div>
        <HistoryView planId={planId} isPublic={true} />
      </div>
    </div>
  );
}
