import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api, type MatrixItem } from "@/api/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

// Lightweight Sparkline using pure SVG for high performance
function Sparkline({ data }: { data: (number | null)[] }) {
  if (!data || data.length === 0) return <div className="h-8 w-24 flex items-center justify-center text-[10px] text-muted-foreground">-</div>;
  
  const points = data.filter(v => v !== null && typeof v === 'number');
  if (points.length < 2) return <div className="h-8 w-24 flex items-center justify-center text-[10px] text-muted-foreground">no data</div>;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const padding = 4;
  
  const pathData = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - padding * 2) - padding;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className="h-8 w-24">
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        <path
          d={pathData}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary/60"
        />
      </svg>
    </div>
  );
}

const getHeatmapColor = (value: number | null, type: 'ttft' | 'tps' | 'degradation') => {
  if (value === null) return '';
  
  const green = "bg-[oklch(0.7_0.15_145)]/20 text-[oklch(0.4_0.15_145)] dark:text-[oklch(0.8_0.1_145)]";
  const yellow = "bg-[oklch(0.8_0.15_85)]/20 text-[oklch(0.5_0.15_85)] dark:text-[oklch(0.85_0.1_85)]";
  const red = "bg-[oklch(0.6_0.15_25)]/20 text-[oklch(0.4_0.15_25)] dark:text-[oklch(0.8_0.1_25)]";

  if (type === 'ttft') {
    if (value < 200) return green;
    if (value < 800) return yellow;
    return red;
  }
  if (type === 'tps') {
    if (value > 80) return green;
    if (value > 30) return yellow;
    return red;
  }
  if (type === 'degradation') {
    const absVal = Math.abs(value);
    if (absVal < 0.05) return green;
    if (absVal < 0.20) return yellow;
    return red;
  }
  return '';
};

const columnHelper = createColumnHelper<MatrixItem>();

interface MatrixTableProps {
  selectedIds?: number[];
  onToggleSelection?: (id: number) => void;
}

