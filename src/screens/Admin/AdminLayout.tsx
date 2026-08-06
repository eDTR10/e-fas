import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ScrollText,
  FileText,
  BookMarked,
  Settings,
  ClipboardList,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  User as UserIcon,
  ArrowRightLeft,
  Banknote,
  Receipt,
  ListChecks,
  Wallet,
  FileSpreadsheet,
} from "lucide-react";
import { ModeToggle } from "../../components/mode-toggle";
import { useAuth } from "../Auth/AuthContext";
import { getAllowedPaths, getAllowedGroups } from "../../lib/roleAccess";
import efasLogo from "../../assets/eFAS_Logo.png";

type NavLinkItem = { to: string; label: string; icon: React.ElementType };
type NavGroup = { title: string; items: NavLinkItem[] };
type NavEntry = { type: "standalone"; item: NavLinkItem } | { type: "divider" } | { type: "group"; group: NavGroup };

const NAV_STRUCTURE: NavEntry[] = [
  { type: "standalone", item: { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard } },
  { type: "divider" },
  {
    type: "group", group: {
      title: "Budget", items: [
        { to: "/admin/budget/raod", label: "RAOD", icon: ScrollText },
        { to: "/admin/budget/received-saro", label: "SARO Received", icon: FileText },
        { to: "/admin/budget/realignment", label: "Realignment", icon: ArrowRightLeft },
        { to: "/admin/cashier/disbursement-tracker", label: "Disbursement Tracker", icon: ListChecks },
      ]
    }
  },
  { type: "divider" },
  {
    type: "group", group: {
      title: "Accounting", items: [
        { to: "/admin/accounting/ntca", label: "NTCA Balance", icon: Banknote },
        { to: "/admin/accounting/received-ntca", label: "NTCA Received", icon: Receipt },
        { to: "/admin/cashier/disbursement-tracker", label: "Disbursement Tracker", icon: ListChecks },
      ]
    }
  },
  { type: "divider" },
  {
    type: "group", group: {
      title: "Cashier", items: [
        { to: "/admin/cashier/disbursement-tracker", label: "Disbursement Tracker", icon: ListChecks },
        { to: "/admin/cashier/custom-disbursement", label: "Custom Disbursement", icon: Wallet },
        { to: "/admin/cashier/cashiering-tracker", label: "Cashiering Tracker", icon: FileSpreadsheet },
      ]
    }
  },
  { type: "divider" },
  {
    type: "group", group: {
      title: "Report", items: [
        { to: "/admin/reports", label: "Reports", icon: BookMarked },
      ]
    }
  },
  { type: "divider" },
  {
    type: "group", group: {
      title: "Other Settings", items: [
        { to: "/admin/other-settings/user-management", label: "User Management", icon: Users },
        { to: "/admin/other-settings/audit-trail", label: "Audit Trail", icon: ClipboardList },
        { to: "/admin/other-settings/settings", label: "Settings", icon: Settings },
      ]
    }
  },
];

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const AdminLayout = ({ title, subtitle, children }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : "";
  const displayName = fullName || user?.email || "";
  const initials = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : "?";

  const allowedPaths = getAllowedPaths(user?.role);
  const allowedGroups = getAllowedGroups(user?.role);
  const visibleNav: NavEntry[] =
    allowedPaths === "all"
      ? NAV_STRUCTURE
      : NAV_STRUCTURE.reduce<NavEntry[]>((acc, entry) => {
          if (entry.type === "divider") {
            acc.push(entry);
            return acc;
          }
          if (entry.type === "standalone") {
            if (allowedPaths.includes(entry.item.to)) acc.push(entry);
            return acc;
          }
          if (allowedGroups !== "all" && !allowedGroups.includes(entry.group.title)) return acc;
          const items = entry.group.items.filter((it) => allowedPaths.includes(it.to));
          if (items.length > 0) acc.push({ type: "group", group: { ...entry.group, items } });
          return acc;
        }, []).filter((entry, i, arr) => {
          // Drop dividers that are leading, trailing, or back-to-back once
          // filtering may have removed everything around them.
          if (entry.type !== "divider") return true;
          const prev = arr[i - 1];
          if (!prev || prev.type === "divider") return false;
          const isLast = i === arr.length - 1;
          if (isLast) return false;
          return true;
        });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="relative flex items-center justify-center bg-primary border-b border-border/30 px-4 py-4" style={{ minHeight: 64 }}>
        <img
          src={efasLogo}
          alt="Logo"
          className={`object-contain shrink-0 transition-all duration-300 ${collapsed && !mobile ? "h-10 w-10" : "h-12 w-auto"}`}
        />
        {!mobile && (
          <button
            onClick={() => setCollapsed((p) => !p)}
            className="absolute right-3 text-white/60 hover:text-white transition"
          >
            <ChevronRight size={16} className={`transition-transform ${collapsed ? "rotate-0" : "rotate-180"}`} />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col py-3 px-2 overflow-y-auto gap-0.5">
        {visibleNav.map((entry, i) => {
          if (entry.type === "divider") {
            return <div key={`div-${i}`} className="my-2 border-t border-border/50" />;
          }

          const renderLink = ({ to, label, icon: Icon }: NavLinkItem) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all
                ${isActive
                  ? "bg-primary text-primary-foreground font-medium shadow"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }
                ${collapsed && !mobile ? "justify-center px-2" : ""}`
              }
            >
              <Icon size={18} className="min-w-[18px]" />
              {(!collapsed || mobile) && <span>{label}</span>}
            </NavLink>
          );

          if (entry.type === "standalone") {
            return renderLink(entry.item);
          }

          return (
            <div key={`grp-${i}`} className="flex flex-col gap-0.5">
              {(!collapsed || mobile) && (
                <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 select-none">
                  {entry.group.title}
                </p>
              )}
              {entry.group.items.map(renderLink)}
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-border px-2 py-4 flex flex-col gap-2">
        {(!collapsed || mobile) && displayName && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{displayName}</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition ${collapsed && !mobile ? "justify-center px-2" : ""}`}
        >
          <LogOut size={18} className="min-w-[18px]" />
          {(!collapsed || mobile) && <span>Log Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={`flex md:hidden flex-col border-r border-border bg-card transition-all duration-300 ${collapsed ? "w-[64px]" : "w-[240px]"}`}
        style={{ minWidth: collapsed ? 64 : 240 }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 hidden md:block"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border hidden md:flex flex-col transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <SidebarContent mobile />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="hidden md:flex text-muted-foreground hover:text-foreground transition"
              onClick={() => setMobileOpen((p) => !p)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground sm:hidden">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ModeToggle />

            {/* Avatar + dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((p) => !p)}
                className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              >
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold select-none shadow">
                  {initials}
                </div>
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-11 z-50 w-56 rounded-xl bg-card border border-border shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setProfileOpen(false); navigate("/admin/profile"); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition"
                    >
                      <UserIcon size={15} className="text-muted-foreground" />
                      Profile
                    </button>
                    <button
                      onClick={() => { setProfileOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition"
                    >
                      <LogOut size={15} />
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-5 slg:px-4 sm:px-3">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
