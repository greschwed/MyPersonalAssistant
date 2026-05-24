export const USER_ID = process.env.USER_ID ?? "gregorio";
export const USER_TIMEZONE = process.env.USER_TIMEZONE ?? "America/Sao_Paulo";

export const ALLOWED_FIREBASE_UID = process.env.ALLOWED_FIREBASE_UID ?? "";

export function localDateKey(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}
