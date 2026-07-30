// Role-based access control for the admin area. This mirrors the sidebar
// structure in AdminLayout.tsx — every "to" used there should also appear
// here for any role that's meant to see it.
//
// Roles come from the backend's UserAccount.role field (accounts app):
// admin / budget / accounting / cashier / provincial_officer / user.
//
// A role mapped to "all" (or missing from ROLE_ALLOWED_PATHS entirely) sees
// the full admin area unchanged — this keeps admin, provincial_officer, and
// plain "user" accounts working exactly as before, since only budget,
// accounting, and cashier have a defined restricted menu today.
export const ROLE_ALLOWED_PATHS: Record<string, string[] | "all"> = {
  admin: "all",

  budget: [
    "/admin/dashboard",
    "/admin/budget/raod",
    "/admin/budget/received-saro",
    "/admin/budget/realignment",
    "/admin/cashier/disbursement-tracker",
    "/admin/other-settings/audit-trail",
    "/admin/other-settings/settings",
    "/admin/profile",
  ],

  accounting: [
    "/admin/dashboard",
    "/admin/accounting/ntca",
    "/admin/accounting/received-ntca",
    "/admin/cashier/disbursement-tracker",
    "/admin/other-settings/audit-trail",
    "/admin/other-settings/settings",
    "/admin/profile",
  ],

  cashier: [
    "/admin/dashboard",
    "/admin/cashier/disbursement-tracker",
    "/admin/cashier/custom-disbursement",
    "/admin/cashier/cashiering-tracker",
    "/admin/reports",
    "/admin/other-settings/audit-trail",
    "/admin/other-settings/settings",
    "/admin/profile",
  ],
};

// A handful of routes (Disbursement Tracker, most notably) are deliberately
// reused across more than one sidebar group in AdminLayout.tsx's
// NAV_STRUCTURE — e.g. Budget, Accounting, and Cashier each link to the same
// "/admin/cashier/disbursement-tracker". Path membership alone can't tell
// those groups apart, so a role also needs to declare which *group titles*
// it's allowed to see; a group not listed here is dropped entirely for that
// role even if one of its items' paths happens to be in ROLE_ALLOWED_PATHS.
export const ROLE_ALLOWED_GROUPS: Record<string, string[] | "all"> = {
  admin: "all",
  budget: ["Budget", "Other Settings"],
  accounting: ["Accounting", "Other Settings"],
  cashier: ["Cashier", "Report", "Other Settings"],
};

export const getAllowedPaths = (role?: string | null): string[] | "all" => {
  if (!role) return "all";
  return ROLE_ALLOWED_PATHS[role] ?? "all";
};

export const getAllowedGroups = (role?: string | null): string[] | "all" => {
  if (!role) return "all";
  return ROLE_ALLOWED_GROUPS[role] ?? "all";
};

export const isPathAllowedForRole = (role: string | undefined | null, pathname: string): boolean => {
  const allowed = getAllowedPaths(role);
  if (allowed === "all") return true;
  return allowed.includes(pathname);
};
