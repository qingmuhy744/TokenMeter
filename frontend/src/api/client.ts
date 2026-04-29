const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request<{ id: number; username: string }>("/auth/me"),
  changePassword: (old_password: string, new_password: string) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify({ old_password, new_password }) }),

  getPlans: () => request<any[]>("/plans"),
  createPlan: (data: any) => request("/plans", { method: "POST", body: JSON.stringify(data) }),
  updatePlan: (id: number, data: any) =>
    request(`/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePlan: (id: number) => request(`/plans/${id}`, { method: "DELETE" }),
  triggerTest: (id: number) => request(`/plans/${id}/test`, { method: "POST" }),

  getResults: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/results?${qs}`);
  },
  getStats: (planId: number, days: number = 7) =>
    request<any>(`/results/stats?plan_id=${planId}&days=${days}`),

  getSettings: () => request<any>("/settings"),
  updateSettings: (data: any) => request("/settings", { method: "PUT", body: JSON.stringify(data) }),

  getLogs: (limit: number = 100) => request<{ lines: string[] }>(`/logs?limit=${limit}`),
};
