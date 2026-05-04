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

  const activeCount = plans.filter(p => p.is_active).length;
  const errorCount = plans.filter(p => p.latest_result?.error).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1 animate-fade-in-up">
        <h1 className="text-2xl font-heading font-bold text-foreground tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("dashboard.description")}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 animate-fade-in-up animate-delay-100">
        <div className="rounded-2xl bg-card border border-border/50 p-4 ring-1 ring-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("dashboard.activePlans")}</p>
          <p className="text-2xl font-bold text-foreground mt-1 font-heading">{activeCount}</p>
        </div>
        <div className="rounded-2xl bg-card border border-border/50 p-4 ring-1 ring-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("dashboard.totalPlans")}</p>
          <p className="text-2xl font-bold text-foreground mt-1 font-heading">{plans.length}</p>
        </div>
        <div className="rounded-2xl bg-card border border-border/50 p-4 ring-1 ring-border/50">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("dashboard.withErrors")}</p>
          <p className="text-2xl font-bold text-red mt-1 font-heading">{errorCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.map((plan, i) => (
          <Card
            key={plan.id}
            className="hover:ring-primary/20 hover:shadow-[0_0_20px_color-mix(in_oklch,var(--color-primary)_15%,transparent)] transition-all duration-300"
            style={{ animationDelay: `${0.15 + i * 0.05}s` }}
          >
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-heading font-semibold text-foreground/90">{plan.name}</CardTitle>
                <Badge
                  variant={plan.is_active ? "default" : "secondary"}
                  className={plan.is_active ? "bg-green/10 text-green border-green/20" : ""}
                >
                  {plan.is_active ? t("dashboard.active") : t("dashboard.inactive")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1">{plan.api_type} · {plan.model}</p>
            </CardHeader>
            <CardContent className="pt-4">
              {plan.latest_result ? (
                plan.latest_result.error ? (
                  <div className="p-3 rounded-xl bg-red/10 border border-red/20">
                    <p className="text-red text-sm font-medium">{plan.latest_result.error}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest font-mono">{t("dashboard.ttft")}</p>
                      <p className="text-xl font-bold text-foreground tracking-tight font-heading">
                        {plan.latest_result.ttft_ms?.toFixed(0)}
                        <span className="text-xs font-medium text-muted-foreground ml-1 font-mono">ms</span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest font-mono">{t("dashboard.tps")}</p>
                      <p className="text-xl font-bold text-foreground tracking-tight font-heading">{plan.latest_result.tps_overall?.toFixed(1)}</p>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center py-4 rounded-xl bg-muted border border-dashed border-border/50">
                  <p className="text-muted-foreground text-sm font-medium italic">{t("dashboard.noResults")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-base font-heading font-semibold text-foreground/90">{t("dashboard.tpsComparison")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12, fontWeight: 500 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-muted)' }}
                  contentStyle={{
                    backgroundColor: 'var(--color-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-md)',
                    padding: '12px',
                    color: 'var(--color-foreground)',
                  }}
                />
                <Bar
                  dataKey="tps"
                  fill="var(--color-primary)"
                  name="TPS"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
