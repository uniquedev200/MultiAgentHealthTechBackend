import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import EmergenciesPage from "./pages/Emergencies";
import EmergencyDetailPage from "./pages/EmergencyDetail";
import ResourcesPage from "./pages/Resources";
import AuditLogPage from "./pages/AuditLog";
import SettingsPage from "./pages/Settings";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={token ? "/dashboard" : "/login"} replace />}
      />
      <Route
        path="/login"
        element={token ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="emergencies" element={<EmergenciesPage />} />
        <Route path="emergencies/:id" element={<EmergencyDetailPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
