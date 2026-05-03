import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type DashboardRow = {
  objectId: number;
  name: string;
  objectClass: string | null;
  status: 'active' | 'paused' | 'closed';
  hasAnalytics: boolean;
  objReadinessPct: number | null;
  weightedForecastDate: string | null;
  criticalPathForecastDate: string | null;
  gapFlag: boolean;
};

export type StalenessMeta = {
  isStale: boolean;
  refreshedAt: string | null;
  staleReason: 'mv_refresh_failed' | 'older_than_30min' | null;
};

export type DashboardResponse = {
  items: DashboardRow[];
  pagination: { page: number; pageSize: number; total: number };
  meta: StalenessMeta;
};

export type DashboardQuery = {
  search?: string;
  status?: 'active' | 'paused' | 'closed';
  objectClass?: string;
  gapOnly?: boolean;
  sort?: 'gapFirst' | 'readinessAsc' | 'readinessDesc' | 'forecastAsc' | 'forecastDesc' | 'nameAsc';
  page?: number;
  pageSize?: number;
};

export type ObjectDetailResponse = {
  object: {
    id: number;
    name: string;
    objectClass: string | null;
    address: string | null;
    permitNumber: string | null;
    permitDate: string | null;
    connectionDate: string | null;
    status: string;
  };
  participants: Array<{
    role: string;
    orgName: string;
    contactPerson: string | null;
    contactEmail: string | null;
    validFrom: string;
  }>;
  activeBoq: { id: number; versionNumber: string; itemsCount: number } | null;
  currentPeriod: {
    id: number;
    periodNumber: number;
    status: string;
    openedAt: string;
    closedAt: string | null;
  } | null;
  hasAnalytics: boolean;
  current: {
    objReadinessPct: number | null;
    weightedForecastDate: string | null;
    criticalPathForecastDate: string | null;
    gapFlag: boolean;
  } | null;
  history: Array<{
    periodId: number;
    periodNumber: number;
    closedAt: string | null;
    objectReadinessPct: number;
    weightedForecastDate: string | null;
    criticalPathForecastDate: string | null;
    gapFlag: boolean;
    boqVersionNumber: string;
  }>;
  meta: StalenessMeta;
};

export const dashboardApi = {
  list: (params: DashboardQuery) =>
    api.get<DashboardResponse>('/dashboard', { params }).then((r) => r.data),
  refreshDashboard: () =>
    api.post<{ refreshedAt: string }>('/admin/refresh-dashboard').then((r) => r.data),
};

export const objectsApi = {
  detail: (id: number) =>
    api.get<ObjectDetailResponse>(`/objects/${id}`).then((r) => r.data),
};
