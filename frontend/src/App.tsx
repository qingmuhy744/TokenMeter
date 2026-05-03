import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback } from "react";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import DashboardMatrix from "@/pages/DashboardMatrix";
import Plans from "@/pages/Plans";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import Status from "@/pages/Status";
import PublicHistory from "@/pages/PublicHistory";
import PlanDetail from "@/pages/PlanDetail";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LayoutDashboard, Table as TableIcon, ListTodo, History as HistoryIcon, Settings as SettingsIcon, LogOut, Globe, Menu, X } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  const links = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/matrix", icon: TableIcon, label: "Matrix" },
    { to: "/plans", icon: ListTodo, label: t("nav.plans") },
    { to: "/history", icon: HistoryIcon, label: t("nav.history") },
    { to: "/settings", icon: SettingsIcon, label: t("nav.settings") },
    { to: "/status", icon: Globe, label: t("status.title"), external: true },
  ];
  const toggleLang = () => {
    const next = i18n.language === "zh" ? "en" : "zh";
    i18n.changeLanguage(next);
  };
  return (
    <>
      <div 
        className={cn(
          "fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-60 border-r bg-background flex flex-col transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:bg-muted/30",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 font-bold text-lg flex items-center justify-between">
          <span>TokenMeter</span>
          <button onClick={onClose} className="md:hidden p-1 hover:bg-muted rounded-md">
            <X className="h-5 w-5" />
          </button>
</div>
        <nav className="flex-1 space-y-1 px-2">
          {links.map(({ to, icon: Icon, label, external }) => (
            external ? (
              <a key={to} href={to} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted text-muted-foreground hover:text-foreground">
                <Icon className="h-4 w-4" />
                {label}
              </a>
            ) : (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`
              }>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            )
          ))}
        </nav>
        <div className="p-3 border-t">
          <div className="flex items-center justify-between px-1">
            <button onClick={toggleLang} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Globe className="h-3.5 w-3.5" />
              {i18n.language === "zh" ? "EN" : "中文"}
            </button>
            <button onClick={logout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="h-3.5 w-3.5" />
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </>
    );
  }
}

function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center px-4 md:hidden">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 hover:bg-muted rounded-md"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-2 font-bold">TokenMeter</span>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
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
        <TooltipProvider>
        <Routes>
          <Route path="/status" element={<Status />} />
          <Route path="/public/history" element={<PublicHistory />} />
          <Route path="/public/plan/:id" element={<PlanDetail />} />
          <Route path="/plan/:id" element={<PlanDetail />} />
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/matrix" element={<DashboardMatrix />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
        <Toaster />
        </TooltipProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}