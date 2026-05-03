import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './pages/DashboardPage';
import { ObjectDetailPage } from './pages/ObjectDetailPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { getAuthUser } from './store/auth';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = getAuthUser();
  if (!user) return <Navigate to="/forbidden" replace />;
  if (user.role === 'gp') return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
          />
          <Route
            path="/objects/:id"
            element={<ProtectedRoute><ObjectDetailPage /></ProtectedRoute>}
          />
          <Route path="/forbidden" element={<ForbiddenPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
