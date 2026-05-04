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
              <span className={cn("text-muted-foreground italic cursor-default", className)} tabIndex={0}>
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
    return <span className={cn("text-muted-foreground/50 italic", className)}>-</span>;
  };

  const MobilePlanCard = ({ node, depth = 0 }: { node: PlanWithChildren; depth?: number }) => (
    <div 
      className={cn(
        "rounded-2xl border border-white/5 bg-card shadow-md overflow-hidden mb-4",
        depth > 0 && "ml-6 border-l-2 border-l-white/5"
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {depth > 0 && <CornerDownRight className="h-4 w-4 text-muted-foreground/40 mt-1 flex-shrink-0" />}
            <div>
              <h3 className="text-foreground/90 font-semibold leading-tight">{node.name}</h3>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant={node.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
                  {node.is_active ? t("dashboard.active") : t("dashboard.inactive")}
                </Badge>
                <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 rounded">
                  {node.interval_minutes}m
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground/60 hover:text-foreground hover:bg-white/5" onClick={() => onEdit(node)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400/60 hover:text-red-400 hover:bg-red-500/10" onClick={() => onDelete(node.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-2 text-xs border-t border-white/5 pt-3">
          <div>
            <span className="text-muted-foreground/60 block mb-0.5">{t("plans.apiType")}</span>
            <span className="text-foreground/80 font-medium">
              {fieldDisplay(node.api_type, node.effective_api_type)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground/60 block mb-0.5">{t("plans.model")}</span>
            <span className="text-foreground/80 font-medium truncate block font-mono">
              {fieldDisplay(node.model, node.effective_model)}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button 
            className="w-full bg-primary hover:brightness-110 text-primary-foreground rounded-xl h-9 shadow-sm"
            onClick={() => onTest(node.id, !node.parent_id)}
          >
            {node.parent_id ? <Play className="h-3.5 w-3.5 mr-2" /> : <PlayCircle className="h-3.5 w-3.5 mr-2" />}
            {node.parent_id ? t("plans.runTest") : t("plans.runAll")}
          </Button>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="bg-muted/20 p-2 border-t border-white/5">
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
        "group transition-colors",
        depth === 0 && "bg-muted/30 border-b-2 border-border/60",
        depth > 0 && "bg-card border-b border-border/30"
      )}>
        <TableCell className={cn("py-4", depth === 0 && "pl-5", depth > 0 && "pl-4")}>
          <div className="flex items-center">
            {depth > 0 && (
              <div 
                className="flex-shrink-0 mr-2 text-muted-foreground/40"
                style={{ marginLeft: `${(depth - 1) * 2}rem` }}
              >
                <CornerDownRight className="h-4 w-4" />
              </div>
            )}
            {depth === 0 && (
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center mr-3 flex-shrink-0">
                <span className="text-primary text-xs font-bold">{node.name.charAt(0)}</span>
              </div>
            )}
            <span className={cn(
              "font-medium",
              depth === 0 ? "text-foreground text-sm" : "text-foreground/80 text-sm"
            )}>
              {node.name}
            </span>
          </div>
        </TableCell>
        <TableCell className="py-3">{fieldDisplay(node.api_type, node.effective_api_type, "text-muted-foreground")}</TableCell>
        <TableCell className="py-3 max-w-[200px] truncate">
          {fieldDisplay(node.api_base, node.effective_api_base, "text-muted-foreground/60 text-xs")}
        </TableCell>
        <TableCell className="py-3 font-mono text-xs">
          {fieldDisplay(node.model, node.effective_model, "text-foreground/70")}
        </TableCell>
        <TableCell className="py-3 text-muted-foreground">
          {node.interval_minutes}m
          {node.parent_id && node.multiplier !== 1 && (
            <span className="text-[10px] text-muted-foreground/40 ml-1 font-medium">(x{node.multiplier})</span>
          )}
        </TableCell>
        <TableCell className="py-3">
          <Badge 
            variant={node.is_active ? "default" : "secondary"}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              node.is_active ? "bg-green/10 text-green border-green/20 hover:bg-green/20" : "bg-muted text-muted-foreground/60 border-none"
            )}
          >
            {node.is_active ? t("dashboard.active") : t("dashboard.inactive")}
          </Badge>
        </TableCell>
        <TableCell className="py-3 text-right">
          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button size="sm" variant="outline" className="h-8 rounded-lg border-white/10 bg-transparent shadow-sm" onClick={() => onTest(node.id, !node.parent_id)}>
                    {node.parent_id ? (
                      <Play className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5 text-amber" />
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

            <Button size="sm" variant="outline" className="h-8 rounded-lg border-white/10 bg-transparent shadow-sm hover:bg-white/5 hover:text-foreground" onClick={() => onEdit(node)}>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button size="sm" variant="outline" className="h-8 rounded-lg border-white/10 bg-transparent shadow-sm hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20" onClick={() => onDelete(node.id)}>
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
          <div className="text-center py-10 text-muted-foreground bg-card rounded-2xl border border-dashed border-white/10">
            {t("dashboard.noPlans")}
          </div>
        )}
      </div>

      {/* Desktop View */}
      <div className="hidden md:block rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider h-11">{t("plans.name")}</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider h-11">{t("plans.apiType")}</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider h-11">{t("plans.apiBaseUrl")}</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider h-11">{t("plans.model")}</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider h-11">{t("plans.interval")}</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider h-11">{t("plans.active")}</TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold text-xs uppercase tracking-wider h-11">{t("plans.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {planTree.length > 0 ? (
              planTree.map((node) => renderDesktopRow(node, 0))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-20 text-muted-foreground">
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
