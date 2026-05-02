import { useTranslation } from "react-i18next";
import MatrixTable from "@/components/MatrixTable";

export default function DashboardMatrix() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.dashboard")} - Matrix</h1>
      </div>
      <MatrixTable />
    </div>
  );
}
