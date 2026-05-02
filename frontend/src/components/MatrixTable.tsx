import { useEffect, useState, useMemo } from "react";
import { api, type MatrixItem } from "@/api/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[oklch(0.6_0.2_250)] dark:text-[oklch(0.7_0.15_200)]"
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

export default function MatrixTable() {
  const [data, setData] = useState<MatrixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    const tzOffset = -new Date().getTimezoneOffset();
    api.getMatrix(7, tzOffset)
      .then(items => {
        setData(items.filter(item => item.avg_ttft !== null || item.latest_status !== null));
      })
      .finally(() => setLoading(false));
  }, []);

  const columns = useMemo(() => [
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
      header: "24h TTFT",
      cell: info => <Sparkline data={info.getValue()} />,
      enableSorting: false,
    }),
    columnHelper.accessor("avg_ttft", {
      header: ({ column }) => (
        <div 
          className="flex items-center justify-end cursor-pointer select-none gap-1"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Avg TTFT
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
        >
          TPS (All)
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
        >
          TPS (Gen)
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
        >
          Day
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
        >
          Night
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
        >
          Degrad.
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
        >
          Success
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
  ], []);

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

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading performance matrix...</div>;

  return (
    <Card className="overflow-hidden border border-border/50 shadow-xl bg-card/50 backdrop-blur-sm">
      <CardHeader className="bg-muted/30 border-b border-border/50 py-4">
        <CardTitle className="text-lg font-semibold tracking-tight">7-Day Performance Matrix</CardTitle>
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
                      index === 0 && "sticky left-0 bg-muted/95 backdrop-blur-md z-30 border-r border-border/50 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]"
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
            {table.getRowModel().rows.map(row => (
              <TableRow key={row.id} className="group hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0">
                {row.getVisibleCells().map((cell, index) => (
                  <TableCell 
                    key={cell.id} 
                    className={cn(
                      "px-4 py-3 align-middle transition-colors",
                      index === 0 && "sticky left-0 bg-background/95 backdrop-blur-md z-10 border-r border-border/50 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] group-hover:bg-muted/90"
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
