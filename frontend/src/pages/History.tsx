import HistoryView from "@/components/HistoryView";
import { api } from "@/api/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function History() {
  const { t } = useTranslation();
  
  const handleDelete = async (id: number) => {
    if (!confirm(t("history.deleteConfirm"))) return;
    try {
      await api.deleteResult(id);
      toast.success("Result deleted");
      // Trigger a refresh by reloading current view or state
      window.location.reload(); 
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return <HistoryView onDelete={handleDelete} />;
}
