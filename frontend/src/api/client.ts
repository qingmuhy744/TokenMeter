import { hashPassword } from "@/lib/utils";

const BASE = "/api";

export interface Plan {
  id: number;
  name: string;
  api_type: string;
  api_base: string;
  api_key: string;
  model: string;
  prompt: string | null;
  max_tokens: number;
  test_count: number;
  interval_minutes: number;
  is_active: boolean;
  multiplier: number;
  created_at: string;
  updated_at: string;
  latest_result?: TestResult | null;
  parent_id?: number | null;
  effective_api_type?: string | null;
  effective_api_base?: string | null;
  effective_api_key?: string | null;
  effective_model?: string | null;
  effective_prompt?: string | null;
  effective_max_tokens?: number | null;
  effective_test_count?: number | null;
}

export interface TestResult {
  id: number;
  plan_id: number;
  plan_name?: string | null;
  ttft_ms: number | null;
  tps_overall: number | null;
  tps_generate: number | null;
  total_tokens: number | null;
  total_time_ms: number | null;
  input_tokens?: number | null;
  cache_read?: number | null;
  char_count?: number | null;
  token_density?: number | null;
  ttfb_ms?: number | null;
  ttfr_ms?: number | null;
  think_time_ms?: number | null;
  content_tokens?: number | null;
  thinking_tokens?: number | null;
  tps_content?: number | null;
  content_char_count?: number | null;
  thinking_char_count?: number | null;
  ping_ms?: number | null;
  ping_samples?: string | null;
  error: string | null;
  note: string | null;
  debug_chunks: string | null;
  created_at: string;
}

export interface Stats {
  plan_id: number;
  count: number;
  avg_ttft_ms: number | null;
  avg_tps_overall: number | null;
  avg_tps_generate: number | null;
  median_ttft_ms: number | null;
  median_tps_overall: number | null;
  p95_ttft_ms: number | null;
}

export interface MatrixItem {
  plan_id: number;
  full_name: string;
  latest_status: "success" | "error" | "none";
  sparkline: (number | null)[];
  avg_ttft: number | null;
  avg_tps_overall: number | null;
  avg_tps_generate: number | null;
  day_avg_ttft: number | null;
  night_avg_ttft: number | null;
  degradation: number | null;
  success_rate: number | null;
}

export interface Settings {
  default_prompt: string;
  timeout_seconds: number;
  custom_banner: string | null;
}

export interface PaginatedResults {
  items: TestResult[];
  total: number;
  page: number;
  size: number;
}

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
  login: async (username: string, password: string) => {
    const hashedPassword = await hashPassword(password);
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password: hashedPassword }),
    });
  },
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request<{ id: number; username: string }>("/auth/me"),
  changePassword: async (old_password: string, new_password: string) => {
    const hashedPassword = await hashPassword(old_password);
    const hashedNew = await hashPassword(new_password);
    return request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: hashedPassword, new_password: hashedNew }),
    });
  },

  getPlans: () => request<Plan[]>("/plans"),
  createPlan: (data: Partial<Plan>) => request<Plan>("/plans", { method: "POST", body: JSON.stringify(data) }),
  updatePlan: (id: number, data: Partial<Plan>) =>
    request<Plan>(`/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePlan: (id: number) => request(`/plans/${id}`, { method: "DELETE" }),
  triggerTest: (id: number) => request<{ task_id: string }>(`/plans/${id}/test`, { method: "POST" }),

  getResults: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<PaginatedResults>(`/results?${qs}`);
  },
  getPublicResults: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<PaginatedResults>(`/public/results?${qs}`);
  },
  getMatrix: (days: number = 7, tzOffset: number = 0, mode: string = "all") => {
    const isPublic = window.location.pathname.startsWith('/status') || window.location.pathname.startsWith('/public');
    const path = isPublic ? "/public/matrix" : "/results/matrix";
    return request<MatrixItem[]>(`${path}?days=${days}&tz_offset=${tzOffset}&mode=${mode}`);
  },
  deleteResult: (id: number) => request(`/results/${id}`, { method: "DELETE" }),
  getStats: (planId: number, days: number = 7) =>
    request<Stats>(`/results/stats?plan_id=${planId}&days=${days}`),

  getSettings: () => request<Settings>("/settings"),
  updateSettings: (data: Partial<Settings>) => request<Settings>("/settings", { method: "PUT", body: JSON.stringify(data) }),

  getLogs: (limit: number = 100) => request<{ lines: string[] }>(`/logs?limit=${limit}`),
};
