import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function History() {
  const [plans, setPlans] = useState<any[]>([]);
  const [results, setResults] = useState<any>({ items: [], total: 0 });
  const [selectedPlan, setSelectedPlan] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => { api.getPlans().then(setPlans); }, []);
  useEffect(() => {
    const params: Record<string, string> = { page: String(page), size: "20" };
    if (selectedPlan !== "all") params.plan_id = selectedPlan;
    api.getResults(params).then(setResults);
  }, [selectedPlan, page]);

  const chartData = [...results.items].filter((r: any) => !r.error && r.tps_overall).reverse().map((r: any) => ({
    time: new Date(r.created_at).toLocaleTimeString(), tps: r.tps_overall, ttft: r.ttft_ms,
  }));

  const planName = (id: number) => plans.find((p) => p.id === id)?.name || `Plan ${id}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Test History</h1>
      <div className="flex gap-4">
        <Select value={selectedPlan} onValueChange={(v) => { setSelectedPlan(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All plans" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {plans.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      {chartData.length > 1 && (
        <Card>
          <CardHeader><CardTitle>TPS Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}><XAxis dataKey="time" /><YAxis /><Tooltip /><Line type="monotone" dataKey="tps" stroke="hsl(var(--primary))" name="TPS" dot={false} /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      <Table>
        <TableHeader>
          <TableRow><TableHead>Time</TableHead><TableHead>Plan</TableHead><TableHead>TTFT (ms)</TableHead><TableHead>TPS (overall)</TableHead><TableHead>TPS (generate)</TableHead><TableHead>Tokens</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {results.items.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
              <TableCell>{planName(r.plan_id)}</TableCell>
              <TableCell>{r.ttft_ms?.toFixed(0)}</TableCell>
              <TableCell>{r.tps_overall?.toFixed(1)}</TableCell>
              <TableCell>{r.tps_generate?.toFixed(1)}</TableCell>
              <TableCell>{r.total_tokens}</TableCell>
              <TableCell>{r.error ? <span className="text-destructive text-sm">Error</span> : r.total_tokens === 0 ? <span className="text-yellow-600 text-sm">Warn</span> : <span className="text-green-600 text-sm">OK</span>}</TableCell>
              <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={r.note || r.debug_chunks || ""}>{r.note || ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Total: {results.total}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <span className="text-sm py-1">Page {page}</span>
          <Button variant="outline" size="sm" disabled={results.items.length < 20} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
