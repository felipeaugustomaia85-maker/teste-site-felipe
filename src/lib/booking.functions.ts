import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  addDaysToDateString,
  buildSlots,
  isValidDateString,
  nowInShopTimeZone,
  normalizeTime,
  toMinutes,
  type Slot,
} from "./schedule";

export type Barber = {
  id: string;
  name: string;
  specialty: string;
  photo_url: string | null;
  active: boolean;
  sort_order: number;
};

export type Service = {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number | null;
  sort_order: number;
};

export type ShopSettings = {
  shop_name: string;
  open_time: string;
  close_time: string;
  slot_minutes: number;
  last_slot_is_start: boolean;
};

const DEFAULT_SETTINGS: ShopSettings = {
  shop_name: "Barbearia",
  open_time: "07:00",
  close_time: "18:00",
  slot_minutes: 30,
  last_slot_is_start: true,
};

async function loadSettings(): Promise<ShopSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("shop_settings")
    .select("shop_name, open_time, close_time, slot_minutes, last_slot_is_start")
    .limit(1)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    shop_name: data.shop_name,
    open_time: normalizeTime(data.open_time),
    close_time: normalizeTime(data.close_time),
    slot_minutes: data.slot_minutes,
    last_slot_is_start: data.last_slot_is_start,
  };
}

/** Dados públicos usados pela página inicial e pelo formulário. */
export const getBookingConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [settings, barbers, services] = await Promise.all([
    loadSettings(),
    supabaseAdmin
      .from("barbers")
      .select("id, name, specialty, photo_url, active, sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabaseAdmin
      .from("services")
      .select("id, name, description, duration_minutes, price, sort_order")
      .eq("active", true)
      .order("sort_order"),
  ]);

  return {
    settings,
    barbers: (barbers.data ?? []) as Barber[],
    services: (services.data ?? []) as Service[],
  };
});

/** Horários do barbeiro em uma data, já marcando ocupados e passados. */
export const getAvailability = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        barberId: z.string().uuid(),
        date: z.string().refine(isValidDateString, "Data inválida"),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ slots: Slot[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadSettings();

    const { data: taken, error } = await supabaseAdmin
      .from("appointments")
      .select("appointment_time")
      .eq("barber_id", data.barberId)
      .eq("appointment_date", data.date)
      .neq("status", "cancelado");
    if (error) throw new Error(error.message);

    const occupied = new Set((taken ?? []).map((row) => normalizeTime(row.appointment_time)));
    const now = nowInShopTimeZone();

    const slots = buildSlots({
      openTime: settings.open_time,
      closeTime: settings.close_time,
      slotMinutes: settings.slot_minutes,
      lastSlotIsStart: settings.last_slot_is_start,
    }).map<Slot>((time) => {
      if (occupied.has(time)) return { time, available: false, reason: "ocupado" };
      if (data.date < now.date) return { time, available: false, reason: "passado" };
      if (data.date === now.date && toMinutes(time) <= now.minutes) {
        return { time, available: false, reason: "passado" };
      }
      return { time, available: true };
    });

    return { slots };
  });

const createSchema = z.object({
  clientName: z.string().trim().min(2, "Informe o nome do cliente").max(80),
  barberId: z.string().uuid("Escolha um profissional"),
  serviceId: z.string().uuid().optional().nullable(),
  date: z.string().refine(isValidDateString, "Data inválida"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido"),
  notes: z.string().trim().max(300).optional().nullable(),
});

export type CreateAppointmentResult = {
  ok: boolean;
  error?: string;
  appointment?: {
    id: string;
    clientName: string;
    barberName: string;
    serviceName: string | null;
    date: string;
    time: string;
  };
};

export const createAppointment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }): Promise<CreateAppointmentResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadSettings();

    const slots = buildSlots({
      openTime: settings.open_time,
      closeTime: settings.close_time,
      slotMinutes: settings.slot_minutes,
      lastSlotIsStart: settings.last_slot_is_start,
    });
    if (!slots.includes(data.time)) {
      return { ok: false, error: "Esse horário está fora do funcionamento da barbearia." };
    }

    const now = nowInShopTimeZone();
    if (data.date < now.date || (data.date === now.date && toMinutes(data.time) <= now.minutes)) {
      return { ok: false, error: "Não é possível agendar em um horário que já passou." };
    }
    if (data.date > addDaysToDateString(now.date, 14)) {
      return { ok: false, error: "Só é possível agendar até 14 dias a partir de hoje." };
    }

    const { data: barber } = await supabaseAdmin
      .from("barbers")
      .select("id, name, active")
      .eq("id", data.barberId)
      .maybeSingle();
    if (!barber || !barber.active) {
      return { ok: false, error: "Profissional indisponível." };
    }

    let serviceName: string | null = null;
    let durationMinutes = settings.slot_minutes;
    if (data.serviceId) {
      const { data: service } = await supabaseAdmin
        .from("services")
        .select("name, duration_minutes")
        .eq("id", data.serviceId)
        .maybeSingle();
      if (service) {
        serviceName = service.name;
        durationMinutes = service.duration_minutes;
      }
    }

    // Verificação final de conflito + índice único no banco garantem exclusividade.
    const { data: conflict } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("barber_id", data.barberId)
      .eq("appointment_date", data.date)
      .eq("appointment_time", data.time)
      .neq("status", "cancelado")
      .maybeSingle();
    if (conflict) {
      return { ok: false, error: "Esse horário acabou de ser reservado. Escolha outro." };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("appointments")
      .insert({
        client_name: data.clientName,
        barber_id: data.barberId,
        service_id: data.serviceId ?? null,
        appointment_date: data.date,
        appointment_time: data.time,
        duration_minutes: durationMinutes,
        notes: data.notes ?? null,
        status: "confirmado",
      })
      .select("id, created_at")
      .single();

    if (error || !inserted) {
      if (error?.code === "23505" || error?.message?.includes("duplicate key")) {
        return { ok: false, error: "Esse horário acabou de ser reservado. Escolha outro." };
      }
      console.error("[booking] erro ao inserir agendamento", error);
      return { ok: false, error: "Não foi possível concluir o agendamento. Tente novamente." };
    }

    const { syncAppointmentToSheet, createCalendarEvent } = await import("./integrations.server");
    const payload = {
      id: inserted.id,
      clientName: data.clientName,
      barberName: barber.name,
      serviceName,
      date: data.date,
      time: data.time,
      startsAt: `${data.date}T${data.time}:00`,
      durationMinutes,
      status: "confirmado",
      notes: data.notes ?? null,
      createdAt: inserted.created_at,
    };
    const [sheetOk, calendarEventId] = await Promise.all([
      syncAppointmentToSheet(payload),
      createCalendarEvent(payload),
    ]);
    if (sheetOk || calendarEventId) {
      await supabaseAdmin
        .from("appointments")
        .update({ synced_to_sheet: sheetOk, calendar_event_id: calendarEventId })
        .eq("id", inserted.id);
    }

    return {
      ok: true,
      appointment: {
        id: inserted.id,
        clientName: data.clientName,
        barberName: barber.name,
        serviceName,
        date: data.date,
        time: data.time,
      },
    };
  });
