import { useTranslation } from "react-i18next";
import MatrixTable from "@/components/MatrixTable";

export default function DashboardMatrix() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-heading font-bold text-foreground">{t("nav.dashboard")} - Matrix</h1>
        <p className="text-sm text-muted-foreground">Monitor performance metrics across all plans and time periods.</p>
      </div>
      <MatrixTable />
    </div>
  );
}
