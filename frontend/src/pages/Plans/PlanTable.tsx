import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { Plan } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, Pencil, Trash2, PlayCircle, CornerDownRight } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPortal, TooltipPositioner, TooltipPopup } from "@/components/ui/tooltip";
import type { PlanWithChildren } from "./utils";
import { cn } from "@/lib/utils";

interface PlanTableProps {
  planTree: PlanWithChildren[];
  onTest: (id: number, isSuite: boolean) => void;
  onEdit: (plan: Plan) => void;
  onDelete: (id: number) => void;
}

export const PlanTable = ({ planTree, onTest, onEdit, onDelete }: PlanTableProps) => {
  const { t } = useTranslation();

  const fieldDisplay = (
    own: string | number | null | undefined,
    effective: string | number | null | undefined,
    className?: string
  ) => {
    if (own != null && own !== "") return <span className={className}>{own}</span>;
    if (effective != null && effective !== "")
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className={cn("text-slate-400 italic cursor-default", className)} tabIndex={0}>
                {effective}
              </span>
            }
          />
          <TooltipPortal>
            <TooltipPositioner>
              <TooltipPopup>{t("plans.inheritedFromParent")}</TooltipPopup>
            </TooltipPositioner>
          </TooltipPortal>
        </Tooltip>
      );
    return <span className={cn("text-slate-300 italic", className)}>-</span>;
  };

  const MobilePlanCard = ({ node, depth = 0 }: { node: PlanWithChildren; depth?: number }) => (
    <div 
      className={cn(
        "rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden mb-4",
        depth > 0 && "ml-6 border-l-2 border-l-slate-100"
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {depth > 0 && <CornerDownRight className="h-4 w-4 text-slate-300 mt-1 flex-shrink-0" />}
            <div>
              <h3 className="text-slate-900 font-semibold leading-tight">{node.name}</h3>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant={node.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
                  {node.is_active ? t("dashboard.active") : t("dashboard.inactive")}
                </Badge>
                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 rounded">
                  {node.interval_minutes}m
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" onClick={() => onEdit(node)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(node.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-2 text-xs border-t border-slate-50 pt-3">
          <div>
            <span className="text-slate-400 block mb-0.5">{t("plans.apiType")}</span>
            <span className="text-slate-700 font-medium">
              {fieldDisplay(node.api_type, node.effective_api_type)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">{t("plans.model")}</span>
            <span className="text-slate-700 font-medium truncate block">
              {fieldDisplay(node.model, node.effective_model)}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button 
            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-9"
            onClick={() => onTest(node.id, !node.parent_id)}
          >
            {node.parent_id ? <Play className="h-3.5 w-3.5 mr-2" /> : <PlayCircle className="h-3.5 w-3.5 mr-2" />}
            {node.parent_id ? t("plans.runTest") : t("plans.runAll")}
          </Button>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="bg-slate-50/50 p-2 border-t border-slate-100">
          {node.children.map(child => (
            <MobilePlanCard key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );

  const renderDesktopRow = (node: PlanWithChildren, depth: number = 0): React.ReactNode => (
    <Fragment key={node.id}>
      <TableRow className={cn(
        "group transition-colors border-slate-100",
        depth > 0 ? "bg-slate-50/30" : "bg-white hover:bg-slate-50/50"
      )}>
        <TableCell className="py-5">
          <div className="flex items-center">
            {depth > 0 && (
              <div 
                className="flex-shrink-0 mr-2 text-slate-300"
                style={{ marginLeft: `${(depth - 1) * 1.5}rem` }}
              >
                <CornerDownRight className="h-4 w-4" />
              </div>
            )}
            <span className={cn(
              "text-slate-900 font-medium",
              depth === 0 ? "text-base" : "text-sm"
            )}>
              {node.name}
            </span>
          </div>
        </TableCell>
        <TableCell className="py-5">{fieldDisplay(node.api_type, node.effective_api_type, "text-slate-600")}</TableCell>
        <TableCell className="py-5 max-w-[200px] truncate">
          {fieldDisplay(node.api_base, node.effective_api_base, "text-slate-500 text-xs")}
        </TableCell>
        <TableCell className="py-5 font-mono text-xs">
          {fieldDisplay(node.model, node.effective_model, "text-slate-700")}
        </TableCell>
        <TableCell className="py-5 text-slate-600">
          {node.interval_minutes}m
          {node.parent_id && node.multiplier !== 1 && (
            <span className="text-[10px] text-slate-400 ml-1 font-medium">(x{node.multiplier})</span>
          )}
        </TableCell>
        <TableCell className="py-5">
          <Badge 
            variant={node.is_active ? "default" : "secondary"}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              node.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none" : "bg-slate-100 text-slate-500 border-none"
            )}
          >
            {node.is_active ? t("dashboard.active") : t("dashboard.inactive")}
          </Badge>
        </TableCell>
        <TableCell className="py-5 text-right">
          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button size="sm" variant="outline" className="h-8 rounded-lg border-slate-200 shadow-sm" onClick={() => onTest(node.id, !node.parent_id)}>
                    {node.parent_id ? (
                      <Play className="h-3.5 w-3.5 text-slate-600" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5 text-indigo-600" />
                    )}
                  </Button>
                }
              />
              <TooltipPortal>
                <TooltipPositioner>
                  <TooltipPopup>
                    {node.parent_id ? t("plans.runTest") : t("plans.runAll")}
                  </TooltipPopup>
                </TooltipPositioner>
              </TooltipPortal>
            </Tooltip>

            <Button size="sm" variant="outline" className="h-8 rounded-lg border-slate-200 shadow-sm" onClick={() => onEdit(node)}>
              <Pencil className="h-3.5 w-3.5 text-slate-600" />
            </Button>
            <Button size="sm" variant="outline" className="h-8 rounded-lg border-slate-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-100" onClick={() => onDelete(node.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {node.children.map((child) => renderDesktopRow(child, depth + 1))}
    </Fragment>
  );

  return (
    <div>
      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {planTree.length > 0 ? (
          planTree.map((node) => <MobilePlanCard key={node.id} node={node} />)
        ) : (
          <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
            {t("dashboard.noPlans")}
          </div>
        )}
      </div>

      {/* Desktop View */}
      <div className="hidden md:block rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-slate-100">
              <TableHead className="text-slate-500 font-semibold text-xs uppercase tracking-wider h-11">{t("plans.name")}</TableHead>
              <TableHead className="text-slate-500 font-semibold text-xs uppercase tracking-wider h-11">{t("plans.apiType")}</TableHead>
              <TableHead className="text-slate-500 font-semibold text-xs uppercase tracking-wider h-11">{t("plans.apiBaseUrl")}</TableHead>
              <TableHead className="text-slate-500 font-semibold text-xs uppercase tracking-wider h-11">{t("plans.model")}</TableHead>
              <TableHead className="text-slate-500 font-semibold text-xs uppercase tracking-wider h-11">{t("plans.interval")}</TableHead>
              <TableHead className="text-slate-500 font-semibold text-xs uppercase tracking-wider h-11">{t("plans.active")}</TableHead>
              <TableHead className="text-right text-slate-500 font-semibold text-xs uppercase tracking-wider h-11">{t("plans.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {planTree.length > 0 ? (
              planTree.map((node) => renderDesktopRow(node, 0))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-20 text-slate-400">
                  {t("dashboard.noPlans")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
