import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { rolesFor } from './auth/roles';
import { Layout } from './components/Layout';
import { Forbidden, HomeRedirect, RequireAuth, RequireRole } from './components/guards';
import { AuditLogPage } from './pages/AuditLogPage';
import { CorrectionsPage } from './pages/CorrectionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { GeofencePage } from './pages/GeofencePage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage, SetPasswordPage } from './pages/PasswordPages';
import { ReportsPage } from './pages/ReportsPage';
import { RequestDetailPage, RequestsPage } from './pages/RequestsPage';
import { SessionsPage } from './pages/SessionsPage';
import { UsersPage } from './pages/UsersPage';

const guard = (path: string, el: ReactNode) => <RequireRole roles={rolesFor(path)}>{el}</RequireRole>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/activate" element={<SetPasswordPage mode="activate" />} />
      <Route path="/reset-password" element={<SetPasswordPage mode="reset" />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="/dashboard" element={guard('/dashboard', <DashboardPage />)} />
        <Route path="/sessions" element={guard('/sessions', <SessionsPage />)} />
        <Route path="/requests" element={guard('/requests', <RequestsPage />)} />
        <Route path="/requests/:id" element={guard('/requests', <RequestDetailPage />)} />
        <Route path="/corrections" element={guard('/corrections', <CorrectionsPage />)} />
        <Route path="/reports" element={guard('/reports', <ReportsPage />)} />
        <Route path="/users" element={guard('/users', <UsersPage />)} />
        <Route path="/geofence" element={guard('/geofence', <GeofencePage />)} />
        <Route path="/audit-logs" element={guard('/audit-logs', <AuditLogPage />)} />
        <Route path="*" element={<Forbidden />} />
      </Route>
    </Routes>
  );
}
