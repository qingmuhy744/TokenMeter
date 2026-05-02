import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import MatrixTable from "@/components/MatrixTable";

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

  useEffect(() => {
    let active = true;
    fetchStatus(range)
      .then((res) => {
        if (active) setData(res);
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
    <div className="min-h-screen bg-background">
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

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
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
          {data.plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <Badge variant={plan.latest_result && !plan.latest_result.error && !plan.latest_result.is_unavailable ? "default" : "destructive"}>
                    {plan.latest_result && !plan.latest_result.error && !plan.latest_result.is_unavailable ? "Operational" : plan.latest_result?.is_unavailable ? "Unavailable" : "Degraded"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{plan.api_type} / {plan.model}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.latest_result ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">TTFT</p>
                        <p className="text-lg font-semibold">{plan.latest_result.ttft_ms ?? "—"}ms</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">TPS Overall</p>
                        <p className="text-lg font-semibold">{plan.latest_result.tps_overall ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">TPS Generate</p>
                        <p className="text-lg font-semibold">{plan.latest_result.tps_generate ?? "—"}</p>
                      </div>
                    </div>
                    {(plan.latest_result.ttfr_ms != null || plan.latest_result.ping_ms != null) && (
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        {plan.latest_result.ttfb_ms != null && (
                          <div>
                            <p className="text-muted-foreground">TTFB</p>
                            <p className="text-sm font-semibold">{plan.latest_result.ttfb_ms}ms</p>
                          </div>
                        )}
                        {plan.latest_result.ttfr_ms != null && (
                          <div>
                            <p className="text-muted-foreground">TTFR</p>
                            <p className="text-sm font-semibold">{plan.latest_result.ttfr_ms}ms</p>
                          </div>
                        )}
                        {plan.latest_result.think_time_ms != null && (
                          <div>
                            <p className="text-muted-foreground">Think</p>
                            <p className="text-sm font-semibold">{plan.latest_result.think_time_ms}ms</p>
                          </div>
                        )}
                        {plan.latest_result.ping_ms != null && (
                          <div>
                            <p className="text-muted-foreground">Ping</p>
                            <p className="text-sm font-semibold">{plan.latest_result.ping_ms}ms</p>
                          </div>
                        )}
                        {plan.latest_result.tps_content != null && (
                          <div>
                            <p className="text-muted-foreground">TPS Content</p>
                            <p className="text-sm font-semibold">{plan.latest_result.tps_content}</p>
                          </div>
                        )}
                        {plan.latest_result.thinking_tokens != null && plan.latest_result.thinking_tokens > 0 && (
                          <div>
                            <p className="text-muted-foreground">Think Tokens</p>
                            <p className="text-sm font-semibold">{plan.latest_result.thinking_tokens}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Last test: {timeAgo(plan.latest_result.created_at)}
                    </p>
                    {plan.availability_pct !== null && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Availability</span>
                          <span>{plan.availability_pct}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${plan.availability_pct >= 99 ? "bg-green-500" : plan.availability_pct >= 95 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${plan.availability_pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No test results yet</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Matrix Table */}
        <MatrixTable />

        {/* Trend chart */}
        {data.plans.some((p) => p.trend.length > 1) && (
          <Card>
            <CardHeader><CardTitle>Trend — TPS</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart>
                  <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(label) => formatTime(String(label))} />
                  <Legend />
                  {data.plans.map((plan, i) => (
                    plan.trend.length > 1 && (
                      <Line
                        key={plan.id}
                        yAxisId="left"
                        type="monotone"
                        data={plan.trend}
                        dataKey="tps_overall"
                        stroke={`var(--color-chart-${(i % 3) + 1})`}
                        strokeWidth={2}
                        name={`${plan.name} TPS`}
                        dot={false}
                        connectNulls
                      />
                    )
                  ))}
                  {data.plans.map((plan, i) => (
                    plan.trend.length > 1 && (
                      <Line
                        key={`${plan.id}-ttft`}
                        yAxisId="right"
                        type="monotone"
                        data={plan.trend}
                        dataKey="ttft_ms"
                        stroke={`var(--color-chart-${(i % 3) + 1})`}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name={`${plan.name} TTFT`}
                        dot={false}
                        connectNulls
                      />
                    )
                  ))}
                  {data.plans.map((plan, i) => (
                    plan.trend.length > 1 && (
                      <Line
                        key={`${plan.id}-tps-gen`}
                        yAxisId="left"
                        type="monotone"
                        data={plan.trend}
                        dataKey="tps_generate"
                        stroke={`var(--color-chart-${(i % 3) + 1})`}
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        name={`${plan.name} TPS Gen`}
                        dot={false}
                        connectNulls
                      />
                    )
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <div className="border-t mt-8">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-xs text-muted-foreground">
          <a href="https://github.com/qingmuhy744/TokenMeter" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a>
          {" · "}
          Powered by TokenMeter
        </div>
      </div>
    </div>
  );
}
