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
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-slate-500 text-sm">Monitor LLM performance and response metrics in real-time.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.id} className="rounded-2xl border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden bg-white">
            <CardHeader className="pb-4 bg-slate-50/50 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-slate-900">{plan.name}</CardTitle>
                <Badge 
                  variant={plan.is_active ? "default" : "secondary"}
                  className={plan.is_active ? "bg-green-50 text-green-700 border-green-100 hover:bg-green-100" : "bg-slate-100 text-slate-600 border-slate-200"}
                >
                  {plan.is_active ? t("dashboard.active") : t("dashboard.inactive")}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-1">{plan.api_type} · {plan.model}</p>
            </CardHeader>
            <CardContent className="pt-6">
              {plan.latest_result ? (
                plan.latest_result.error ? (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-red-600 text-sm font-medium">{plan.latest_result.error}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("dashboard.ttft")}</p>
                      <p className="text-2xl font-bold text-slate-900 tracking-tight">{plan.latest_result.ttft_ms?.toFixed(0)}<span className="text-sm font-medium text-slate-400 ml-1">ms</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("dashboard.tps")}</p>
                      <p className="text-2xl font-bold text-slate-900 tracking-tight">{plan.latest_result.tps_overall?.toFixed(1)}</p>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-slate-400 text-sm font-medium italic">{t("dashboard.noResults")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900">{t("dashboard.tpsComparison")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: '1px solid rgba(226, 232, 240, 0.6)',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                    padding: '12px'
                  }}
                />
                <Bar 
                  dataKey="tps" 
                  fill="oklch(0.6 0.2 250)" 
                  name="TPS" 
                  radius={[6, 6, 0, 0]} 
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
