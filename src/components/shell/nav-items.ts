import {
  CalendarCheck,
  ChartColumn,
  FileText,
  ReceiptIndianRupee,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// The main nav has exactly these five items (docs/UX_PRINCIPLES.md, rule 1).
// Settings lives behind the profile icon, never here.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: CalendarCheck },
  { href: "/leases", label: "Leases", icon: FileText },
  { href: "/tenants", label: "Tenants", icon: UsersRound },
  { href: "/billing", label: "Billing", icon: ReceiptIndianRupee },
  { href: "/reports", label: "Reports", icon: ChartColumn },
];

export function isActive(href: string, pathname: string | null): boolean {
  if (pathname === null) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
