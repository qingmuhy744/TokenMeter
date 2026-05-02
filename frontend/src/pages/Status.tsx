import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import MatrixTable from "@/components/MatrixTable";
import { toast } from "sonner";

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
    if (selectedIds.length === 0) return [];
    return data.plans.filter(p => selectedIds.includes(p.id));
  }, [data, selectedIds]);

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
        <p className="text-muted-foreground">Loading...</p>
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
          <h1 className="text-2xl font-bold">TokenMeter Status</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={`h-2.5 w-2.5 rounded-full ${allOperational ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm text-muted-foreground">
              {allOperational ? "All systems operational" : "Some systems are experiencing issues"}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Range selector */}
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              variant={range === r.value ? "default" : "outline"}
              size="sm"
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
              <Card key={plan.id} className={isSelected ? "ring-2 ring-primary border-transparent" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base truncate mr-2" title={plan.name}>{plan.name}</CardTitle>
                    <Badge variant={plan.latest_result && !plan.latest_result.error && !plan.latest_result.is_unavailable ? "default" : "destructive"}>
                      {plan.latest_result && !plan.latest_result.error && !plan.latest_result.is_unavailable ? "Operational" : plan.latest_result?.is_unavailable ? "Unavailable" : "Degraded"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground truncate max-w-[150px]">{plan.api_type} / {plan.model}</p>
                    <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-full">
                      <Label htmlFor={`compare-${plan.id}`} className="text-[10px] cursor-pointer">Compare</Label>
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
                          <p className="text-lg font-semibold">{plan.latest_result.ttft_ms ?? "—"}ms</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">TPS All</p>
                          <p className="text-lg font-semibold">{plan.latest_result.tps_overall ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">TPS Gen</p>
                          <p className="text-lg font-semibold">{plan.latest_result.tps_generate ?? "—"}</p>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground">
                          Last test: {timeAgo(plan.latest_result.created_at)}
                        </p>
                        {plan.availability_pct !== null && (
                          <div className="mt-2">
                            <div className="flex justify-between text-[10px] mb-1">
                              <span className="text-muted-foreground">Availability</span>
                              <span className="font-bold">{plan.availability_pct}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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
                    <p className="text-muted-foreground text-sm py-4 italic">No test results yet</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Matrix Table */}
        <MatrixTable />

        {/* Trend chart */}
        <Card className="overflow-hidden border-border/50">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Comparison Trend — TPS</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Select up to 5 models from status cards above to compare</p>
              </div>
              {selectedIds.length > 0 && (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                  {selectedIds.length} / 5 Models
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {trendPlans.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart>
                  <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(label) => formatTime(String(label))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                  {trendPlans.map((plan, i) => (
                    plan.trend.length > 0 && (
                      <Line
                        key={plan.id}
                        yAxisId="left"
                        type="monotone"
                        data={plan.trend}
                        dataKey="tps_overall"
                        stroke={`oklch(0.6 ${0.1 + (i % 5) * 0.03} ${20 + i * 40})`}
                        strokeWidth={2}
                        name={`${plan.name} TPS`}
                        dot={false}
                        connectNulls
                      />
                    )
                  ))}
                  {trendPlans.map((plan, i) => (
                    plan.trend.length > 0 && (
                      <Line
                        key={`${plan.id}-ttft`}
                        yAxisId="right"
                        type="monotone"
                        data={plan.trend}
                        dataKey="ttft_ms"
                        stroke={`oklch(0.6 ${0.1 + (i % 5) * 0.03} ${20 + i * 40})`}
                        strokeWidth={1}
                        strokeDasharray="5 5"
                        name={`${plan.name} TTFT`}
                        dot={false}
                        connectNulls
                        hide={true}
                      />
                    )
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/20">
                <p className="text-muted-foreground font-medium text-sm">No models selected for comparison</p>
                <p className="text-[11px] text-muted-foreground mt-1">Use the "Compare" switch on model cards above</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="border-t mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          <a href="https://github.com/qingmuhy744/TokenMeter" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a>
          {" · "}
          Powered by TokenMeter
        </div>
      </div>
    </div>
  );
}
