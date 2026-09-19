const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MINUS = "−";

export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "–";
  const text = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text;
}

export function formatSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "–";
  const text = formatNumber(Math.abs(value), digits);
  if (Number(text) === 0) return text;
  return value > 0 ? `+${text}` : `${MINUS}${text}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatPercent(share: number, digits = 0): string {
  return Number.isFinite(share) ? `${formatNumber(100 * share, digits)}%` : "–";
}

function parts(isoDate: string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const [year, month, day] = isoDate.split("-").map(Number);
  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

export function formatDate(isoDate: string): string {
  const { year, month, day } = parts(isoDate);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function formatShortDate(isoDate: string): string {
  const { month, day } = parts(isoDate);
  return `${MONTHS[month - 1]} ${day}`;
}

export function formatWeekdayDate(isoDate: string): string {
  const { weekday } = parts(isoDate);
  return `${WEEKDAYS[weekday]}, ${formatDate(isoDate)}`;
}

export function dateToTime(isoDate: string): number {
  const { year, month, day } = parts(isoDate);
  return Date.UTC(year, month - 1, day);
}

const YES_NO_FEATURES = new Set([
  "is_home",
  "is_back_to_back",
  "is_guard",
  "is_forward",
  "is_center",
  "starter_proxy_last_game",
]);

export function formatFeatureValue(
  featureKey: string,
  value: number | null,
): string {
  if (value === null) return "no data";
  if (YES_NO_FEATURES.has(featureKey)) return value >= 0.5 ? "yes" : "no";
  if (featureKey === "starter_proxy_rate_last_5") return formatPercent(value);
  if (
    featureKey.includes("usage_rate") ||
    featureKey.includes("true_shooting") ||
    featureKey.endsWith("_rate_last_10")
  ) {
    return `${formatNumber(value, 1)}%`;
  }
  if (featureKey.includes("per_minute")) return formatNumber(value, 2);
  if (Number.isInteger(value) && Math.abs(value) < 100)
    return formatNumber(value, 0);
  return formatNumber(value, 1);
}
