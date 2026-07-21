import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number, currency: string = "RON"): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Romanian display label for a salon team member's role. The authoritative role
 * lives in salon_members.role; barbers.role defaults to 'owner' and is stale.
 */
export function barberRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case "owner":
      return "Proprietar";
    case "manager":
      return "Manager";
    case "receptionist":
      return "Recepție";
    case "trainee":
      return "Ucenic";
    default:
      return "Frizer";
  }
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function timeAgo(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "acum";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}z`;
  return then.toLocaleDateString("ro-RO");
}
