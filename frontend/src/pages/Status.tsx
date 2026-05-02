import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import MatrixTable from "@/components/MatrixTable";
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

function fetchStatus(range: string): Promise<StatusData> {
  return fetch(`/api/public/status?range=${range}`).then((r) => r.json());
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Status() {
  const [data, setData] = useState<StatusData | null>(null);
  const [range, setRange] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Derived plans for the trend chart based on user selection
  const trendPlans = useMemo(() => {
    if (!data) return [];
    return data.plans.filter(p => selectedIds.includes(p.id));
  }, [data, selectedIds]);

  // MERGED DATA for Recharts to ensure stable rendering
  const mergedTrendData = useMemo(() => {
    if (trendPlans.length === 0) return [];
    
    // Create a map of timestamp -> values
    const timeMap: Record<string, Record<string, string | number | null>> = {};
    
    trendPlans.forEach(plan => {
      plan.trend.forEach(point => {
        if (!timeMap[point.time]) {
          timeMap[point.time] = { time: point.time };
        }
        // Use plan name as key to distinguish lines
        timeMap[point.time][`tps_${plan.id}`] = point.tps_overall;
        timeMap[point.time][`ttft_${plan.id}`] = point.ttft_ms;
      });
    });
    
    // Convert back to array and sort by time
    return Object.values(timeMap).sort((a, b) => (a.time as string).localeCompare(b.time as string));
  }, [trendPlans]);

  useEffect(() => {
    let active = true;
    fetchStatus(range)
      .then((res) => {
        if (active) {
          setData(res);
          // Auto-select the first 3 models on first load if nothing selected
          if (selectedIds.length === 0 && res.plans.length > 0) {
            setSelectedIds(res.plans.slice(0, 3).map(p => p.id));
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        toast.warning("Comparison limit reached (max 5 models)");
        return;
      }
      setSelectedIds(prev => [...prev, id]);
    }
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading status...</p>
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
          <h1 className="text-2xl font-bold tracking-tight">TokenMeter Status</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={`h-2.5 w-2.5 rounded-full ${allOperational ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"}`} />
            <span className="text-sm text-muted-foreground font-medium">
              {allOperational ? "All systems operational" : "Some systems are experiencing issues"}
            </span>
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
                      {plan.latest_result && !plan.latest_result.error && !plan.latest_result.is_unavailable ? "Operational" : plan.latest_result?.is_unavailable ? "Unavailable" : "Degraded"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground truncate max-w-[150px] font-mono">{plan.api_type} / {plan.model}</p>
                    <div className="flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-full" onClick={e => e.stopPropagation()}>
                      <span className="text-[10px] font-medium text-muted-foreground">Compare</span>
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
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">TTFT</p>
                          <p className="text-lg font-semibold font-mono">{plan.latest_result.ttft_ms ?? "—"}ms</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">TPS All</p>
                          <p className="text-lg font-semibold font-mono">{plan.latest_result.tps_overall ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">TPS Gen</p>
                          <p className="text-lg font-semibold font-mono">{plan.latest_result.tps_generate ?? "—"}</p>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground">
                          Last test: {timeAgo(plan.latest_result.created_at)}
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
                    <p className="text-muted-foreground text-sm py-4 italic text-center">No test results yet</p>
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
          <CardHeader className="bg-muted/30 border-b border-border/50 py-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold tracking-tight">Comparison Trend — TPS</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Select up to 5 models from status cards above to compare performance</p>
              </div>
              {selectedIds.length > 0 && (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold px-3 py-1">
                  {selectedIds.length} / 5 Models Selected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-8">
            {mergedTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={mergedTrendData}>
                  <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fontSize: 11 }} minTickGap={30} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip 
                    labelFormatter={(label) => formatTime(String(label))}
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '30px' }} />
                  {trendPlans.map((plan, i) => (
                    <Line
                      key={plan.id}
                      yAxisId="left"
                      type="monotone"
                      dataKey={`tps_${plan.id}`}
                      stroke={`oklch(0.6 ${0.1 + (i % 5) * 0.03} ${20 + i * 40})`}
                      strokeWidth={3}
                      name={`${plan.name} (TPS)`}
                      dot={false}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  ))}
                  {trendPlans.map((plan, i) => (
                    <Line
                      key={`${plan.id}-ttft`}
                      yAxisId="right"
                      type="monotone"
                      dataKey={`ttft_${plan.id}`}
                      stroke={`oklch(0.6 ${0.1 + (i % 5) * 0.03} ${20 + i * 40})`}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      name={`${plan.name} (TTFT)`}
                      dot={false}
                      connectNulls
                      hide={true} // Hidden by default, user can click legend to show
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[350px] flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-muted/20 animate-in fade-in duration-700">
                <div className="bg-muted p-4 rounded-full mb-4">
                  <Switch checked={false} className="scale-125" disabled />
                </div>
                <p className="text-muted-foreground font-bold text-lg">No models selected for comparison</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-[300px] text-center">
                  Click on any of the model cards at the top of the page to add them to this chart.
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
          <span>&copy; 2026 TokenMeter - Real-time LLM Performance Monitoring</span>
        </div>
      </div>
    </div>
  );
}
