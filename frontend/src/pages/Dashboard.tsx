import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { Plan } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => { api.getPlans().then(setPlans); }, []);

  const chartData = plans.filter((p) => p.latest_result && !p.latest_result.error).map((p) => ({
    name: p.name, tps: p.latest_result!.tps_overall ?? 0, ttft: p.latest_result!.ttft_ms ?? 0,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{plan.name}</CardTitle>
                <Badge variant={plan.is_active ? "default" : "secondary"}>{plan.is_active ? t("dashboard.active") : t("dashboard.inactive")}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{plan.api_type} / {plan.model}</p>
            </CardHeader>
            <CardContent>
              {plan.latest_result ? (
                plan.latest_result.error ? (
                  <p className="text-destructive text-sm">{plan.latest_result.error}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-muted-foreground">{t("dashboard.ttft")}</p><p className="text-lg font-semibold">{plan.latest_result.ttft_ms?.toFixed(0)}ms</p></div>
                    <div><p className="text-muted-foreground">{t("dashboard.tps")}</p><p className="text-lg font-semibold">{plan.latest_result.tps_overall?.toFixed(1)}</p></div>
                  </div>
                )
              ) : (<p className="text-muted-foreground text-sm">{t("dashboard.noResults")}</p>)}
            </CardContent>
          </Card>
        ))}
      </div>
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("dashboard.tpsComparison")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="tps" fill="var(--color-chart-1)" name="TPS" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
