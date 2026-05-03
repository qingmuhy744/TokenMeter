import type { Plan } from "@/api/client";

export interface PlanWithChildren extends Plan {
  children: PlanWithChildren[];
}

export const buildPlanTree = (plans: Plan[]): PlanWithChildren[] => {
  const map: Record<number, PlanWithChildren> = {};
  const roots: PlanWithChildren[] = [];

  plans.forEach((p) => {
    map[p.id] = { ...p, children: [] };
  });

  plans.forEach((p) => {
    if (p.parent_id && map[p.parent_id]) {
      map[p.parent_id].children.push(map[p.id]);
    } else {
      roots.push(map[p.id]);
    }
  });

  return roots;
};

export const findInTree = (
  tree: PlanWithChildren[],
  id: number
): PlanWithChildren | null => {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findInTree(node.children, id);
    if (found) return found;
  }
  return null;
};
