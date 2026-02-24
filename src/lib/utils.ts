export function asStringArray(input: unknown): string[] {
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function toJsonStringArray(values: string[]): string {
  return JSON.stringify(values);
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isOlderThanDays(date: Date | null | undefined, days: number): boolean {
  if (!date) {
    return false;
  }

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  return date < threshold;
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
