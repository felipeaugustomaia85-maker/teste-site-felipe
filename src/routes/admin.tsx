import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  checkAdminAccess,
  getSettingsAdmin,
  listAppointments,
  listBarbersAdmin,
  saveBarber,
  updateAppointmentStatus,
  updateSettings,
  type AdminAppointment,
} from "@/lib/admin.functions";
import { getBookingConfig } from "@/lib/booking.functions";
import { STATUS_LABELS, formatDatePtBr, nowInShopTimeZone } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel administrativo | Barbearia Nobre" },
      {
        name: "description",
        content: "Área restrita para gerenciar agendamentos, barbeiros e horários da barbearia.",
      },
      { property: "og:title", content: "Painel administrativo | Barbearia Nobre" },
      {
        property: "og:description",
        content: "Gerencie agendamentos, profissionais e horários de funcionamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div>
            <p className="eyebrow">Painel</p>
            <h1 className="font-display text-2xl">Administração</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-gold"
            >
              Ver site
            </Link>
            {session ? (
              <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
                Sair
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        {!ready ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : session ? (
          <AdminDashboard />
        ) : (
          <LoginCard />
        )}
      </main>
    </div>
  );
}

function LoginCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("Conta criada. Se pedirmos confirmação, verifique seu e-mail.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel mx-auto max-w-md space-y-5 p-8">
      <div>
        <p className="eyebrow">Acesso restrito</p>
        <h2 className="mt-2 font-display text-3xl">
          {mode === "login" ? "Entrar no painel" : "Criar acesso"}
        </h2>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-surface-2"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-surface-2"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
      </Button>
      <button
        type="button"
        className="w-full text-xs text-muted-foreground hover:text-gold"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho conta. Entrar"}
      </button>
    </form>
  );
}

function AdminDashboard() {
  const checkAccess = useServerFn(checkAdminAccess);
  const [code, setCode] = useState<string>("");
  const [draft, setDraft] = useState("");
  useEffect(() => {
    const saved = sessionStorage.getItem("admin-code");
    if (saved) setCode(saved);
  }, []);
  const access = useQuery({
    queryKey: ["admin-access", code],
    queryFn: () => checkAccess({ data: { code } }),
    placeholderData: (prev) => prev,
  });

  if (access.isPending) return <p className="text-sm text-muted-foreground">Verificando acesso…</p>;
  if (!access.data?.isAdmin) {
    return (
      <div className="panel p-8">
        <h2 className="font-display text-2xl">Acesso não autorizado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta conta não tem permissão de administrador.
        </p>
      </div>
    );
  }
  if (!access.data.codeOk) {
    return (
      <form
        className="panel mx-auto max-w-md space-y-5 p-8"
        onSubmit={(e) => {
          e.preventDefault();
          sessionStorage.setItem("admin-code", draft);
          setCode(draft);
        }}
      >
        <div>
          <p className="eyebrow">Verificação</p>
          <h2 className="mt-2 font-display text-3xl">Código de acesso</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Digite o código secreto para entrar na área do administrador.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-code">Código</Label>
          <Input
            id="admin-code"
            type="password"
            required
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="bg-surface-2"
          />
          {code && <p className="text-xs text-destructive">Código incorreto.</p>}
          {!access.data.codeConfigured && (
            <p className="text-xs text-destructive">O código ainda não foi definido.</p>
          )}
        </div>
        <Button type="submit" className="w-full">
          Verificar
        </Button>
      </form>
    );
  }

  return (
    <Tabs defaultValue="agenda" className="space-y-8">
      <TabsList className="bg-surface-2">
        <TabsTrigger value="agenda">Agenda</TabsTrigger>
        <TabsTrigger value="barbeiros">Barbeiros</TabsTrigger>
        <TabsTrigger value="config">Configurações</TabsTrigger>
      </TabsList>
      <TabsContent value="agenda">
        <AgendaPanel />
      </TabsContent>
      <TabsContent value="barbeiros">
        <BarbersPanel />
      </TabsContent>
      <TabsContent value="config">
        <SettingsPanel />
      </TabsContent>
    </Tabs>
  );
}

