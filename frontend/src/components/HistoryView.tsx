import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { Plan, PaginatedResults, TestResult, Stats } from "@/api/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceArea } from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HistoryViewProps {
  planId?: string;
  isPublic?: boolean;
  onDelete?: (id: number) => Promise<void>;
  statsDays?: number;
}

export default function HistoryView({ planId: initialPlanId, isPublic = false, onDelete, statsDays = 7 }: HistoryViewProps) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [results, setResults] = useState<PaginatedResults>({ items: [], total: 0, page: 1, size: 20 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return initialPlanId || params.get("plan_id") || "all";
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isPublic) {
      api.getPlans().then(setPlans);
    }
  }, [isPublic]);

  useEffect(() => {
    const params: Record<string, string> = { page: String(page), size: "20" };
    if (selectedPlan !== "all") params.plan_id = selectedPlan;
    
    const fetchFn = isPublic ? () => api.getPublicResults(params) : () => api.getResults(params);
    fetchFn().then(setResults);
  }, [selectedPlan, page, isPublic]);

  useEffect(() => {
    let active = true;
    if (selectedPlan !== "all") {
      api.getStats(parseInt(selectedPlan), statsDays).then(res => {
        if (active) setStats(res);
      });
    } else {
      Promise.resolve().then(() => {
        if (active) setStats(null);
      });
    }
    return () => { active = false; };
  }, [selectedPlan, statsDays]);

  const chartData = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return [...results.items]
      .filter((r) => !r.error && new Date(r.created_at) >= cutoff)
      .reverse()
      .map((r) => {
        const date = new Date(r.created_at);
        return {
          time: date.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          rawTime: date,
          isDay: date.getHours() >= 8 && date.getHours() < 20,
          tps_overall: r.tps_overall ?? 0,
          tps_generate: r.tps_generate ?? 0,
          tps_content: r.tps_content ?? 0,
          ttft: r.ttft_ms ? Math.round(r.ttft_ms) : 0,
          think: r.think_time_ms ? Math.round(r.think_time_ms) : 0,
          ttfb: r.ttfb_ms ? Math.round(r.ttfb_ms) : 0,
        };
      });
  }, [results.items]);

  const shadingAreas = useMemo(() => {
    if (chartData.length < 2) return [];
    const areas = [];
    let startIdx = 0;
    
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].isDay !== chartData[startIdx].isDay) {
        areas.push({
          x1: chartData[startIdx].time,
          x2: chartData[i].time,
          isDay: chartData[startIdx].isDay
        });
        startIdx = i;
      }
    }
    areas.push({
      x1: chartData[startIdx].time,
      x2: chartData[chartData.length - 1].time,
      isDay: chartData[startIdx].isDay
    });
    return areas;
  }, [chartData]);

  const textMuted = "var(--color-muted-foreground)";
  const cardBg = "var(--color-card)";

  return (
    <div className="space-y-8">
      {!isPublic && (
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <Select value={selectedPlan} onValueChange={(v) => { setSelectedPlan(v ?? "all"); setPage(1); }}>
              <SelectTrigger className="w-[280px] rounded-xl border-border bg-card font-medium text-foreground/80 shadow-sm">
                <SelectValue placeholder={t("history.allPlans")}>
                  {(value: string | null) =>
                    value === "all" || !value
                      ? t("history.allPlans")
                      : plans.find((p) => String(p.id) === value)?.name || value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border shadow-md">
                <SelectItem value="all" className="font-medium">{t("history.allPlans")}</SelectItem>
                {plans.map((p) => (<SelectItem key={p.id} value={String(p.id)} className="font-medium">{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: `${statsDays}d Avg TTFT`, value: stats.avg_ttft_ms?.toFixed(0) || '-', suffix: 'ms' },
            { label: `${statsDays}d Avg TPS`, value: stats.avg_tps_overall?.toFixed(1) || '-', suffix: '' },
            { label: `${statsDays}d P95 TTFT`, value: stats.p95_ttft_ms?.toFixed(0) || '-', suffix: 'ms' },
            { label: 'Total Tests', value: stats.count, suffix: '' },
          ].map((item, i) => (
            <Card key={i} className="border border-border shadow-sm">
              <CardContent className="pt-6">
                <p className="text-[10px] text-muted-foreground/70 uppercase font-bold tracking-widest mb-1">{item.label}</p>
                <p className="text-3xl font-bold text-foreground font-heading tracking-tight">
                  {item.value}
                  {item.suffix && <span className="text-sm font-medium text-muted-foreground ml-1">{item.suffix}</span>}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {chartData.length > 1 && (
          <Card className="border border-border shadow-sm">
          <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between space-y-0 bg-muted/20">
            <CardTitle className="text-base font-heading font-semibold text-foreground/90">
              {t("history.trend")} <span className="text-xs font-medium text-muted-foreground/60 ml-2">(Last 24 Hours)</span>
            </CardTitle>
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-muted-foreground/50 bg-card border-white/10">Real-time Data</Badge>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10, fill: textMuted, fontWeight: 500 }} 
                  interval="preserveStartEnd" 
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: textMuted }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: textMuted }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: cardBg, 
                    borderRadius: '12px', 
                    fontSize: '12px',
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-md)',
                    color: 'var(--color-foreground)',
                  }} 
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 500, paddingTop: '20px', color: textMuted }} />
                {shadingAreas.map((area, idx) => (
                  <ReferenceArea
                    key={idx}
                    x1={area.x1}
                    x2={area.x2}
                    yAxisId="left"
                    fill={area.isDay ? "oklch(0.6399 0.093 224.37 / 0.06)" : "oklch(0.5 0.1 240 / 0.06)"}
                    fillOpacity={1}
                  />
                ))}
                <Line yAxisId="left" type="monotone" dataKey="tps_overall" stroke="var(--color-primary)" strokeWidth={3} name={t("history.tpsOverall")} dot={false} connectNulls />
                <Line yAxisId="left" type="monotone" dataKey="tps_generate" stroke="var(--color-green)" strokeWidth={2} strokeDasharray="5 5" name={t("history.tpsGenerate")} dot={false} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="ttft" stroke="var(--color-cyan)" strokeWidth={3} name={t("history.ttftMs")} dot={false} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="think" stroke="oklch(0.55 0.1 85)" strokeWidth={1.5} strokeDasharray="3 3" name={t("history.thinkTimeMs")} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-4">
        {results.items.length > 0 ? (
          results.items.map((r: TestResult) => (
            <Card key={r.id} className="p-4 border border-border shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground/90">{r.plan_name || plans.find((p) => p.id === r.plan_id)?.name || `Plan ${r.plan_id}`}</h3>
                  <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-tighter">{new Date(r.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.error ? (
                    <span className="h-2 w-2 rounded-full bg-red shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-green shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                  )}
                  {!isPublic && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground/40 hover:text-red transition-colors"
                      onClick={() => onDelete?.(r.id)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{t("history.ttftMs")}</p>
                  <p className={cn("text-lg font-bold text-foreground", r.ttft_ms && r.ttft_ms > 1000 ? "text-amber" : "")}>
                    {r.ttft_ms?.toFixed(0)}<span className="text-xs font-medium text-muted-foreground ml-1">ms</span>
                  </p>
                </div>
                <div className="space-y-0.5 text-right">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{t("history.tpsOverall")}</p>
                  <p className="text-lg font-bold text-foreground">{r.tps_overall?.toFixed(1)}</p>
                </div>
              </div>
              {r.error && (
                <div className="mt-3 p-2 bg-red/10 rounded-lg border border-red/20">
                  <p className="text-[10px] text-red font-medium line-clamp-2">{r.error}</p>
                </div>
              )}
            </Card>
          ))
        ) : (
          <Card className="p-8 border border-border shadow-sm">
            <p className="text-center text-muted-foreground/50 text-sm font-medium">{t("history.noResults")}</p>
          </Card>
        )}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden md:block border border-border shadow-sm overflow-hidden">
        <div className="w-full max-h-[700px] overflow-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
          <Table className="w-full min-w-[1000px] border-separate border-spacing-0">
            <TableHeader className="bg-muted/40 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="py-2.5 px-6 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">{t("history.time")}</TableHead>
                <TableHead className="py-2.5 px-6 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">{t("history.plan")}</TableHead>
                <TableHead className="py-2.5 px-4 text-right text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                  <span title={t("history.ttftDef")} className="border-b border-dashed border-border/50 cursor-help">
                    {t("history.ttftMs")}
                  </span>
                </TableHead>
                <TableHead className="py-2.5 px-4 text-right text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                  <span title={t("history.thinkTimeDef")} className="border-b border-dashed border-border/50 cursor-help">
                    {t("history.thinkTimeMs")}
                  </span>
                </TableHead>
                <TableHead className="py-2.5 px-4 text-right text-[10px] font-bold text-foreground/90 tracking-tight uppercase tracking-widest bg-muted/20">
                  <span title={t("history.tpsOverallDef")} className="border-b border-dashed border-border/50 cursor-help">
                    {t("history.tpsOverall")}
                  </span>
                </TableHead>
                <TableHead className="py-2.5 px-4 text-right text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                  <span title={t("history.tpsGenerateDef")} className="border-b border-dashed border-border/50 cursor-help">
                    {t("history.tpsGenerate")}
                  </span>
                </TableHead>
                <TableHead className="py-2.5 px-4 text-right text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">{t("history.tokens")}</TableHead>
                <TableHead className="py-2.5 px-4 text-right text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">{t("history.thinkingTokens")}</TableHead>
                <TableHead className="py-2.5 px-4 text-center text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">{t("history.status")}</TableHead>
                {!isPublic && <TableHead className="py-2.5 px-4 text-right w-[60px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.items.length > 0 ? (
                results.items.map((r: TestResult) => (
                  <TableRow key={r.id} className="hover:bg-muted/20 transition-colors group border-b border-border/30 last:border-0">
                    <TableCell className="py-2.5 px-6 text-[11px] font-medium text-muted-foreground/70 font-mono">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="py-2.5 px-6 font-semibold text-foreground/90 whitespace-nowrap">{r.plan_name || plans.find((p) => p.id === r.plan_id)?.name || `Plan ${r.plan_id}`}</TableCell>
                    <TableCell className={cn("py-2.5 px-4 text-right font-bold text-foreground/90", r.ttft_ms && r.ttft_ms > 1000 ? "text-amber" : "")}>
                      {r.ttft_ms?.toFixed(0)}<span className="text-[10px] font-medium text-muted-foreground ml-1 font-mono">ms</span>
                    </TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-medium text-muted-foreground/60 text-xs">{r.think_time_ms?.toFixed(0)}<span className="text-[9px] ml-0.5 opacity-50">ms</span></TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-bold text-foreground/90 bg-muted/10">{r.tps_overall?.toFixed(1)}</TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-medium text-muted-foreground/60 text-xs">{r.tps_generate?.toFixed(1)}</TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-semibold text-foreground/80 font-mono text-sm">{r.total_tokens}</TableCell>
                    <TableCell className="py-2.5 px-4 text-right font-medium text-muted-foreground/60 font-mono text-xs">{r.thinking_tokens || '-'}</TableCell>
                    <TableCell className="py-2.5 px-4 text-center">
                      <div className="flex justify-center">
                        {r.error ? (
                          <span className="h-2 w-2 rounded-full bg-red shadow-[0_0_8px_rgba(239,68,68,0.4)]" title={r.error} />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-green shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                        )}
                      </div>
                    </TableCell>
                    {!isPublic && (
                      <TableCell className="py-2.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground/30 hover:text-red opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                          onClick={() => onDelete?.(r.id)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={isPublic ? 9 : 10} className="text-center py-12 text-muted-foreground/50 text-sm font-medium">
                    {t("history.noResults")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex items-center justify-between px-2 pt-2">
        <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest font-mono">{t("history.total")}: {results.total}</span>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-muted p-1 rounded-xl border border-white/10">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-4 rounded-lg font-medium text-muted-foreground hover:text-foreground hover:bg-white/5" 
              disabled={page <= 1} 
              onClick={() => setPage(page - 1)}
            >
              {t("history.prev")}
            </Button>
            <div className="flex items-center px-4 bg-card rounded-lg text-xs font-bold text-foreground border border-white/10">{t("history.page")} {page}</div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-4 rounded-lg font-medium text-muted-foreground hover:text-foreground hover:bg-white/5" 
              disabled={results.items.length < 20} 
              onClick={() => setPage(page + 1)}
            >
              {t("history.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
