import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { Plan, PaginatedResults, TestResult, Stats } from "@/api/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceArea } from "recharts";
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

  // Fetch paginated results for the table
  useEffect(() => {
    const params: Record<string, string> = { page: String(page), size: "20" };
    if (selectedPlan !== "all") params.plan_id = selectedPlan;
    
    const fetchFn = isPublic ? () => api.getPublicResults(params) : () => api.getResults(params);
    fetchFn().then(setResults);
  }, [selectedPlan, page, isPublic]);

  // Fetch stats for the selected period
  useEffect(() => {
    let active = true;
    if (selectedPlan !== "all") {
      api.getStats(parseInt(selectedPlan), statsDays).then(res => {
        if (active) setStats(res);
      });
    } else {
      // Move to next microtask to satisfy React Compiler's rule against sync setState in effect
      Promise.resolve().then(() => {
        if (active) setStats(null);
      });
    }
    return () => { active = false; };
  }, [selectedPlan, statsDays]);

  // Filter chart data to strictly last 24h
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

  // Contiguous shading logic: find transitions and draw areas
  const shadingAreas = useMemo(() => {
    if (chartData.length < 2) return [];
    const areas = [];
    let startIdx = 0;
    
    // We iterate through all points. Since it's sorted, we group by isDay status.
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].isDay !== chartData[startIdx].isDay) {
        // We found a transition. Draw area from start to current point.
        areas.push({
          x1: chartData[startIdx].time,
          x2: chartData[i].time, // End exactly at the next point's start to ensure no gaps
          isDay: chartData[startIdx].isDay
        });
        startIdx = i;
      }
    }
    // Final segment
    areas.push({
      x1: chartData[startIdx].time,
      x2: chartData[chartData.length - 1].time,
      isDay: chartData[startIdx].isDay
    });
    return areas;
  }, [chartData]);

  return (
    <div className="space-y-8">
      {!isPublic && (
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <Select value={selectedPlan} onValueChange={(v) => { setSelectedPlan(v ?? "all"); setPage(1); }}>
              <SelectTrigger className="w-[280px] rounded-xl border-slate-200 shadow-sm bg-white font-medium text-slate-700">
                <SelectValue placeholder={t("history.allPlans")}>
                  {(value: string | null) =>
                    value === "all" || !value
                      ? t("history.allPlans")
                      : plans.find((p) => String(p.id) === value)?.name || value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-md">
                <SelectItem value="all" className="font-medium">{t("history.allPlans")}</SelectItem>
                {plans.map((p) => (<SelectItem key={p.id} value={String(p.id)} className="font-medium">{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">{statsDays}d Avg TTFT</p>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.avg_ttft_ms?.toFixed(0) || '-'}<span className="text-sm font-medium text-slate-400 ml-1">ms</span></p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">{statsDays}d Avg TPS</p>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.avg_tps_overall?.toFixed(1) || '-'}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">{statsDays}d P95 TTFT</p>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.p95_ttft_ms?.toFixed(0) || '-'}<span className="text-sm font-medium text-slate-400 ml-1">ms</span></p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Total Tests</p>
              <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.count}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {chartData.length > 1 && (
        <Card className="rounded-2xl border-slate-200/60 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-4 flex flex-row items-center justify-between space-y-0 bg-slate-50/50">
            <CardTitle className="text-base font-semibold text-slate-900 tracking-tight">Performance Trends <span className="text-xs font-medium text-slate-500 ml-2">(Last 24 Hours)</span></CardTitle>
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-400 bg-white border-slate-200">Real-time Data</Badge>
          </CardHeader>
          <CardContent className="pt-8">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} 
                  interval="preserveStartEnd" 
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    borderRadius: '12px', 
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }} 
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 500, paddingTop: '20px', color: '#64748b' }} />
                {shadingAreas.map((area, idx) => (
                  <ReferenceArea
                    key={idx}
                    x1={area.x1}
                    x2={area.x2}
                    yAxisId="left"
                    fill={area.isDay ? "oklch(0.96 0.05 90)" : "oklch(0.94 0.03 260)"}
                    fillOpacity={0.3}
                  />
                ))}
                <Line yAxisId="left" type="monotone" dataKey="tps_overall" stroke="oklch(0.6 0.2 250)" strokeWidth={3} name={t("history.tpsOverall")} dot={false} connectNulls />
                <Line yAxisId="left" type="monotone" dataKey="tps_generate" stroke="oklch(0.7 0.15 145)" strokeWidth={2} strokeDasharray="5 5" name={t("history.tpsGenerate")} dot={false} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="ttft" stroke="oklch(0.6 0.15 25)" strokeWidth={3} name={t("history.ttftMs")} dot={false} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="think" stroke="oklch(0.5 0.1 85)" strokeWidth={1.5} strokeDasharray="3 3" name={t("history.thinkTimeMs")} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-4">
        {results.items.map((r: TestResult) => (
          <Card key={r.id} className="rounded-2xl border-slate-200/60 shadow-sm bg-white overflow-hidden p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{r.plan_name || plans.find((p) => p.id === r.plan_id)?.name || `Plan ${r.plan_id}`}</h3>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.error ? (
                  <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                )}
                {!isPublic && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-300 hover:text-red-500 transition-colors"
                    onClick={() => onDelete?.(r.id)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("history.ttftMs")}</p>
                <p className={cn("text-lg font-bold text-slate-900", r.ttft_ms && r.ttft_ms > 1000 ? "text-orange-500" : "")}>
                  {r.ttft_ms?.toFixed(0)}<span className="text-xs font-medium text-slate-400 ml-1">ms</span>
                </p>
              </div>
              <div className="space-y-0.5 text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("history.tpsOverall")}</p>
                <p className="text-lg font-bold text-slate-900">{r.tps_overall?.toFixed(1)}</p>
              </div>
            </div>
            {r.error && (
              <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-100">
                <p className="text-[10px] text-red-600 font-medium line-clamp-2">{r.error}</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden md:block rounded-2xl border-slate-200/60 shadow-sm bg-white overflow-hidden">
        <div 
          className="w-full max-h-[700px] overflow-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
        >
          <Table className="w-full min-w-[1000px] border-separate border-spacing-0">
            <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent border-b border-slate-100">
                <TableHead className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("history.time")}</TableHead>
                <TableHead className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("history.plan")}</TableHead>
                <TableHead className="py-4 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span title={t("history.ttftDef")} className="border-b border-dashed border-slate-300 cursor-help">
                    {t("history.ttftMs")}
                  </span>
                </TableHead>
                <TableHead className="py-4 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span title={t("history.thinkTimeDef")} className="border-b border-dashed border-slate-300 cursor-help">
                    {t("history.thinkTimeMs")}
                  </span>
                </TableHead>
                <TableHead className="py-4 px-4 text-right text-[10px] font-bold text-slate-900 tracking-tight uppercase tracking-widest bg-slate-100/30">
                  <span title={t("history.tpsOverallDef")} className="border-b border-dashed border-slate-400 cursor-help">
                    {t("history.tpsOverall")}
                  </span>
                </TableHead>
                <TableHead className="py-4 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span title={t("history.tpsGenerateDef")} className="border-b border-dashed border-slate-300 cursor-help">
                    {t("history.tpsGenerate")}
                  </span>
                </TableHead>
                <TableHead className="py-4 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("history.tokens")}</TableHead>
                <TableHead className="py-4 px-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("history.thinkingTokens")}</TableHead>
                <TableHead className="py-4 px-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("history.status")}</TableHead>
                {!isPublic && <TableHead className="py-4 px-4 text-right w-[60px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.items.map((r: TestResult) => (
                <TableRow key={r.id} className="hover:bg-slate-50/50 transition-colors group border-b border-slate-50 last:border-0">
                  <TableCell className="py-4 px-6 text-[11px] font-medium text-slate-400 font-mono">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="py-4 px-6 font-semibold text-slate-900 whitespace-nowrap">{r.plan_name || plans.find((p) => p.id === r.plan_id)?.name || `Plan ${r.plan_id}`}</TableCell>
                  <TableCell className={cn("py-4 px-4 text-right font-bold text-slate-900", r.ttft_ms && r.ttft_ms > 1000 ? "text-orange-500" : "")}>
                    {r.ttft_ms?.toFixed(0)}<span className="text-[10px] font-medium text-slate-400 ml-1">ms</span>
                  </TableCell>
                  <TableCell className="py-4 px-4 text-right font-medium text-slate-400 text-xs">{r.think_time_ms?.toFixed(0)}<span className="text-[9px] ml-0.5 opacity-50">ms</span></TableCell>
                  <TableCell className="py-4 px-4 text-right font-bold text-slate-900 bg-slate-50/30">{r.tps_overall?.toFixed(1)}</TableCell>
                  <TableCell className="py-4 px-4 text-right font-medium text-slate-500 text-xs">{r.tps_generate?.toFixed(1)}</TableCell>
                  <TableCell className="py-4 px-4 text-right font-semibold text-slate-700 font-mono text-sm">{r.total_tokens}</TableCell>
                  <TableCell className="py-4 px-4 text-right font-medium text-slate-400 font-mono text-xs">{r.thinking_tokens || '-'}</TableCell>
                  <TableCell className="py-4 px-4 text-center">
                    <div className="flex justify-center">
                      {r.error ? (
                        <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" title={r.error} />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                      )}
                    </div>
                  </TableCell>
                  {!isPublic && (
                    <TableCell className="py-4 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                        onClick={() => onDelete?.(r.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex items-center justify-between px-2 pt-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{t("history.total")}: {results.total}</span>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-4 rounded-lg font-medium text-slate-500 hover:text-slate-900 hover:bg-white" 
              disabled={page <= 1} 
              onClick={() => setPage(page - 1)}
            >
              {t("history.prev")}
            </Button>
            <div className="flex items-center px-4 bg-white rounded-lg shadow-sm text-xs font-bold text-slate-900 border border-slate-100">{t("history.page")} {page}</div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-4 rounded-lg font-medium text-slate-500 hover:text-slate-900 hover:bg-white" 
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
