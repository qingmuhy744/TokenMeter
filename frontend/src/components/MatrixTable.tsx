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
function Sparkline({ data, className }: { data: (number | null)[], className?: string }) {
  if (!data || data.length === 0) return <div className={cn("h-8 w-24 flex items-center justify-center text-[10px] text-muted-foreground", className)}>-</div>;
  
  const points = data.filter(v => v !== null && typeof v === 'number');
  if (points.length < 2) return <div className={cn("h-8 w-24 flex items-center justify-center text-[10px] text-muted-foreground", className)}>no data</div>;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const padding = 2;
  
  const pathData = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - padding * 2) - padding;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className={cn("h-8 w-24", className)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        <path
          d={pathData}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-400 dark:text-slate-500"
        />
      </svg>
    </div>
  );
}

const getHeatmapColor = (value: number | null, type: 'ttft' | 'tps' | 'degradation') => {
  if (value === null) return '';
  
  // Claude-style: soft, low-saturation Slate/Zinc compatible tones
  const green = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400";
  const yellow = "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400";
  const red = "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400";

  if (type === 'ttft') {
    if (value < 300) return green;
    if (value < 800) return yellow;
    return red;
  }
  if (type === 'tps') {
    if (value > 60) return green;
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

const getTileBackground = (item: MatrixItem) => {
  const tps = item.avg_tps_generate;
  if (tps === null) return "bg-slate-50/50 border-slate-200/60";
  if (tps > 60) return "bg-emerald-50/30 border-emerald-100/50 dark:bg-emerald-950/10 dark:border-emerald-900/20";
  if (tps > 30) return "bg-amber-50/30 border-amber-100/50 dark:bg-amber-950/10 dark:border-amber-900/20";
  return "bg-rose-50/30 border-rose-100/50 dark:bg-rose-950/10 dark:border-rose-900/20";
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
        <div className="flex justify-center items-center h-full w-full py-3 cursor-default" onClick={e => e.stopPropagation()}>
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
      cell: info => {
        const isPublicContext = window.location.pathname.startsWith('/status') || window.location.pathname.startsWith('/public');
        return (
          <span 
            className="font-semibold whitespace-nowrap cursor-pointer hover:text-primary hover:underline"
            title="Click to view details"
            onClick={() => {
              const target = isPublicContext ? `/public/history?plan_id=${info.row.original.plan_id}` : `/history?plan_id=${info.row.original.plan_id}`;
              navigate(target);
            }}
          >
            {info.getValue()}
          </span>
        );
      },
    }),
    columnHelper.accessor("latest_status", {
      header: "Status",
      cell: info => (
        <div className="flex justify-center">
          <div className={cn(
            "w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.05)]",
            info.getValue() === "success" ? "bg-emerald-500" :
            info.getValue() === "error" ? "bg-rose-500" : "bg-muted"
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
        <div className={cn("text-right font-mono px-3 py-1.5 rounded-md transition-colors", getHeatmapColor(info.getValue(), 'ttft'))}>
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
        <div className={cn("text-right font-mono px-3 py-1.5 rounded-md transition-colors", getHeatmapColor(info.getValue(), 'tps'))}>
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
        <div className={cn("text-right font-mono px-3 py-1.5 rounded-md transition-colors", getHeatmapColor(info.getValue(), 'tps'))}>
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
          <div className={cn("text-right font-mono px-3 py-1.5 rounded-md transition-colors", getHeatmapColor(val, 'degradation'))}>
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
  ], [t, selectedIds, onToggleSelection, navigate]);

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

  return (
    <div className="space-y-6">
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

      {/* Mobile Tiles View */}
      <div className="grid grid-cols-1 gap-4 sm:hidden">
        {table.getRowModel().rows.map(row => (
          <div 
            key={row.id}
            className={cn(
              "rounded-2xl border p-5 shadow-sm transition-all active:scale-[0.98] cursor-pointer",
              getTileBackground(row.original),
              "border-slate-200/60 dark:border-slate-800/60 shadow-slate-200/50 dark:shadow-none"
            )}
            onClick={() => {
              const isPublicContext = window.location.pathname.startsWith('/status') || window.location.pathname.startsWith('/public');
              const target = isPublicContext ? `/public/history?plan_id=${row.original.plan_id}` : `/history?plan_id=${row.original.plan_id}`;
              navigate(target);
            }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg leading-tight tracking-tight">
                  {row.original.full_name}
                </h3>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    row.original.latest_status === "success" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                  )} />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    {row.original.latest_status}
                  </span>
                </div>
              </div>
              <div 
                className="p-2 -m-2" 
                onClick={e => {
                  e.stopPropagation();
                  onToggleSelection?.(row.original.plan_id);
                }}
              >
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded-full border-slate-300 text-primary focus:ring-primary"
                  checked={selectedIds.includes(row.original.plan_id)}
                  readOnly
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.05em] font-semibold text-slate-500 dark:text-slate-400">Avg TTFT</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tighter">
                  {row.original.avg_ttft?.toFixed(0)}<span className="text-sm font-medium text-slate-400 ml-1">ms</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.05em] font-semibold text-slate-500 dark:text-slate-400">TPS (Gen)</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tighter">
                  {row.original.avg_tps_generate?.toFixed(1)}
                </p>
              </div>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">24h Trend</p>
                {row.original.sparkline && row.original.sparkline.length > 0 && (
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {Math.min(...(row.original.sparkline.filter(v => v !== null) as number[]))?.toFixed(1)} 
                    <span className="mx-1">→</span>
                    {Math.max(...(row.original.sparkline.filter(v => v !== null) as number[]))?.toFixed(1)} TPS
                  </span>
                )}
              </div>
              <Sparkline data={row.original.sparkline} className="w-full h-12" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden sm:block overflow-hidden border border-border/50 shadow-xl bg-card/50 backdrop-blur-sm rounded-2xl">
        <CardHeader className="bg-muted/30 border-b border-border/50 py-5 flex flex-row items-center justify-between space-y-0 px-6">
          <div>
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {days}-Day Performance Matrix
            </CardTitle>
            <p className="text-[12px] text-muted-foreground mt-1.5 flex items-center gap-2">
              <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Instructions</span>
              <span>🖱️ Drag to scroll</span>
              <span className="opacity-50">•</span>
              <span>🔗 Click model name for details</span>
            </p>
          </div>
          {loading && <div className="text-[10px] text-muted-foreground animate-pulse font-medium uppercase tracking-widest">Updating...</div>}
        </CardHeader>
        <CardContent className="p-0">
          <div 
            className="w-full max-h-[700px] overflow-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent"
          >
            <Table className="w-full min-w-[1000px]">
              <TableHeader className="bg-muted/50 sticky top-0 z-20">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent border-b border-border/50">
                  {headerGroup.headers.map((header, index) => (
                    <TableHead 
                      key={header.id} 
                      className={cn(
                        "h-12 px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors",
                        index === 0 && "sm:sticky sm:left-0 sm:bg-muted/95 sm:backdrop-blur-md sm:z-40 sm:border-b sm:border-border/50 sm:shadow-[2px_0_4px_rgba(0,0,0,0.05)]",
                        index === 1 && "sm:sticky sm:left-[72px] sm:bg-muted/95 sm:backdrop-blur-md sm:z-30 sm:border-r sm:border-border/50 sm:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]"
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
                      "group hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm",
                      isSelected ? "bg-slate-50 dark:bg-slate-900" : "bg-background"
                    )}
                  >
                    {row.getVisibleCells().map((cell, index) => (
                      <TableCell 
                        key={cell.id} 
                        className={cn(
                          "px-6 py-4 align-middle transition-colors",
                          index === 0 && cn(
                            "sm:sticky sm:left-0 sm:z-20 sm:group-hover:bg-muted/90 sm:border-r sm:border-border/50 sm:shadow-[2px_0_4px_rgba(0,0,0,0.05)]",
                            isSelected ? "bg-[#f8fafc] dark:bg-[#0f172a]" : "bg-background sm:bg-background/95 sm:backdrop-blur-md"
                          ),
                          index === 1 && cn(
                            "sm:sticky sm:left-[72px] sm:z-10 sm:border-r sm:border-border/50 sm:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] sm:group-hover:bg-muted/90",
                            isSelected ? "bg-[#f8fafc] dark:bg-[#0f172a]" : "bg-background sm:bg-background/95 sm:backdrop-blur-md"
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
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
