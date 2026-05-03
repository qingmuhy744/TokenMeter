import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import type { Plan } from "@/api/client";
import { findInTree } from "./utils";
import type { PlanWithChildren } from "./utils";

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Plan | null;
  planTree: PlanWithChildren[];
  onConfirm: () => void;
}

export const DeleteDialog = ({
  open,
  onOpenChange,
  target,
  planTree,
  onConfirm,
}: DeleteDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("plans.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {(() => {
              if (!target) return "";
              const node = findInTree(planTree, target.id);
              const childCount = node ? node.children.length : 0;
              if (childCount > 0) {
                return t("plans.cascadeDeleteWarning", {
                  count: childCount,
                  name: target.name,
                });
              }
              return t("plans.deleteConfirm", { name: target.name });
            })()}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 className="h-4 w-4 mr-1" />
            {t("plans.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
