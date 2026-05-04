import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import MatrixTable from "@/components/MatrixTable";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StatusData {
  plans: {
    id: number;
    name: string;
    model: string;
    api_type: string;
    is_active: boolean;
    latest_result: {
      ttft_ms: number | null;
      tps_overall: number | null;
      tps_generate: number | null;
      tps_content: number | null;
      ttfb_ms: number | null;
      ttfr_ms: number | null;
      think_time_ms: number | null;
      thinking_tokens: number | null;
      content_tokens: number | null;
      content_char_count: number | null;
      thinking_char_count: number | null;
      ping_ms: number | null;
      error: string | null;
      is_unavailable: boolean;
      created_at: string;
    } | null;
    availability_pct: number | null;
    stats: {
      avg_ttft_ms: number | null;
      avg_tps_overall: number | null;
      avg_tps_generate: number | null;
      p95_ttft_ms: number | null;
      count: number;
    };
    trend: { time: string; tps_overall: number | null; tps_generate: number | null; ttft_ms: number | null }[];
  }[];
  custom_banner: string | null;
  range: string;
}

const RANGES = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

type ComparisonMetric = 'tps_overall' | 'tps_generate' | 'ttft_ms';

function fetchStatus(range: string): Promise<StatusData> {
  return fetch(`/api/public/status?range=${range}`).then((r) => r.json());
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Status() {
  const { t } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [data, setData] = useState<StatusData | null>(null);
  const [range, setRange] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("tm_selected_compare_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [metric, setMetric] = useState<ComparisonMetric>('tps_overall');
  const [now, setNow] = useState(() => Date.now());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Persist selections to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("tm_selected_compare_ids", JSON.stringify(selectedIds));
  }, [selectedIds]);

  // Derived plans for the trend chart based on user selection
  const trendPlans = useMemo(() => {
    if (!data) return [];
    return data.plans.filter(p => selectedIds.includes(p.id));
  }, [data, selectedIds]);

  // MERGED DATA for Recharts to ensure stable rendering
  const mergedTrendData = useMemo(() => {
    if (trendPlans.length === 0) return [];
    
    const timeMap: Record<string, Record<string, string | number | null>> = {};
    
    trendPlans.forEach(plan => {
      plan.trend.forEach(point => {
        if (!timeMap[point.time]) {
          timeMap[point.time] = { time: point.time };
        }
        timeMap[point.time][`tps_overall_${plan.id}`] = point.tps_overall;
        timeMap[point.time][`tps_generate_${plan.id}`] = point.tps_generate;
        timeMap[point.time][`ttft_ms_${plan.id}`] = point.ttft_ms;
      });
    });
    
    return Object.values(timeMap).sort((a, b) => (a.time as string).localeCompare(b.time as string));
  }, [trendPlans]);

  useEffect(() => {
    let active = true;
    fetchStatus(range)
      .then((res) => {
        if (active) {
          setData(res);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [range]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      fetchStatus(range).then(setData);
    }, 60000);
    return () => clearInterval(id);
  }, [range]);

  const toggleSelection = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(i => i !== id));
    } else {
      if (selectedIds.length >= 5) {
        toast.warning(t("status.modelsSelected") + " (max 5)");
        return;
      }
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const timeAgo = (iso: string): string => {
    const seconds = Math.floor((now - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ${t("common.ago") || "ago"}`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${t("common.ago") || "ago"}`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${t("common.ago") || "ago"}`;
    return `${Math.floor(seconds / 86400)}d ${t("common.ago") || "ago"}`;
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">{t("status.loading")}</p>
      </div>
    );
  }

  const allOperational = data.plans.every(
    (p) => p.latest_result && !p.latest_result.error && !p.latest_result.is_unavailable
  );

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Custom Banner */}
      {data.custom_banner && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="max-w-5xl mx-auto px-4 py-6 space-y-3">
            <div dangerouslySetInnerHTML={{ __html: data.custom_banner }} />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t("status.title")}</h1>
              <div className="flex items-center gap-2 mt-2">
                <div className={`h-2.5 w-2.5 rounded-full ${allOperational ? "bg-green shadow-[0_0_8px_color-mix(in_oklch,var(--color-green)_50%,transparent)]" : "bg-red shadow-[0_0_8px_color-mix(in_oklch,var(--color-red)_50%,transparent)]"}`} />
                <span className="text-sm text-muted-foreground font-medium">
                  {allOperational ? t("status.allSystemsOperational") : t("status.someSystemsIssues")}
                </span>
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <Link to="/matrix"><Button variant="outline" size="sm">{t("nav.matrix")}</Button></Link>
              <Link to="/"><Button variant="outline" size="sm">{t("nav.dashboard")}</Button></Link>
              <Link to="/history"><Button variant="outline" size="sm">{t("nav.history")}</Button></Link>
              <div className="w-px h-5 bg-border mx-1" />
              <div className="relative">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setThemeMenuOpen(!themeMenuOpen)}>
                  {theme === 'system' ? (
                    resolvedTheme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />
                  ) : theme === 'dark' ? (
                    <Sun className="size-3.5" />
                  ) : (
                    <Moon className="size-3.5" />
                  )}
                </Button>
                {themeMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 w-28 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-[60vh] overflow-y-auto">
                    <button
                      onClick={() => { setTheme('system'); setThemeMenuOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                        theme === 'system'
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )}
                    >
                      <Monitor className="size-3" />
                      {t('theme.auto')}
                    </button>
                    <button
                      onClick={() => { setTheme('light'); setThemeMenuOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                        theme === 'light'
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )}
                    >
                      <Moon className="size-3" />
                      {t('theme.light')}
                    </button>
                    <button
                      onClick={() => { setTheme('dark'); setThemeMenuOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                        theme === 'dark'
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )}
                    >
                      <Sun className="size-3" />
                      {t('theme.dark')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        {/* Range selector */}
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              variant={range === r.value ? "default" : "outline"}
              size="sm"
              className="px-4"
              onClick={() => {
                setRange(r.value);
                setLoading(true);
              }}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.plans.map((plan) => {
            const isSelected = selectedIds.includes(plan.id);
            const statusLabel = plan.latest_result && !plan.latest_result.error && !plan.latest_result.is_unavailable 
              ? t("status.operational") 
              : plan.latest_result?.is_unavailable 
                ? t("status.unavailable") 
                : t("status.degraded");

            return (
              <Card 
                key={plan.id} 
                className={cn(
                  "cursor-pointer transition-all duration-200 border-border/50",
                  isSelected 
                    ? "ring-2 ring-primary border-transparent bg-primary/[0.03] shadow-lg scale-[1.02]" 
                    : "hover:border-primary/30 hover:bg-muted/50"
                )}
                onClick={() => toggleSelection(plan.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base truncate mr-2 font-bold" title={plan.name}>{plan.name}</CardTitle>
                    <Badge variant={plan.latest_result && !plan.latest_result.error && !plan.latest_result.is_unavailable ? "default" : "destructive"}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground truncate max-w-[150px] font-mono">{plan.api_type} / {plan.model}</p>
                    <div className="flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-full" onClick={e => e.stopPropagation()}>
                      <span className="text-[10px] font-medium text-muted-foreground">{t("status.compare")}</span>
                      <Switch 
                        id={`compare-${plan.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(plan.id)}
                        className="scale-[0.6] origin-right"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.latest_result ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div title={t("history.ttftDef")}>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{t("history.ttftMs")}</p>
                          <p className="text-lg font-semibold font-mono">{plan.latest_result.ttft_ms ?? "—"}ms</p>
                        </div>
                        <div title={t("history.tpsOverallDef")}>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{t("history.tpsOverall")}</p>
                          <p className="text-lg font-semibold font-mono">{plan.latest_result.tps_overall ?? "—"}</p>
                        </div>
                        <div title={t("history.tpsGenerateDef")}>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{t("history.tpsGenerate")}</p>
                          <p className="text-lg font-semibold font-mono">{plan.latest_result.tps_generate ?? "—"}</p>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground">
                          {t("status.lastTest")}: {timeAgo(plan.latest_result.created_at)}
                        </p>
                        {plan.availability_pct !== null && (
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] font-bold">{plan.availability_pct}%</span>
                             <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${plan.availability_pct >= 99 ? "bg-green-500" : plan.availability_pct >= 95 ? "bg-yellow-500" : "bg-red-500"}`}
                                style={{ width: `${plan.availability_pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm py-4 italic text-center">{t("status.noResults")}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Matrix Table */}
        <MatrixTable selectedIds={selectedIds} onToggleSelection={toggleSelection} />

        {/* Trend chart */}
        <Card className="overflow-hidden border-border/50 shadow-xl bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/50 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold tracking-tight">{t("status.comparisonTrend")}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{t("status.compareDesc")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-background border rounded-lg p-1">
                  <Button 
                    variant={metric === 'tps_overall' ? "default" : "ghost"} 
                    size="sm" className="h-7 text-[10px] px-3 uppercase font-bold"
                    onClick={() => setMetric('tps_overall')}
                    title={t("history.tpsOverallDef")}
                  >{t("history.tpsOverall")}</Button>
                  <Button 
                    variant={metric === 'tps_generate' ? "default" : "ghost"} 
                    size="sm" className="h-7 text-[10px] px-3 uppercase font-bold"
                    onClick={() => setMetric('tps_generate')}
                    title={t("history.tpsGenerateDef")}
                  >{t("history.tpsGenerate")}</Button>
                  <Button 
                    variant={metric === 'ttft_ms' ? "default" : "ghost"} 
                    size="sm" className="h-7 text-[10px] px-3 uppercase font-bold"
                    onClick={() => setMetric('ttft_ms')}
                    title={t("history.ttftDef")}
                  >{t("history.ttftMs")}</Button>
                </div>
                {selectedIds.length > 0 && (
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold px-3 py-1">
                    {selectedIds.length} / 5 {t("status.modelsSelected")}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-8">
            {selectedIds.length > 0 ? (
              mergedTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={mergedTrendData}>
                    <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip 
                      labelFormatter={(label) => formatTime(String(label))}
                      contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '30px' }} />
                    {trendPlans.map((plan, i) => (
                      <Line
                        key={plan.id}
                        type="monotone"
                        dataKey={`${metric}_${plan.id}`}
                        stroke={`oklch(0.6 ${0.1 + (i % 5) * 0.03} ${20 + i * 40})`}
                        strokeWidth={3}
                        name={plan.name}
                        dot={false}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-muted animate-in fade-in duration-700">
                   <p className="text-muted-foreground font-bold text-lg">{t("status.noDataInRange")}</p>
                   <p className="text-sm text-muted-foreground mt-2 max-w-[300px] text-center">
                    {t("status.trySwitchRange")}
                  </p>
                </div>
              )
            ) : (
              <div className="h-[350px] flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-muted animate-in fade-in duration-700">
                <div className="bg-muted p-4 rounded-full mb-4">
                  <Switch checked={false} className="scale-125" disabled />
                </div>
                <p className="text-muted-foreground font-bold text-lg">{t("status.noModelsSelected")}</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-[300px] text-center">
                  {t("status.clickCardToCompare")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="border-t mt-16 py-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-4">
          <a href="https://github.com/qingmuhy744/TokenMeter" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors font-medium">GitHub Repository</a>
          <span className="opacity-30">|</span>
          <span>&copy; 2026 {t("status.footerText")}</span>
        </div>
      </div>
    </div>
  );
}
