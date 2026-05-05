import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
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
import {
  LayoutDashboard,
  Table as TableIcon,
  ListTodo,
  History as HistoryIcon,
  Settings as SettingsIcon,
  LogOut,
  Globe,
  Menu,
  X,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const location = useLocation();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [themeMenuOpen]);

  const links = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/matrix", icon: TableIcon, label: t("nav.matrix") },
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
        "fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-5 flex items-center justify-between border-b border-sidebar-border/50">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_12px_color-mix(in_oklch,var(--color-primary)_30%,transparent)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <span className="font-heading text-sm font-bold tracking-tight text-sidebar-foreground">TokenMeter</span>
          </div>
          <button onClick={onClose} className="md:hidden size-7 flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground rounded-lg hover:bg-sidebar-accent transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {links.map(({ to, icon: Icon, label, external }) => (
            external ? (
              <a
                key={to}
                href={to}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-150"
              >
                <span className="flex items-center justify-center size-4">
                  <Icon className="size-4" />
                </span>
                <span className="flex-1">{label}</span>
                <ChevronRight className="size-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150" />
              </a>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 relative ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold shadow-sm"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                    )}
                    <span className={`flex items-center justify-center size-4 transition-colors ${isActive ? "text-primary" : ""}`}>
                      <Icon className="size-4" />
                    </span>
                    <span className="flex-1">{label}</span>
                    {isActive && (
                      <span className="size-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                    )}
                  </>
                )}
              </NavLink>
            )
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border/50 mx-3">
          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-sidebar-accent transition-colors md:hidden">
            <button
              onClick={toggleLang}
              className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            >
              <Globe className="size-3" />
              {i18n.language === "zh" ? "EN" : "中文"}
            </button>
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
              >
                {theme === 'system' ? (
                  resolvedTheme === 'dark' ? <Sun className="size-3" /> : <Moon className="size-3" />
                ) : theme === 'dark' ? (
                  <Sun className="size-3" />
                ) : (
                  <Moon className="size-3" />
                )}
                {theme === 'system' ? t('theme.auto') : theme === 'dark' ? t('theme.light') : t('theme.dark')}
              </button>
              {themeMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-28 bg-sidebar border border-sidebar-border rounded-lg shadow-lg overflow-hidden z-50 md:top-full md:left-0 md:mt-1 md:bottom-auto">
                  <button
                    onClick={() => { setTheme('system'); setThemeMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      theme === 'system'
                        ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5"
                    )}
                  >
                    <Monitor className="size-3" />
                    {t('theme.auto')}
                  </button>
                  <button
                    onClick={() => { setTheme('light'); setThemeMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      theme === 'light'
                        ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5"
                    )}
                  >
                    <Moon className="size-3" />
                    {t('theme.light')}
                  </button>
                  <button
                    onClick={() => { setTheme('dark'); setThemeMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      theme === 'dark'
                        ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5"
                    )}
                  >
                    <Sun className="size-3" />
                    {t('theme.dark')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between px-2 py-2 mt-1 border-t border-sidebar-border/30 pt-2 md:hidden">
            <span className="text-xs font-medium text-sidebar-foreground/60">{user?.username}</span>
            <button
              onClick={logout}
              className="size-6 flex items-center justify-center rounded-lg text-sidebar-foreground/40 hover:text-red hover:bg-red/10 transition-colors"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
          <div className="hidden md:flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-sidebar-accent transition-colors">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleLang}
                className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
              >
                <Globe className="size-3" />
                {i18n.language === "zh" ? "EN" : "中文"}
              </button>
              <div className="relative group">
                <button
                  className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                >
                  {theme === 'system' ? (
                    resolvedTheme === 'dark' ? <Sun className="size-3" /> : <Moon className="size-3" />
                  ) : theme === 'dark' ? (
                    <Sun className="size-3" />
                  ) : (
                    <Moon className="size-3" />
                  )}
                  {theme === 'system' ? t('theme.auto') : theme === 'dark' ? t('theme.light') : t('theme.dark')}
                </button>
                <div className="absolute bottom-full left-0 mb-1 w-28 bg-sidebar border border-sidebar-border rounded-lg shadow-lg overflow-hidden hidden group-hover:block">
                  <button
                    onClick={() => setTheme('system')}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      theme === 'system'
                        ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5"
                    )}
                  >
                    <Monitor className="size-3" />
                    {t('theme.auto')}
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      theme === 'light'
                        ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5"
                    )}
                  >
                    <Moon className="size-3" />
                    {t('theme.light')}
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      theme === 'dark'
                        ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5"
                    )}
                  >
                    <Sun className="size-3" />
                    {t('theme.dark')}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-sidebar-foreground/60">{user?.username}</span>
              <button
                onClick={logout}
                className="size-6 flex items-center justify-center rounded-lg text-sidebar-foreground/40 hover:text-red hover:bg-red/10 transition-colors"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
        </aside>
      </>
    );
  }

function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="md:hidden h-14 flex items-center px-4 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-40">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="size-8 flex items-center justify-center text-foreground/60 hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="size-5" />
          </button>
          <div className="ml-3 font-heading text-sm font-bold tracking-tight text-foreground/90">TokenMeter</div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="size-8 rounded-lg bg-primary/20 border border-primary/30 animate-pulse flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <span className="text-sm text-muted-foreground font-medium font-heading">Loading...</span>
      </div>
    </div>
  );
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