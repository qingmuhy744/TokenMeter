import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, type MatrixItem } from "@/api/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  
  const green = "bg-green/10 text-green font-medium";
  const yellow = "bg-amber/10 text-amber font-medium";
  const red = "bg-red/10 text-red font-medium";

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

const columnHelper = createColumnHelper<MatrixItem>();

interface MatrixTableProps {
  selectedIds?: number[];
  onToggleSelection?: (id: number) => void;
}

export default function MatrixTable({ selectedIds = [], onToggleSelection }: MatrixTableProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<MatrixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<'all' | 'day' | 'night'>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollKey = 'matrix-scroll-position';

  useEffect(() => {
    const saved = sessionStorage.getItem(lastScrollKey);
    if (saved && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = parseInt(saved, 10);
    }
  }, []);

  const saveScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      sessionStorage.setItem(lastScrollKey, scrollContainerRef.current.scrollTop.toString());
    }
  }, []);

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
    columnHelper.accessor("full_name", {
      header: ({ column }) => (
        <div 
          className="flex items-center cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t("matrix.modelPlan")}
          {{
            asc: <ArrowUp className="w-4 h-4 text-primary" />,
            desc: <ArrowDown className="w-4 h-4 text-primary" />,
          }[column.getIsSorted() as string] ?? <ArrowUpDown className="w-4 h-4 opacity-50" />}
        </div>
      ),
      cell: info => {
        const isPublicContext = window.location.pathname.startsWith('/status') || window.location.pathname.startsWith('/public');
        const fullName = info.getValue();
        const [provider, ...modelParts] = fullName.split(' > ');
        const model = modelParts.join(' > ');
        return (
          <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
            <span className="text-[10px] text-muted-foreground/60 leading-none">{provider}</span>
            <span 
              className="font-medium text-foreground/90 text-[11px] leading-tight cursor-pointer hover:text-primary hover:underline"
              title={fullName}
              onClick={(e) => {
                e.stopPropagation();
                const target = isPublicContext ? `/public/plan/${info.row.original.plan_id}` : `/plan/${info.row.original.plan_id}`;
                window.open(target, '_blank');
              }}
            >
              {model}
            </span>
          </div>
        );
      },
      size: 140,
      minSize: 100,
      maxSize: 200,
    }),
    columnHelper.accessor("latest_status", {
      header: t("matrix.status"),
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
      header: t("matrix.trend24h"),
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
          <span className="border-b border-dashed border-muted-foreground/50">{t("matrix.avgTTFT")}</span>
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
          <span className="border-b border-dashed border-muted-foreground/50">{t("matrix.tpsAll")}</span>
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
          <span className="border-b border-dashed border-muted-foreground/50">{t("matrix.tpsGen")}</span>
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
    columnHelper.accessor("night_avg_ttft", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          title={t("history.ttftDef")}
        >
          <span className="border-b border-dashed border-muted-foreground/50">{t("matrix.nightTTFT")}</span>
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
          title={t("matrix.degradation")}
        >
          <span className="border-b border-dashed border-muted-foreground/50">{t("matrix.degradation")}</span>
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
          title={t("matrix.success")}
        >
          <span className="border-b border-dashed border-muted-foreground/50">{t("matrix.success")}</span>
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
  ], [t]);

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
          >{t("matrix.allLabel")}</Button>
          <Button 
            variant={mode === 'day' ? "default" : "ghost"} 
            size="sm" className="h-8 text-xs px-3"
            onClick={() => setMode('day')}
          >{t("matrix.day")}</Button>
          <Button 
            variant={mode === 'night' ? "default" : "ghost"} 
            size="sm" className="h-8 text-xs px-3"
            onClick={() => setMode('night')}
          >{t("matrix.night")}</Button>
        </div>
      </div>

      {/* Mobile Tiles View */}
      <div className="grid grid-cols-1 gap-4 sm:hidden">
        {table.getRowModel().rows.map(row => (
          <div 
            key={row.id}
            className={cn(
              "rounded-2xl border p-5 shadow-sm transition-all active:scale-[0.98]",
              selectedIds.includes(row.original.plan_id)
                ? "border-amber/40 bg-amber/5"
                : "border-white/5 bg-card"
            )}
            onClick={() => onToggleSelection?.(row.original.plan_id)}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1" onClick={e => e.stopPropagation()}>
                <h3 
                  className="font-heading font-bold text-foreground/90 text-lg leading-tight tracking-tight cursor-pointer hover:text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    const target = window.location.pathname.startsWith('/status') || window.location.pathname.startsWith('/public')
                      ? `/public/plan/${row.original.plan_id}`
                      : `/plan/${row.original.plan_id}`;
                    window.open(target, '_blank');
                  }}
                >
                  {row.original.full_name}
                </h3>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    row.original.latest_status === "success" ? "bg-green shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-red shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                  )} />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {row.original.latest_status}
                  </span>
                </div>
              </div>
              {selectedIds.includes(row.original.plan_id) && (
                <div className="size-6 rounded-full bg-primary flex items-center justify-center shadow-glow-amber">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary-foreground">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.05em] font-semibold text-muted-foreground/60 font-mono">{t("matrix.avgTTFT")}</p>
                <p className="text-3xl font-bold text-foreground tracking-tighter font-heading">
                  {row.original.avg_ttft?.toFixed(0)}<span className="text-sm font-medium text-muted-foreground ml-1">ms</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.05em] font-semibold text-muted-foreground/60 font-mono">{t("matrix.mobileTpsGen")}</p>
                <p className="text-3xl font-bold text-foreground tracking-tighter font-heading">
                  {row.original.avg_tps_generate?.toFixed(1)}
                </p>
              </div>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider font-mono">{t("matrix.mobileTrend24h")}</p>
                {row.original.sparkline && row.original.sparkline.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums font-mono">
                    {Math.min(...(row.original.sparkline.filter(v => v !== null) as number[]))?.toFixed(1)} 
                    <span className="mx-1">→</span>
                    {Math.max(...(row.original.sparkline.filter(v => v !== null) as number[]))?.toFixed(1)} TPS
                  </span>
                )}
              </div>
              <Sparkline data={row.original.sparkline} className="w-full h-12 text-amber" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden sm:block overflow-hidden border border-white/5 bg-card shadow-md rounded-2xl">
        <CardHeader className="bg-muted/20 border-b border-white/5 py-5 flex flex-row items-center justify-between space-y-0 px-6">
          <div>
            <CardTitle className="text-lg font-heading font-bold tracking-tight text-foreground">
              {days}-Day Performance Matrix
            </CardTitle>
            <p className="text-[12px] text-muted-foreground mt-1.5 flex items-center gap-2">
              <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{t("matrix.instructions")}</span>
              <span className="hidden md:inline">{t("matrix.scrollHint")}</span>
              <span className="md:hidden">{t("matrix.scrollHint")}</span>
              <span className="hidden md:inline opacity-50">|</span>
              <span className="hidden md:inline text-muted-foreground/60">⌨️ {t("matrix.keyboardHint")}</span>
              <span className="md:hidden text-muted-foreground/60">🔗 {t("matrix.nameHint")}</span>
            </p>
          </div>
          {loading && <div className="text-[10px] text-muted-foreground animate-pulse font-medium uppercase tracking-widest">Updating...</div>}
        </CardHeader>
        <CardContent className="p-0">
          <div 
            className="w-full max-h-[700px] overflow-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent"
            ref={scrollContainerRef}
            onScroll={saveScroll}
          >
            <Table className="w-full min-w-[1000px]">
              <TableHeader className="bg-card sticky top-0 z-30">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent border-b border-white/5">
                  {headerGroup.headers.map((header, index) => (
                    <TableHead 
                      key={header.id} 
                      className={cn(
                        "h-14 px-6 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 transition-colors",
                        index === 0 && "sticky left-0 z-50 bg-card shadow-[2px_0_8px_-4px_rgba(0,0,0,0.3)] border-l-0"
                      )}
                      style={index === 0 ? { minWidth: header.getSize(), maxWidth: header.getSize() } : undefined}
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
                      "group transition-colors border-b border-white/5 last:border-0 text-sm cursor-pointer",
                      isSelected 
                        ? "bg-muted hover:bg-muted/80 border-l-2 border-l-amber" 
                        : "hover:bg-muted/20"
                    )}
                    onClick={() => onToggleSelection?.(row.original.plan_id)}
                  >
                    {row.getVisibleCells().map((cell, index) => (
                      <TableCell 
                        key={cell.id} 
                        className={cn(
                          "px-6 py-4 align-middle transition-colors",
                          index === 0 && cn(
                            "sticky left-0 z-20 shadow-[4px_0_12px_-6px_rgba(0,0,0,0.5)] border-l-0",
                            isSelected ? "bg-muted" : "bg-card"
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
