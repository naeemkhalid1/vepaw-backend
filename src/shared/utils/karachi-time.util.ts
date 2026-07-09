// VePaw operates only in Pakistan. Appointment dates/times ("date", "timeSlot") are always
// Pakistan wall-clock values, but the host process's local clock is whatever timezone the
// deployment target defaults to (often UTC on cloud containers) — using Date.now()/new Date()
// getters directly silently shifts "today"/"now" by up to 5 hours near midnight. These helpers
// pin every such computation to Asia/Karachi regardless of host timezone.
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Karachi is UTC+5 year-round — no DST

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

interface KarachiParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function karachiParts(date: Date = new Date()): KarachiParts {
  const map = Object.fromEntries(PARTS_FORMATTER.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Some ICU implementations render midnight as "24" with hour12: false.
    hour: map.hour === '24' ? 0 : Number(map.hour),
    minute: Number(map.minute),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Current (or given) instant's calendar date in Asia/Karachi, as "YYYY-MM-DD". */
export function karachiDateStr(date: Date = new Date()): string {
  const { year, month, day } = karachiParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Current (or given) instant's wall-clock time in Asia/Karachi, as "HH:MM". */
export function karachiTimeStr(date: Date = new Date()): string {
  const { hour, minute } = karachiParts(date);
  return `${pad(hour)}:${pad(minute)}`;
}

/** The UTC instant corresponding to 00:00 Asia/Karachi on the given (or current) date. */
export function karachiStartOfDay(date: Date = new Date()): Date {
  const { year, month, day } = karachiParts(date);
  return new Date(Date.UTC(year, month - 1, day) - KARACHI_OFFSET_MS);
}

/** The UTC instant corresponding to 00:00 Asia/Karachi on the 1st of the given (or current) month. */
export function karachiStartOfMonth(date: Date = new Date()): Date {
  const { year, month } = karachiParts(date);
  return new Date(Date.UTC(year, month - 1, 1) - KARACHI_OFFSET_MS);
}

/**
 * Parses a stored "date" ("YYYY-MM-DD") + "timeSlot" ("HH:MM") pair — both Pakistan
 * wall-clock values — into the correct UTC instant. Do not use `new Date(\`${date}T${time}:00\`)`
 * directly: that string has no timezone designator, so JS parses it as *host-local* time,
 * which silently shifts by the host/Karachi offset difference.
 */
export function karachiDateTimeToUTC(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - KARACHI_OFFSET_MS);
}
