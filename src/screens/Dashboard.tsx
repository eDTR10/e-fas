import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  Bell,
  TrendingUp,
  ShoppingCart,
  Activity,
  Menu,
  X,
} from "lucide-react";
import viteLogo from "/vite.svg";
import { ModeToggle } from "../components/mode-toggle";

// --- Types ---
interface StatCard {
  title: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ReactNode;
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  to: string;
  active?: boolean;
}

// --- Stat Cards Data ---
const stats: StatCard[] = [
  {
    title: "Total Users",
    value: "12,480",
    change: "+8.2% this month",
    positive: true,
    icon: <Users className="w-5 h-5" />,
  },
  {
    title: "Total Revenue",
    value: "₱ 284,540",
    change: "+5.1% this month",
    positive: true,
    icon: <TrendingUp className="w-5 h-5" />,
  },
  {
    title: "New Orders",
    value: "1,345",
    change: "-2.3% this week",
    positive: false,
    icon: <ShoppingCart className="w-5 h-5" />,
  },
  {
    title: "Active Sessions",
    value: "318",
    change: "+12.5% today",
    positive: true,
    icon: <Activity className="w-5 h-5" />,
  },
];

// --- Recent activity ---
const recentActivity = [
  { user: "juan.dela.cruz", action: "Created a new document", time: "2 min ago" },
  { user: "maria.santos", action: "Updated profile settings", time: "15 min ago" },
  { user: "pedro.reyes", action: "Submitted request #1042", time: "32 min ago" },
  { user: "ana.garcia", action: "Logged in from new device", time: "1 hr ago" },
  { user: "carlo.lim", action: "Deleted draft #0091", time: "3 hr ago" },
];

// --- Sidebar Nav Items ---
const navItems: NavItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, to: "/dashboard", active: true },
  { label: "Users", icon: <Users className="w-4 h-4" />, to: "#" },
  { label: "Documents", icon: <FileText className="w-4 h-4" />, to: "#" },
  { label: "Settings", icon: <Settings className="w-4 h-4" />, to: "#" },
];

// --- Dashboard Component ---
const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-background flex">

      {/* ── Sidebar ─────────────────────────────────────────────────────────
           Breakpoint note (max-width config):
           md: ≤767px  |  slg: ≤1100px  |  lg: ≤1220px  |  sm: ≤639px

           Default (>767px): sidebar is in document flow (relative, always visible)
           md: (≤767px)    : sidebar becomes a fixed overlay drawer
      ────────────────────────────────────────────────────────────────────── */}

      {/* Mobile overlay – only renders when drawer is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          relative z-40 w-60 shrink-0 bg-card border-r border-border flex flex-col
          md:fixed md:top-0 md:left-0 md:h-full md:transition-transform md:duration-300
          ${sidebarOpen
            ? "md:translate-x-0"   /* drawer open on mobile */
            : "md:-translate-x-full" /* drawer closed on mobile */
          }
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <img src={viteLogo} alt="Logo" className="w-7 h-7" />
          <span className="text-foreground font-semibold text-sm tracking-wide uppercase">
            Admin Panel
          </span>
          {/* Close button – only visible on mobile (md:) */}
          <button
            className="ml-auto hidden md:flex text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${item.active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User info */}
        <div className="px-3 pb-5 border-t border-border pt-4">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold uppercase">
              Ad
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">Admin</p>
              <p className="text-xs text-muted-foreground truncate">admin@example.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────── */}
      {/*
        md: adds left margin to avoid being hidden behind the fixed sidebar
        when the sidebar is part of flex flow on large screens no margin is needed
      */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-0">

        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-background border-b border-border px-6 py-4 flex items-center justify-between slg:px-4 sm:px-3">
          <div className="flex items-center gap-3">
            {/* Hamburger – hidden on large screens, shown on mobile (md:) */}
            <button
              className="hidden md:flex text-muted-foreground hover:text-foreground p-1"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
              <p className="text-xs text-muted-foreground sm:hidden">
                Welcome back, Admin 👋
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <ModeToggle />
            <button className="relative p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 px-6 py-6 slg:px-4 sm:px-3 overflow-auto">

          {/* Welcome Banner */}
          <div className="rounded-2xl bg-primary/10 border border-primary/20 px-6 py-5 mb-6 flex items-center justify-between sm:flex-col sm:items-start sm:gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Good day, Admin!</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Here&apos;s what&apos;s happening in your system today.
              </p>
            </div>
            <span className="text-3xl sm:hidden">📊</span>
          </div>

          {/* Stat Cards
               lg: (≤1220px) → 2 columns
               sm: (≤639px)  → 1 column
          */}
          <div className="grid grid-cols-4 gap-4 mb-6 lg:grid-cols-2 sm:grid-cols-1">
            {stats.map((stat) => (
              <div
                key={stat.title}
                className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {stat.title}
                  </p>
                  <span className="p-2 rounded-lg bg-primary/10 text-primary">{stat.icon}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className={`text-xs font-medium ${stat.positive ? "text-green-500" : "text-destructive"
                  }`}>
                  {stat.change}
                </p>
              </div>
            ))}
          </div>

          {/* Two-column section
               lg: (≤1220px) → stacked single column
          */}
          <div className="grid grid-cols-[1fr_320px] gap-4 lg:grid-cols-1">

            {/* Recent Activity */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
              <div className="flex flex-col divide-y divide-border">
                {recentActivity.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-accent flex items-center justify-center text-xs font-bold uppercase text-muted-foreground">
                      {item.user.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.user}</p>
                      <p className="text-xs text-muted-foreground">{item.action}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground mb-1">Quick Actions</h3>
              {[
                { label: "Add New User", icon: <Users className="w-4 h-4" /> },
                { label: "Create Document", icon: <FileText className="w-4 h-4" /> },
                { label: "View Reports", icon: <TrendingUp className="w-4 h-4" /> },
                { label: "System Settings", icon: <Settings className="w-4 h-4" /> },
              ].map((action) => (
                <button
                  key={action.label}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg border border-border hover:bg-accent hover:border-primary/40 text-sm text-foreground transition-colors"
                >
                  <span className="text-primary">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
