import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Plans from "@/pages/Plans";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import Status from "@/pages/Status";
import { Toaster } from "@/components/ui/sonner";
import { LayoutDashboard, ListTodo, History as HistoryIcon, Settings as SettingsIcon, LogOut, Globe } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

function Sidebar() {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const links = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/plans", icon: ListTodo, label: t("nav.plans") },
    { to: "/history", icon: HistoryIcon, label: t("nav.history") },
    { to: "/settings", icon: SettingsIcon, label: t("nav.settings") },
  ];
  const toggleLang = () => {
    const next = i18n.language === "zh" ? "en" : "zh";
    i18n.changeLanguage(next);
  };
  return (
    <aside className="w-60 border-r bg-muted/30 flex flex-col">
      <div className="p-4 font-bold text-lg">TokenMeter</div>
      <nav className="flex-1 space-y-1 px-2">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`
          }>
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t">
        <div className="flex items-center justify-between px-1">
          <button onClick={toggleLang} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Globe className="h-3.5 w-3.5" />
            {i18n.language === "zh" ? "EN" : "中文"}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{user?.username}</span>
            <button onClick={logout} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Layout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6"><Outlet /></main>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/status" element={<Status />} />
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}