export default function MatrixTable({ selectedIds = [], onToggleSelection }: MatrixTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<MatrixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<'all' | 'day' | 'night'>('all');

  useEffect(() => {
    setLoading(true);
    const tzOffset = -new Date().getTimezoneOffset();
    api.getMatrix(days, tzOffset, mode)
      .then(items => {
        setData(items.filter(item => item.avg_ttft !== null && item.latest_status !== "none"));
      })
      .finally(() => setLoading(false));
  }, [days, mode]);

  const columns = useMemo(() => [
    columnHelper.display({
      id: "select",
      header: "Compare",
      cell: ({ row }) => (
        <div 
          className="flex justify-center items-center h-full w-full py-3 cursor-default" 
          onClick={e => e.stopPropagation()}
        >
          <div 
            className="p-3 -m-3 hover:bg-primary/10 rounded-full transition-colors cursor-pointer group/cb"
            onClick={() => onToggleSelection?.(row.original.plan_id)}
          >
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-transform group-hover/cb:scale-110"
              checked={selectedIds.includes(row.original.plan_id)}
              readOnly
            />
          </div>
        </div>
      ),
    }),
    columnHelper.accessor("full_name", {
      header: ({ column }) => (
        <div 
          className="flex items-center cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Model / Plan
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => <span className="font-semibold whitespace-nowrap">{info.getValue()}</span>,
    }),
    columnHelper.accessor("latest_status", {
      header: "Status",
      cell: info => (
        <div className="flex justify-center">
          <div className={cn(
            "w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]",
            info.getValue() === "success" ? "bg-[oklch(0.627_0.194_149.214)]" :
            info.getValue() === "error" ? "bg-[oklch(0.627_0.265_25.466)]" : "bg-muted"
          )} title={info.getValue() || 'unknown'} />
        </div>
      ),
    }),
    columnHelper.accessor("sparkline", {
      header: "24h TPS",
      cell: info => <Sparkline data={info.getValue()} />,
      enableSorting: false,
    }),
    columnHelper.accessor("avg_ttft", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          title={t("history.ttftDef")}
        >
          <span className="border-b border-dashed border-muted-foreground/50">Avg TTFT</span>
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => (
        <div className={cn("text-right font-mono px-2 py-1 rounded-md transition-colors", getHeatmapColor(info.getValue(), 'ttft'))}>
          {info.getValue()?.toFixed(0)}ms
        </div>
      ),
    }),
    columnHelper.accessor("avg_tps_overall", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          title={t("history.tpsOverallDef")}
        >
          <span className="border-b border-dashed border-muted-foreground/50">TPS (All)</span>
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => (
        <div className={cn("text-right font-mono px-2 py-1 rounded-md transition-colors", getHeatmapColor(info.getValue(), 'tps'))}>
          {info.getValue()?.toFixed(1)}
        </div>
      ),
    }),
    columnHelper.accessor("avg_tps_generate", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          title={t("history.tpsGenerateDef")}
        >
          <span className="border-b border-dashed border-muted-foreground/50">TPS (Gen)</span>
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => (
        <div className={cn("text-right font-mono px-2 py-1 rounded-md transition-colors", getHeatmapColor(info.getValue(), 'tps'))}>
          {info.getValue()?.toFixed(1)}
        </div>
      ),
    }),
    columnHelper.accessor("day_avg_ttft", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          title={t("history.ttftDef") + " (Day)"}
        >
          <span className="border-b border-dashed border-muted-foreground/50">Day</span>
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => <div className="text-right font-mono text-muted-foreground">{info.getValue()?.toFixed(0)}ms</div>,
    }),
    columnHelper.accessor("night_avg_ttft", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          title={t("history.ttftDef") + " (Night)"}
        >
          <span className="border-b border-dashed border-muted-foreground/50">Night</span>
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => <div className="text-right font-mono text-muted-foreground">{info.getValue()?.toFixed(0)}ms</div>,
    }),
    columnHelper.accessor("degradation", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          title="昼夜劣化率：(白天均值 - 夜间均值) / 夜间均值。数值越大代表白天拥堵越严重。"
        >
          <span className="border-b border-dashed border-muted-foreground/50">Degrad.</span>
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => {
        const val = info.getValue();
        return (
          <div className={cn("text-right font-mono px-2 py-1 rounded-md transition-colors", getHeatmapColor(val, 'degradation'))}>
            {val !== null ? `${(val * 100).toFixed(1)}%` : '-'}
          </div>
        );
      },
    }),
    columnHelper.accessor("success_rate", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          title="请求成功率：(成功请求数 / 总请求数)"
        >
          <span className="border-b border-dashed border-muted-foreground/50">Success</span>
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => {
        const val = info.getValue();
        return (
          <div className="text-right font-mono font-medium">
            {val !== null ? `${(val * 100).toFixed(0)}%` : '-'}
          </div>
        );
      },
    }),
  ], [t, selectedIds, onToggleSelection]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading && data.length === 0) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading performance matrix...</div>;

  const isPublicContext = window.location.pathname.startsWith('/status') || window.location.pathname.startsWith('/public');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex bg-muted p-1 rounded-lg">
          <Button 
            variant={days === 1 ? "default" : "ghost"} 
            size="sm" className="h-8 text-xs px-3"
            onClick={() => setDays(1)}
          >1d</Button>
          <Button 
            variant={days === 7 ? "default" : "ghost"} 
            size="sm" className="h-8 text-xs px-3"
            onClick={() => setDays(7)}
          >7d</Button>
          <Button 
            variant={days === 30 ? "default" : "ghost"} 
            size="sm" className="h-8 text-xs px-3"
            onClick={() => setDays(30)}
          >30d</Button>
        </div>

        <div className="flex bg-muted p-1 rounded-lg">
          <Button 
            variant={mode === 'all' ? "default" : "ghost"} 
            size="sm" className="h-8 text-xs px-3"
            onClick={() => setMode('all')}
          >All</Button>
          <Button 
            variant={mode === 'day' ? "default" : "ghost"} 
            size="sm" className="h-8 text-xs px-3"
            onClick={() => setMode('day')}
          >Day</Button>
          <Button 
            variant={mode === 'night' ? "default" : "ghost"} 
            size="sm" className="h-8 text-xs px-3"
            onClick={() => setMode('night')}
          >Night</Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-border/50 shadow-xl bg-card/50 backdrop-blur-sm">
        <CardHeader className="bg-muted/30 border-b border-border/50 py-4 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-semibold tracking-tight">
            {days}-Day Performance Matrix
          </CardTitle>
          {loading && <div className="text-[10px] text-muted-foreground animate-pulse">Updating...</div>}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-20">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent border-b border-border/50">
                  {headerGroup.headers.map((header, index) => (
                    <TableHead 
                      key={header.id} 
                      className={cn(
                        "h-12 px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors",
                        index === 0 && "sticky left-0 bg-muted/95 backdrop-blur-md z-40 border-b border-border/50 shadow-[2px_0_4px_rgba(0,0,0,0.05)]",
                        index === 1 && "sticky left-[72px] bg-muted/95 backdrop-blur-md z-30 border-r border-border/50 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]"
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map(row => {
                const isSelected = selectedIds.includes(row.original.plan_id);
                return (
                  <TableRow 
                    key={row.id} 
                    className={cn(
                      "group hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 cursor-pointer text-sm",
                      isSelected ? "bg-primary/[0.04]" : "bg-background"
                    )}
                    onClick={() => {
                      const target = isPublicContext ? `/public/history?plan_id=${row.original.plan_id}` : `/history?plan_id=${row.original.plan_id}`;
                      navigate(target);
                    }}
                  >
                    {row.getVisibleCells().map((cell, index) => (
                      <TableCell 
                        key={cell.id} 
                        className={cn(
                          "px-4 py-3 align-middle transition-colors",
                          index === 0 && cn(
                            "sticky left-0 z-20 group-hover:bg-muted/90 border-r border-border/50 shadow-[2px_0_4px_rgba(0,0,0,0.05)]",
                            isSelected ? "bg-primary/[0.04]" : "bg-background/95 backdrop-blur-md"
                          ),
                          index === 1 && cn(
                            "sticky left-[72px] z-10 border-r border-border/50 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] group-hover:bg-muted/90",
                            isSelected ? "bg-primary/[0.04]" : "bg-background/95 backdrop-blur-md"
                          )
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
