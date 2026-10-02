import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar as CalendarIcon, Check, Clock, Scissors, User } from "lucide-react";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createAppointment,
  getAvailability,
  type Barber,
  type Service,
  type ShopSettings,
} from "@/lib/booking.functions";
import {
  addDaysToDateString,
  formatDatePtBr,
  fromDateString,
  nowInShopTimeZone,
  toDateString,
  type Slot,
} from "@/lib/schedule";

type Props = {
  barbers: Barber[];
  services: Service[];
  settings: ShopSettings;
};

type Confirmation = {
  clientName: string;
  barberName: string;
  serviceName: string | null;
  date: string;
  time: string;
};

export function BookingForm({ barbers, services }: Props) {
  const today = nowInShopTimeZone().date;
  const [clientName, setClientName] = useState("");
  const [barberId, setBarberId] = useState<string | null>(barbers[0]?.id ?? null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(today);
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const fetchAvailability = useServerFn(getAvailability);
  const submitAppointment = useServerFn(createAppointment);
  const queryClient = useQueryClient();

  const availabilityKey = ["availability", barberId, date] as const;
  const availability = useQuery({
    queryKey: availabilityKey,
    queryFn: () => fetchAvailability({ data: { barberId: barberId!, date } }),
    enabled: Boolean(barberId),
  });

  const slots: Slot[] = availability.data?.slots ?? [];
  const selectedBarber = barbers.find((b) => b.id === barberId) ?? null;
  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  const canConfirm = Boolean(clientName.trim().length >= 2 && barberId && date && time);

  const mutation = useMutation({
    mutationFn: () =>
      submitAppointment({
        data: {
          clientName: clientName.trim(),
          barberId: barberId!,
          serviceId: serviceId,
          date,
          time: time!,
          notes: notes.trim() ? notes.trim() : null,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok || !result.appointment) {
        setFormError(result.error ?? "Não foi possível agendar.");
        void queryClient.invalidateQueries({ queryKey: availabilityKey });
        setTime(null);
        return;
      }
      setConfirmation({
        clientName: result.appointment.clientName,
        barberName: result.appointment.barberName,
        serviceName: result.appointment.serviceName,
        date: result.appointment.date,
        time: result.appointment.time,
      });
      setFormError(null);
      setTime(null);
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: () => setFormError("Não foi possível agendar. Tente novamente."),
  });

  const minDate = useMemo(() => fromDateString(today), [today]);
  const maxDate = useMemo(
    () => fromDateString(addDaysToDateString(today, 14)),
    [today],
  );

  if (confirmation) {
    return (
      <div className="panel animate-rise p-8 text-center sm:p-12">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
          <Check className="h-7 w-7 text-gold" />
        </div>
        <h3 className="mt-6 font-display text-3xl">Agendamento confirmado com sucesso!</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Chegue com alguns minutos de antecedência. Seu horário está reservado.
        </p>
        <dl className="mx-auto mt-8 max-w-sm space-y-3 text-left">
          <SummaryRow label="Cliente" value={confirmation.clientName} />
          <SummaryRow label="Profissional" value={confirmation.barberName} />
          {confirmation.serviceName ? (
            <SummaryRow label="Serviço" value={confirmation.serviceName} />
          ) : null}
          <SummaryRow label="Data" value={formatDatePtBr(confirmation.date)} />
          <SummaryRow label="Horário" value={confirmation.time} />
        </dl>
        <Button
          variant="outline"
          className="mt-8"
          onClick={() => {
            setConfirmation(null);
            setClientName("");
            setServiceId(null);
          }}
        >
          Fazer novo agendamento
        </Button>
      </div>
    );
  }

  return (
    <div className="panel p-6 sm:p-10">
      <div className="space-y-10">
        <Field icon={<User className="h-4 w-4" />} step="01" title="Seu nome">
          <Label htmlFor="client-name" className="sr-only">
            Nome do cliente
          </Label>
          <Input
            id="client-name"
            value={clientName}
            maxLength={80}
            onChange={(event) => setClientName(event.target.value)}
            placeholder="Como podemos te chamar?"
            className="h-12 bg-surface-2 text-base"
          />
        </Field>

        <Field icon={<Scissors className="h-4 w-4" />} step="02" title="Profissional">
          <div className="grid gap-3 sm:grid-cols-3">
            {barbers.map((barber) => (
              <button
                key={barber.id}
                type="button"
                onClick={() => {
                  setBarberId(barber.id);
                  setTime(null);
                }}
                className={cn(
                  "rounded-lg border px-4 py-4 text-left transition-all duration-300",
                  barberId === barber.id
                    ? "border-gold bg-gold/10 shadow-gold"
                    : "border-border bg-surface-2 hover:border-gold/50",
                )}
              >
                <span className="block text-base font-medium">{barber.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {barber.specialty}
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field icon={<Scissors className="h-4 w-4" />} step="03" title="Serviço (opcional)">
          <div className="flex flex-wrap gap-2">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => setServiceId(serviceId === service.id ? null : service.id)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors",
                  serviceId === service.id
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-border bg-surface-2 text-muted-foreground hover:border-gold/50",
                )}
              >
                {service.name}
              </button>
            ))}
          </div>
        </Field>

        <Field icon={<CalendarIcon className="h-4 w-4" />} step="04" title="Data">
          <div className="overflow-hidden rounded-lg border border-border bg-surface-2 p-2">
            <Calendar
              mode="single"
              locale={ptBR}
              selected={fromDateString(date)}
              onSelect={(value) => {
                if (!value) return;
                setDate(toDateString(value));
                setTime(null);
              }}
              disabled={{ before: minDate, after: maxDate }}
              className="pointer-events-auto mx-auto"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{formatDatePtBr(date)}</p>
        </Field>

        <Field icon={<Clock className="h-4 w-4" />} step="05" title="Horário disponível">
          {availability.isPending ? (
            <p className="text-sm text-muted-foreground">Carregando horários…</p>
          ) : slots.every((slot) => !slot.available) ? (
            <p className="text-sm text-muted-foreground">
              Nenhum horário livre para {selectedBarber?.name ?? "este profissional"} nesta data.
              Escolha outro dia ou outro profissional.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => setTime(slot.time)}
                  title={
                    slot.reason === "ocupado"
                      ? "Horário já reservado"
                      : slot.reason === "passado"
                        ? "Horário já passou"
                        : undefined
                  }
                  className={cn(
                    "rounded-md border py-2.5 text-sm tabular-nums transition-all duration-200",
                    !slot.available && "cursor-not-allowed border-border/50 text-muted-foreground/40 line-through",
                    slot.available && time !== slot.time && "border-border bg-surface-2 hover:border-gold/60",
                    time === slot.time && "border-gold bg-gold text-primary-foreground",
                  )}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field icon={<User className="h-4 w-4" />} step="06" title="Observação (opcional)">
          <Textarea
            value={notes}
            maxLength={300}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Alguma preferência para o atendimento?"
            className="bg-surface-2"
          />
        </Field>

        <div className="rounded-lg border border-gold/30 bg-gold/5 p-5">
          <p className="eyebrow">Resumo</p>
          <dl className="mt-4 space-y-2">
            <SummaryRow label="Cliente" value={clientName.trim() || "—"} />
            <SummaryRow label="Profissional" value={selectedBarber?.name ?? "—"} />
            <SummaryRow label="Serviço" value={selectedService?.name ?? "—"} />
            <SummaryRow label="Data" value={formatDatePtBr(date)} />
            <SummaryRow label="Horário" value={time ?? "—"} />
          </dl>
        </div>

        {formError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <Button
          size="lg"
          className="h-14 w-full text-base font-medium tracking-wide"
          disabled={!canConfirm || mutation.isPending}
          onClick={() => {
            setFormError(null);
            if (!canConfirm) {
              setFormError("Preencha o nome, o profissional, a data e o horário.");
              return;
            }
            mutation.mutate();
          }}
        >
          {mutation.isPending ? "Confirmando…" : "Confirmar Agendamento"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  icon,
  step,
  title,
  children,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/40 text-gold">
          {icon}
        </span>
        <div>
          <span className="block text-[0.65rem] tracking-[0.3em] text-gold/70">{step}</span>
          <h3 className="font-display text-xl leading-tight">{title}</h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}
