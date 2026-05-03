import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { Plan } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, Pencil, Trash2, PlayCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPortal, TooltipPositioner, TooltipPopup } from "@/components/ui/tooltip";
import type { PlanWithChildren } from "./utils";

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
    effective: string | number | null | undefined
  ) => {
    if (own != null && own !== "") return <>{own}</>;
    if (effective != null && effective !== "")
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="text-muted-foreground italic cursor-default" tabIndex={0}>
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
    return <span className="text-muted-foreground italic">-</span>;
  };

  const renderRow = (node: PlanWithChildren, depth: number = 0): React.ReactNode => (
    <Fragment key={node.id}>
      <TableRow className={depth > 0 ? "bg-muted/30" : ""}>
        <TableCell className="font-medium">
          <span style={{ paddingLeft: `${depth * 2}rem` }}>
            {depth > 0 && <span className="text-muted-foreground select-none">{"└─ "}</span>}
            {node.name}
          </span>
        </TableCell>
        <TableCell>{fieldDisplay(node.api_type, node.effective_api_type)}</TableCell>
        <TableCell>{fieldDisplay(node.api_base, node.effective_api_base)}</TableCell>
        <TableCell>{fieldDisplay(node.model, node.effective_model)}</TableCell>
        <TableCell>
          {node.interval_minutes}m
          {node.parent_id && node.multiplier !== 1 && (
            <span className="text-[10px] text-muted-foreground ml-1">(x{node.multiplier})</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={node.is_active ? "default" : "secondary"}>
            {node.is_active ? t("dashboard.active") : t("dashboard.inactive")}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button size="sm" variant="outline" onClick={() => onTest(node.id, !node.parent_id)}>
                    {node.parent_id ? (
                      <Play className="h-3 w-3" />
                    ) : (
                      <PlayCircle className="h-3 w-3 text-primary" />
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

            <Button size="sm" variant="outline" onClick={() => onEdit(node)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDelete(node.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {node.children.map((child) => renderRow(child, depth + 1))}
    </Fragment>
  );

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("plans.name")}</TableHead>
            <TableHead>{t("plans.apiType")}</TableHead>
            <TableHead>{t("plans.apiBaseUrl")}</TableHead>
            <TableHead>{t("plans.model")}</TableHead>
            <TableHead>{t("plans.interval")}</TableHead>
            <TableHead>{t("plans.active")}</TableHead>
            <TableHead className="text-right">{t("plans.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {planTree.length > 0 ? (
            planTree.map((node) => renderRow(node, 0))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                {t("dashboard.noPlans")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
