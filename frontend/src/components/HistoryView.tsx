import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { Plan, PaginatedResults, TestResult } from "@/api/client";
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
}

export default function HistoryView({ planId: initialPlanId, isPublic = false, onDelete }: HistoryViewProps) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [results, setResults] = useState<PaginatedResults>({ items: [], total: 0, page: 1, size: 20 });
  const [selectedPlan, setSelectedPlan] = useState<string>(() => {
    return initialPlanId || "all";
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    // If we're not public, we can fetch all plans for the dropdown
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

  const chartData = useMemo(() => {
    return [...results.items]
      .filter((r) => !r.error)
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
        areas.push({ x1: chartData[startIdx].time, x2: chartData[i - 1].time, isDay: chartData[startIdx].isDay });
        startIdx = i;
      }
    }
    areas.push({ x1: chartData[startIdx].time, x2: chartData[chartData.length - 1].time, isDay: chartData[startIdx].isDay });
    return areas;
  }, [chartData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isPublic ? t("history.trend") : t("history.title")}</h1>
        {!isPublic && (
          <div className="flex gap-4">
            <Select value={selectedPlan} onValueChange={(v) => { setSelectedPlan(v ?? "all"); setPage(1); }}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder={t("history.allPlans")}>
                  {(value: string | null) =>
                    value === "all" || !value
                      ? t("history.allPlans")
                      : plans.find((p) => String(p.id) === value)?.name || value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("history.allPlans")}</SelectItem>
                {plans.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {chartData.length > 1 && (
        <Card className="shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium opacity-70">{t("history.trend")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', fontSize: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {shadingAreas.map((area, idx) => (
                  <ReferenceArea
                    key={idx}
                    x1={area.x1}
                    x2={area.x2}
                    yAxisId="left"
                    fill={area.isDay ? "oklch(0.95 0.05 85)" : "oklch(0.9 0.02 260)"}
                    fillOpacity={0.4}
                  />
                ))}
                <Line yAxisId="left" type="monotone" dataKey="tps_overall" stroke="oklch(0.6 0.2 250)" strokeWidth={2.5} name={t("history.tpsOverall")} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="tps_generate" stroke="oklch(0.7 0.15 145)" strokeWidth={2} strokeDasharray="5 5" name={t("history.tpsGenerate")} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="ttft" stroke="oklch(0.6 0.15 25)" strokeWidth={2.5} name={t("history.ttftMs")} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="think" stroke="oklch(0.5 0.1 85)" strokeWidth={1.5} strokeDasharray="3 3" name={t("history.thinkTimeMs")} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="whitespace-nowrap min-w-[160px]">{t("history.time")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("history.plan")}</TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  <span title={t("history.ttftDef")} className="border-b border-dashed border-muted-foreground/50 cursor-help">
                    {t("history.ttftMs")}
                  </span>
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  <span title={t("history.ttfbDef")} className="border-b border-dashed border-muted-foreground/50 cursor-help">
                    {t("history.ttfbMs")}
                  </span>
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  <span title={t("history.ttfrDef")} className="border-b border-dashed border-muted-foreground/50 cursor-help">
                    {t("history.ttfrMs")}
                  </span>
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  <span title={t("history.thinkTimeDef")} className="border-b border-dashed border-muted-foreground/50 cursor-help">
                    {t("history.thinkTimeMs")}
                  </span>
                </TableHead>
                <TableHead className="text-right whitespace-nowrap font-bold text-primary">
                  <span title={t("history.tpsOverallDef")} className="border-b border-dashed border-primary/50 cursor-help">
                    {t("history.tpsOverall")}
                  </span>
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  <span title={t("history.tpsGenerateDef")} className="border-b border-dashed border-muted-foreground/50 cursor-help">
                    {t("history.tpsGenerate")}
                  </span>
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  <span title={t("history.tpsContentDef")} className="border-b border-dashed border-muted-foreground/50 cursor-help">
                    {t("history.tpsContent")}
                  </span>
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">{t("history.tokens")}</TableHead>
                <TableHead className="text-right whitespace-nowrap text-xs text-muted-foreground">{t("history.thinkingTokens")}</TableHead>
                <TableHead className="text-right whitespace-nowrap text-xs text-muted-foreground">{t("history.inputTokens")}</TableHead>
                <TableHead className="text-center">{t("history.status")}</TableHead>
                {!isPublic && <TableHead className="w-[120px]">{t("history.note")}</TableHead>}
                {!isPublic && <TableHead className="w-[60px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.items.map((r: TestResult) => (
                <TableRow key={r.id} className="hover:bg-muted/30 transition-colors group">
                  <TableCell className="text-xs font-mono">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{r.plan_name || `Plan ${r.plan_id}`}</TableCell>
                  <TableCell className={cn("text-right font-mono", r.ttft_ms && r.ttft_ms > 1000 ? "text-orange-500" : "")}>
                    {r.ttft_ms?.toFixed(0)}<span className="text-[10px] ml-0.5 opacity-50">ms</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.ttfb_ms?.toFixed(0)}<span className="text-[8px] ml-0.5 opacity-50">ms</span></TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.ttfr_ms?.toFixed(0)}<span className="text-[8px] ml-0.5 opacity-50">ms</span></TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.think_time_ms?.toFixed(0)}<span className="text-[8px] ml-0.5 opacity-50">ms</span></TableCell>
                  <TableCell className="text-right font-mono font-bold text-primary">{r.tps_overall?.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.tps_generate?.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.tps_content?.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono">{r.total_tokens}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.thinking_tokens || '-'}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.input_tokens || '-'}</TableCell>
                  <TableCell className="text-center">
                    {r.error ? (
                      <span className="inline-flex h-2 w-2 rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" title={r.error} />
                    ) : r.total_tokens === 0 ? (
                      <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500" />
                    ) : (
                      <span className="inline-flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    )}
                  </TableCell>
                  {!isPublic && (
                    <TableCell className="max-w-[120px] truncate text-[10px] text-muted-foreground" title={r.note || r.debug_chunks || ""}>
                      {r.note || (r.debug_chunks ? "SSE Logs Available" : "")}
                    </TableCell>
                  )}
                  {!isPublic && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDelete?.(r.id)}
                      >
                        <span className="sr-only">{t("history.delete")}</span>
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

      <div className="flex items-center justify-between px-2">
        <span className="text-xs text-muted-foreground">{t("history.total")}: {results.total}</span>
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 px-3" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("history.prev")}</Button>
            <div className="flex items-center px-3 bg-muted/50 rounded-md text-xs font-medium">{t("history.page")} {page}</div>
            <Button variant="outline" size="sm" className="h-8 px-3" disabled={results.items.length < 20} onClick={() => setPage(page + 1)}>{t("history.next")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
