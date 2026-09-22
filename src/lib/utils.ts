import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from "sonner";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function showSuccess(title: string, description?: string) {
  toast.success(title, { description });
}

export function showError(title: string, description?: string) {
  toast.error(title, { description });
}

export function formatDateShort(date: Date | string | null, locale = "en-GB"): string {
  if (!date) return "";
  const parsed = date instanceof Date ? date : new Date(date);
  if (isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatRelativeTime(date: Date | string): string {
  const parsed = date instanceof Date ? date : new Date(date);
  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateShort(parsed);
}
