/**
 * Integrações externas (planilha e calendário).
 *
 * Tudo acontece no servidor: nenhuma chave de API vai para o frontend.
 * Configure os segredos abaixo para ativar cada integração:
 *  - SHEETS_WEBHOOK_URL   -> endpoint (Apps Script / Make / Zapier / API) que grava a linha na planilha
 *  - CALENDAR_WEBHOOK_URL -> endpoint que cria o evento na agenda (Google Calendar, etc.)
 *  - INTEGRATIONS_TOKEN   -> token opcional enviado no header Authorization
 *
 * Enquanto os segredos não existirem, as funções apenas registram o evento no log
 * e o agendamento continua funcionando normalmente.
 */

export type AppointmentPayload = {
  id: string;
  clientName: string;
  barberName: string;
  serviceName: string | null;
  date: string;
  time: string;
  startsAt: string | null;
  durationMinutes: number;
  status: string;
  notes: string | null;
  createdAt: string;
};

async function post(url: string, body: unknown): Promise<boolean> {
  const token = process.env["INTEGRATIONS_TOKEN"];
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(`[integrations] ${url} respondeu ${response.status}: ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[integrations] falha ao enviar", error);
    return false;
  }
}

/** Colunas da planilha, na ordem esperada. */
export function toSheetRow(appointment: AppointmentPayload) {
  return {
    id_agendamento: appointment.id,
    cliente: appointment.clientName,
    barbeiro: appointment.barberName,
    servico: appointment.serviceName ?? "",
    data: appointment.date,
    horario: appointment.time,
    data_horario_completo: appointment.startsAt ?? `${appointment.date}T${appointment.time}`,
    status: appointment.status,
    criado_em: appointment.createdAt,
  };
}

export async function syncAppointmentToSheet(appointment: AppointmentPayload): Promise<boolean> {
  const url = process.env["SHEETS_WEBHOOK_URL"];
  const row = toSheetRow(appointment);
  if (!url) {
    console.info("[integrations] SHEETS_WEBHOOK_URL ausente; linha pendente:", row);
    return false;
  }
  return post(url, { type: "appointment.created", row });
}

export async function createCalendarEvent(
  appointment: AppointmentPayload,
): Promise<string | null> {
  const url = process.env["CALENDAR_WEBHOOK_URL"];
  const event = {
    summary: `${appointment.clientName} — ${appointment.barberName}`,
    description: [
      `Cliente: ${appointment.clientName}`,
      `Barbeiro: ${appointment.barberName}`,
      appointment.serviceName ? `Serviço: ${appointment.serviceName}` : null,
      appointment.notes ? `Observação: ${appointment.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    date: appointment.date,
    time: appointment.time,
    durationMinutes: appointment.durationMinutes,
    timeZone: "America/Sao_Paulo",
  };
  if (!url) {
    console.info("[integrations] CALENDAR_WEBHOOK_URL ausente; evento pendente:", event);
    return null;
  }
  const ok = await post(url, { type: "appointment.created", event });
  return ok ? `pending-${appointment.id}` : null;
}

export async function cancelCalendarEvent(appointment: AppointmentPayload): Promise<boolean> {
  const url = process.env["CALENDAR_WEBHOOK_URL"];
  if (!url) {
    console.info("[integrations] CALENDAR_WEBHOOK_URL ausente; cancelamento pendente:", appointment.id);
    return false;
  }
  return post(url, { type: "appointment.cancelled", id: appointment.id });
}
