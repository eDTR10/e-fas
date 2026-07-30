import React from 'react'
import ReactDOM from 'react-dom/client'
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import App from './App.tsx'
import './index.css'
import { Suspense, lazy } from "react";

import NotFound from "./screens/notFound";
import Loader from './components/loader/loader.tsx';
import { AuthProvider } from './screens/Auth/AuthContext.tsx';
import ProtectedRoute from './screens/Auth/ProtectedRoute.tsx';
import { ThemeProvider } from './components/theme-provider.tsx';

const Page1 = lazy(() =>
  wait(1300).then(() => import("./screens/page1.tsx"))
);

const Page2 = lazy(() =>
  wait(1300).then(() => import("./screens/page2.tsx"))
);

const Login = lazy(() => import("./screens/Auth/login.tsx"));
const Register = lazy(() => import("./screens/Auth/Register.tsx"));

// ── Admin pages ───────────────────────────────────────────────────────────
const AdminDashboard  = lazy(() => import("./screens/Admin/Dashboard.tsx"));
const AdminUsers      = lazy(() => import("./screens/Admin/UserPage.tsx"));
const AdminDocuments  = lazy(() => import("./screens/Admin/DocumentPage.tsx"));
const AdminSettings   = lazy(() => import("./screens/Admin/Setting.tsx"));
const AdminProfile    = lazy(() => import("./screens/Admin/Profile.tsx"));
const AdminPlaceholder = lazy(() => import("./screens/Admin/Placeholder.tsx"));
const AdminReceivedSaro = lazy(() => import("./screens/Admin/ReceivedSaroPage.tsx"));
const AdminNtca = lazy(() => import("./screens/Admin/NtcaPage.tsx"));
const AdminRaod = lazy(() => import("./screens/Admin/RaodPage.tsx"));
const AdminCustomDisbursement = lazy(() => import("./screens/Admin/CustomDisbursementPage.tsx"));
const AdminDisbursementTracker = lazy(() => import("./screens/Admin/DisbursementTrackerPage.tsx"));
const AdminNtcaBalance = lazy(() => import("./screens/Admin/NtcaBalancePage.tsx"));
const AdminAuditTrail = lazy(() => import("./screens/Admin/AuditTrailPage.tsx"));
const AdminReports = lazy(() => import("./screens/Admin/ReportsPage.tsx"));
const AdminCashieringTracker = lazy(() => import("./screens/Admin/CashieringTrackerPage.tsx"));

// Legacy route kept for old links
const LegacyDashboard = lazy(() => import("./screens/Dashboard.tsx"));

const withSuspense = (el: JSX.Element) => <Suspense fallback={<Loader />}>{el}</Suspense>;
const withAuth = (el: JSX.Element) => (
  <ProtectedRoute>
    <Suspense fallback={<Loader />}>{el}</Suspense>
  </ProtectedRoute>
);

const router = createBrowserRouter([
  // ── Auth pages (no navbar) ────────────────────────────
  {
    path: "/login",
    element: withSuspense(<Login />),
  },
  {
    path: "/register",
    element: withSuspense(<Register />),
  },

  // ── Admin pages (no public navbar) ────────────────────
  {
    path: "/admin/dashboard",
    element: withAuth(<AdminDashboard />),
  },
  {
    path: "/admin/budget/raod",
    element: withAuth(<AdminRaod />),
  },
  {
    path: "/admin/budget/received-saro",
    element: withAuth(<AdminReceivedSaro />),
  },
  {
    path: "/admin/budget/realignment",
    element: withAuth(<AdminPlaceholder title="Realignment" />),
  },
  {
    path: "/admin/accounting/ntca",
    element: withAuth(<AdminNtcaBalance />),
  },
  {
    path: "/admin/accounting/received-ntca",
    element: withAuth(<AdminNtca />),
  },
  {
    path: "/admin/cashier/disbursement-tracker",
    element: withAuth(<AdminDisbursementTracker />),
  },
  {
    path: "/admin/cashier/custom-disbursement",
    element: withAuth(<AdminCustomDisbursement />),
  },
  {
    path: "/admin/cashier/cashiering-tracker",
    element: withAuth(<AdminCashieringTracker />),
  },
  {
    path: "/admin/reports",
    element: withAuth(<AdminReports />),
  },
  {
    path: "/admin/other-settings/user-management",
    element: withAuth(<AdminUsers />),
  },
  {
    path: "/admin/other-settings/audit-trail",
    element: withAuth(<AdminAuditTrail />),
  },
  {
    path: "/admin/other-settings/settings",
    element: withAuth(<AdminSettings />),
  },
  {
    path: "/admin/profile",
    element: withAuth(<AdminProfile />),
  },
  {
    path: "/admin/documents",
    element: withAuth(<AdminDocuments />),
  },

  // ── Legacy dashboard redirect ──────────────────────────
  {
    path: "/dashboard",
    element: <Navigate to="/admin/dashboard" replace />,
  },

  // ── Legacy standalone dashboard (kept as fallback) ────
  {
    path: "/dashboard-old",
    element: withSuspense(<LegacyDashboard />),
  },

  // ── Main app with navbar ──────────────────────────────
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "/",
        element: <Navigate to="/admin/dashboard" />,
      },
      {
        path: "/page1",
        element: (
          <Suspense fallback={<Loader />}>
            <Page1 />
          </Suspense>
        ),
      },
      {
        path: "/page2",
        element: (
          <Suspense fallback={<Loader />}>
            <Page2 />
          </Suspense>
        ),
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
]);

function wait(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
