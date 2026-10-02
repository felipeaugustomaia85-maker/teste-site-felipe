export const TIME_ZONE = "America/Sao_Paulo";

export type Slot = {
  time: string;
  available: boolean;
  reason?: "ocupado" | "passado";
};

export function toMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function toTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Normaliza "07:00:00" -> "07:00" */
export function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

export function buildSlots(options: {
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  lastSlotIsStart: boolean;
}): string[] {
  const { openTime, closeTime, slotMinutes, lastSlotIsStart } = options;
  const start = toMinutes(normalizeTime(openTime));
  const end = toMinutes(normalizeTime(closeTime));
  const step = slotMinutes > 0 ? slotMinutes : 30;
  const limit = lastSlotIsStart ? end : end - step;
  const slots: string[] = [];
  for (let t = start; t <= limit; t += step) slots.push(toTimeLabel(t));
  return slots;
}

/** Data (YYYY-MM-DD) e minutos do dia agora, no fuso da barbearia. */
export function nowInShopTimeZone(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(hour) * 60 + Number(get("minute")),
  };
}

export function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromDateString(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Soma dias a uma data YYYY-MM-DD, sem depender do fuso. */
export function addDaysToDateString(value: string, days: number): string {
  const date = fromDateString(value);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export function formatDatePtBr(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(fromDateString(value));
}

export const STATUS_LABELS: Record<string, string> = {
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  concluido: "Concluído",
};
