export const USER_ID = process.env.USER_ID ?? "gregorio";
export const USER_TIMEZONE = process.env.USER_TIMEZONE ?? "America/Sao_Paulo";

// Lista de UIDs autorizados. Aceita CSV em ALLOWED_FIREBASE_UIDS (plural) ou
// um único valor em ALLOWED_FIREBASE_UID (legado). Lista vazia = aberto (apenas dev).
export const ALLOWED_FIREBASE_UIDS: readonly string[] = (
  process.env.ALLOWED_FIREBASE_UIDS ??
  process.env.ALLOWED_FIREBASE_UID ??
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

export function isUidAllowed(uid: string | undefined | null): boolean {
  if (!uid) return false;
  if (ALLOWED_FIREBASE_UIDS.length === 0) return true; // dev: gate aberto
  return ALLOWED_FIREBASE_UIDS.includes(uid);
}

export function localDateKey(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}