function AgendaPanel() {
  const today = nowInShopTimeZone().date;
  const [date, setDate] = useState(today);
  const [barberId, setBarberId] = useState<string>("");
  const [view, setView] = useState<"tabela" | "calendario">("tabela");

  const fetchConfig = useServerFn(getBookingConfig);
  const fetchAppointments = useServerFn(listAppointments);
  const changeStatus = useServerFn(updateAppointmentStatus);
  const queryClient = useQueryClient();

  const config = useQuery({ queryKey: ["booking-config"], queryFn: () => fetchConfig() });

  const dayQuery = useQuery({
    queryKey: ["admin-appointments", date, barberId],
    queryFn: () =>
      fetchAppointments({ data: { date, barberId: barberId || null } }),
  });

  const monthQuery = useQuery({
    queryKey: ["admin-appointments-month", date.slice(0, 7), barberId],
    queryFn: () =>
      fetchAppointments({ data: { monthOf: date, barberId: barberId || null } }),
    enabled: view === "calendario",
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: "confirmado" | "cancelado" | "concluido" }) =>
      changeStatus({ data: input }),
    onSuccess: () => {
      toast.success("Agendamento atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-appointments-month"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: () => toast.error("Não foi possível atualizar o agendamento."),
  });

  const appointments = dayQuery.data?.appointments ?? [];
  const barbers = config.data?.barbers ?? [];
  const settings = config.data?.settings;

  const occupancy = useMemo(() => {
    if (!settings) return [];
    const activeTimes = new Set(
      appointments.filter((a) => a.status !== "cancelado").map((a) => a.appointment_time),
    );
    return { activeTimes };
  }, [appointments, settings]) as unknown as { activeTimes: Set<string> };

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-end gap-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="filter-date">Data</Label>
          <Input
            id="filter-date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-44 bg-surface-2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-barber">Barbeiro</Label>
          <select
            id="filter-barber"
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
            className="h-10 w-52 rounded-md border border-input bg-surface-2 px-3 text-sm"
          >
            <option value="">Todos</option>
            {barbers.map((barber) => (
              <option key={barber.id} value={barber.id}>
                {barber.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant={view === "tabela" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("tabela")}
          >
            Tabela
          </Button>
          <Button
            variant={view === "calendario" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("calendario")}
          >
            Calendário
          </Button>
        </div>
      </div>

      {view === "tabela" ? (
        <div className="panel overflow-hidden">
          <div className="border-b border-border/60 p-5">
            <h2 className="font-display text-xl">{formatDatePtBr(date)}</h2>
            <p className="text-xs text-muted-foreground">
              {appointments.length} agendamento(s) nesta data
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horário</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Barbeiro</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum agendamento.
                  </TableCell>
                </TableRow>
              ) : (
                appointments.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    onStatus={(status) => statusMutation.mutate({ id: appointment.id, status })}
                    busy={statusMutation.isPending}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <MonthGrid
          monthOf={date}
          appointments={monthQuery.data?.appointments ?? []}
          onSelectDay={(day) => {
            setDate(day);
            setView("tabela");
          }}
        />
      )}

      {settings ? (
        <SlotOverview
          settings={settings}
          occupiedTimes={occupancy.activeTimes}
          barberSelected={Boolean(barberId)}
        />
      ) : null}
    </div>
  );
}

function AppointmentRow({
  appointment,
  onStatus,
  busy,
}: {
  appointment: AdminAppointment;
  onStatus: (status: "confirmado" | "cancelado" | "concluido") => void;
  busy: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="tabular-nums">{appointment.appointment_time}</TableCell>
      <TableCell className="font-medium">{appointment.client_name}</TableCell>
      <TableCell>{appointment.barber_name}</TableCell>
      <TableCell className="text-muted-foreground">{appointment.service_name ?? "—"}</TableCell>
      <TableCell>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            appointment.status === "confirmado" && "border-gold/50 text-gold",
            appointment.status === "concluido" && "border-success/50 text-success",
            appointment.status === "cancelado" && "border-destructive/50 text-destructive",
          )}
        >
          {STATUS_LABELS[appointment.status] ?? appointment.status}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {appointment.status !== "concluido" ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus("concluido")}>
              Concluir
            </Button>
          ) : null}
          {appointment.status !== "cancelado" ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus("cancelado")}>
              Cancelar
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus("confirmado")}>
              Reativar
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function MonthGrid({
  monthOf,
  appointments,
  onSelectDay,
}: {
  monthOf: string;
  appointments: AdminAppointment[];
  onSelectDay: (day: string) => void;
}) {
  const [year, month] = monthOf.split("-").map(Number);
  const firstDay = new Date(year ?? 1970, (month ?? 1) - 1, 1);
  const daysInMonth = new Date(year ?? 1970, month ?? 1, 0).getDate();
  const leading = firstDay.getDay();

  const byDay = new Map<string, AdminAppointment[]>();
  for (const appointment of appointments) {
    const list = byDay.get(appointment.appointment_date) ?? [];
    list.push(appointment);
    byDay.set(appointment.appointment_date, list);
  }

  return (
    <div className="panel p-5">
      <h2 className="font-display text-xl capitalize">
        {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(firstDay)}
      </h2>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {Array.from({ length: leading }).map((_, index) => (
          <div key={`empty-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = `${monthOf.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`;
          const items = (byDay.get(day) ?? []).filter((a) => a.status !== "cancelado");
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "min-h-20 rounded-md border border-border/60 bg-surface-2 p-2 text-left transition-colors hover:border-gold/60",
                items.length > 0 && "border-gold/40",
              )}
            >
              <span className="text-xs text-muted-foreground">{index + 1}</span>
              {items.length > 0 ? (
                <span className="mt-1 block text-xs text-gold">{items.length} agend.</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotOverview({
  settings,
  occupiedTimes,
  barberSelected,
}: {
  settings: { open_time: string; close_time: string; slot_minutes: number; last_slot_is_start: boolean };
  occupiedTimes: Set<string>;
  barberSelected: boolean;
}) {
  const slots = useMemo(() => {
    const [openH = 7, openM = 0] = settings.open_time.split(":").map(Number);
    const [closeH = 18, closeM = 0] = settings.close_time.split(":").map(Number);
    const start = openH * 60 + openM;
    const end = closeH * 60 + closeM;
    const step = settings.slot_minutes;
    const limit = settings.last_slot_is_start ? end : end - step;
    const result: string[] = [];
    for (let t = start; t <= limit; t += step) {
      result.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
    }
    return result;
  }, [settings]);

  return (
    <div className="panel p-5">
      <h2 className="font-display text-xl">Horários do dia</h2>
      <p className="text-xs text-muted-foreground">
        {barberSelected
          ? "Ocupados para o barbeiro filtrado."
          : "Ocupados considerando todos os barbeiros do filtro atual."}
      </p>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {slots.map((slot) => {
          const busy = occupiedTimes.has(slot);
          return (
            <span
              key={slot}
              className={cn(
                "rounded-md border py-2 text-center text-xs tabular-nums",
                busy
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {slot}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function BarbersPanel() {
  const fetchBarbers = useServerFn(listBarbersAdmin);
  const persistBarber = useServerFn(saveBarber);
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newSpecialty, setNewSpecialty] = useState("");

  const barbers = useQuery({ queryKey: ["admin-barbers"], queryFn: () => fetchBarbers() });

  const mutation = useMutation({
    mutationFn: (input: {
      id?: string | null;
      name: string;
      specialty: string;
      active: boolean;
      sort_order: number;
    }) => persistBarber({ data: input }),
    onSuccess: () => {
      toast.success("Barbeiros atualizados.");
      void queryClient.invalidateQueries({ queryKey: ["admin-barbers"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-config"] });
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <h2 className="font-display text-xl">Profissionais</h2>
        <div className="mt-5 space-y-4">
          {(barbers.data?.barbers ?? []).map((barber: any) => (
            <BarberRow
              key={barber.id}
              barber={barber}
              onSave={(values) => mutation.mutate({ id: barber.id, ...values })}
              busy={mutation.isPending}
            />
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <h2 className="font-display text-xl">Adicionar barbeiro</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="new-name">Nome</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-52 bg-surface-2"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-specialty">Especialidade</Label>
            <Input
              id="new-specialty"
              value={newSpecialty}
              onChange={(e) => setNewSpecialty(e.target.value)}
              className="w-64 bg-surface-2"
            />
          </div>
          <Button
            disabled={newName.trim().length < 2 || mutation.isPending}
            onClick={() => {
              mutation.mutate({
                name: newName.trim(),
                specialty: newSpecialty.trim(),
                active: true,
                sort_order: (barbers.data?.barbers?.length ?? 0) + 1,
              });
              setNewName("");
              setNewSpecialty("");
            }}
          >
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}

function BarberRow({
  barber,
  onSave,
  busy,
}: {
  barber: { id: string; name: string; specialty: string; active: boolean; sort_order: number };
  onSave: (values: { name: string; specialty: string; active: boolean; sort_order: number }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(barber.name);
  const [specialty, setSpecialty] = useState(barber.specialty);
  const [active, setActive] = useState(barber.active);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-surface-2 p-4">
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-48 bg-background" />
      </div>
      <div className="space-y-2">
        <Label>Especialidade</Label>
        <Input
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="w-64 bg-background"
        />
      </div>
      <div className="flex items-center gap-2 pb-2">
        <Switch checked={active} onCheckedChange={setActive} id={`active-${barber.id}`} />
        <Label htmlFor={`active-${barber.id}`}>Ativo</Label>
      </div>
      <Button
        variant="outline"
        disabled={busy || name.trim().length < 2}
        onClick={() => onSave({ name: name.trim(), specialty: specialty.trim(), active, sort_order: barber.sort_order })}
      >
        Salvar
      </Button>
    </div>
  );
}

function SettingsPanel() {
  const fetchSettings = useServerFn(getSettingsAdmin);
  const persistSettings = useServerFn(updateSettings);
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ["admin-settings"], queryFn: () => fetchSettings() });
  const settings = query.data?.settings as
    | {
        id: string;
        shop_name: string;
        open_time: string;
        close_time: string;
        slot_minutes: number;
        last_slot_is_start: boolean;
      }
    | null
    | undefined;

  const [form, setForm] = useState<null | {
    id: string;
    shop_name: string;
    open_time: string;
    close_time: string;
    slot_minutes: number;
    last_slot_is_start: boolean;
  }>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const mutation = useMutation({
    mutationFn: (input: NonNullable<typeof form>) => persistSettings({ data: input }),
    onSuccess: () => {
      toast.success("Configurações salvas.");
      void queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-config"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  if (!form) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="panel max-w-xl space-y-5 p-6">
      <h2 className="font-display text-xl">Funcionamento</h2>
      <div className="space-y-2">
        <Label htmlFor="shop-name">Nome da barbearia</Label>
        <Input
          id="shop-name"
          value={form.shop_name}
          onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
          className="bg-surface-2"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="open">Abre</Label>
          <Input
            id="open"
            type="time"
            value={form.open_time}
            onChange={(e) => setForm({ ...form, open_time: e.target.value })}
            className="bg-surface-2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="close">Fecha</Label>
          <Input
            id="close"
            type="time"
            value={form.close_time}
            onChange={(e) => setForm({ ...form, close_time: e.target.value })}
            className="bg-surface-2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slot">Intervalo (min)</Label>
          <Input
            id="slot"
            type="number"
            min={10}
            max={120}
            value={form.slot_minutes}
            onChange={(e) => setForm({ ...form, slot_minutes: Number(e.target.value) })}
            className="bg-surface-2"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="last-slot"
          checked={form.last_slot_is_start}
          onCheckedChange={(checked) => setForm({ ...form, last_slot_is_start: checked })}
        />
        <Label htmlFor="last-slot">
          O horário de fechamento também pode iniciar um atendimento
        </Label>
      </div>
      <Button disabled={mutation.isPending} onClick={() => mutation.mutate(form)}>
        {mutation.isPending ? "Salvando…" : "Salvar configurações"}
      </Button>
    </div>
  );
}
