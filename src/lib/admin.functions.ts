import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidDateString, normalizeTime } from "./schedule";

type SupabaseUserClient = {
  from: (table: string) => any;
};

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as SupabaseUserClient;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito aos administradores.");
}

export type AdminAppointment = {
  id: string;
  client_name: string;
  barber_id: string;
  barber_name: string;
  service_name: string | null;
  appointment_date: string;
  appointment_time: string;
  status: string;
  notes: string | null;
  created_at: string;
};

export const checkAdminAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ code: z.string().max(200).optional().nullable() }).parse(data ?? {}),
  )
  .handler(async ({ data: input, context }) => {
    const supabase = context.supabase as SupabaseUserClient;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    const expected = (process.env["ADMIN_ACCESS_CODE"] ?? "").trim();
    const given = (input.code ?? "").trim();
    const codeOk = Boolean(expected) && given === expected;
    return { isAdmin: Boolean(data), codeOk, codeConfigured: Boolean(expected) };
  });

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        date: z.string().refine(isValidDateString).optional().nullable(),
        monthOf: z.string().refine(isValidDateString).optional().nullable(),
        barberId: z.string().uuid().optional().nullable(),
        status: z.enum(["confirmado", "cancelado", "concluido"]).optional().nullable(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ appointments: AdminAppointment[] }> => {
    await assertAdmin(context);
    const supabase = context.supabase as SupabaseUserClient;

    let query = supabase
      .from("appointments")
      .select(
        "id, client_name, barber_id, appointment_date, appointment_time, status, notes, created_at, barbers(name), services(name)",
      )
      .order("appointment_date")
      .order("appointment_time");

    if (data.date) query = query.eq("appointment_date", data.date);
    if (data.monthOf) {
      const [y, m] = data.monthOf.split("-").map(Number);
      const first = `${data.monthOf.slice(0, 7)}-01`;
      const nextMonth = new Date(Date.UTC(y ?? 1970, m ?? 1, 1));
      const last = nextMonth.toISOString().slice(0, 10);
      query = query.gte("appointment_date", first).lt("appointment_date", last);
    }
    if (data.barberId) query = query.eq("barber_id", data.barberId);
    if (data.status) query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return {
      appointments: (rows ?? []).map((row: any) => ({
        id: row.id,
        client_name: row.client_name,
        barber_id: row.barber_id,
        barber_name: row.barbers?.name ?? "—",
        service_name: row.services?.name ?? null,
        appointment_date: row.appointment_date,
        appointment_time: normalizeTime(row.appointment_time),
        status: row.status,
        notes: row.notes,
        created_at: row.created_at,
      })),
    };
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["confirmado", "cancelado", "concluido"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as SupabaseUserClient;
    const { error } = await supabase
      .from("appointments")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.status === "cancelado") {
      const { cancelCalendarEvent } = await import("./integrations.server");
      await cancelCalendarEvent({
        id: data.id,
        clientName: "",
        barberName: "",
        serviceName: null,
        date: "",
        time: "",
        startsAt: null,
        durationMinutes: 0,
        status: "cancelado",
        notes: null,
        createdAt: "",
      });
    }
    return { ok: true };
  });

export const listBarbersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as SupabaseUserClient;
    const { data, error } = await supabase
      .from("barbers")
      .select("id, name, specialty, photo_url, active, sort_order")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { barbers: data ?? [] };
  });

export const saveBarber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional().nullable(),
        name: z.string().trim().min(2).max(60),
        specialty: z.string().trim().max(120).default(""),
        active: z.boolean().default(true),
        sort_order: z.number().int().min(0).max(999).default(0),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as SupabaseUserClient;
    const payload = {
      name: data.name,
      specialty: data.specialty,
      active: data.active,
      sort_order: data.sort_order,
    };
    const { error } = data.id
      ? await supabase.from("barbers").update(payload).eq("id", data.id)
      : await supabase.from("barbers").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as SupabaseUserClient;
    const { data, error } = await supabase
      .from("shop_settings")
      .select("id, shop_name, open_time, close_time, slot_minutes, last_slot_is_start")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      settings: data
        ? {
            ...data,
            open_time: normalizeTime(data.open_time),
            close_time: normalizeTime(data.close_time),
          }
        : null,
    };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        shop_name: z.string().trim().min(2).max(60),
        open_time: z.string().regex(/^\d{2}:\d{2}$/),
        close_time: z.string().regex(/^\d{2}:\d{2}$/),
        slot_minutes: z.number().int().min(10).max(120),
        last_slot_is_start: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabase = context.supabase as SupabaseUserClient;
    const { id, ...payload } = data;
    const { error } = await supabase.from("shop_settings").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
