import { createFileRoute, Link } from "@tanstack/react-router";

import { BookingForm } from "@/components/booking/BookingForm";
import { Button } from "@/components/ui/button";
import { getBookingConfig } from "@/lib/booking.functions";
import heroImage from "@/assets/hero-barbershop.jpg";
import barber1 from "@/assets/barber-1.jpg";
import barber2 from "@/assets/barber-2.jpg";
import barber3 from "@/assets/barber-3.jpg";

const fallbackPhotos = [barber1, barber2, barber3];

export const Route = createFileRoute("/")({
  loader: () => getBookingConfig(),
  head: () => ({
    meta: [
      { title: "Barbearia Nobre | Agendamento online" },
      {
        name: "description",
        content:
          "Agende seu corte ou barba com os barbeiros da Barbearia Nobre em poucos cliques. Horários de 07h às 18h.",
      },
      { property: "og:title", content: "Barbearia Nobre | Agendamento online" },
      {
        property: "og:description",
        content: "Seu estilo. Seu horário. Sua experiência. Agende online em poucos cliques.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { barbers, services, settings } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="font-display text-lg tracking-[0.18em] uppercase">
            {settings.shop_name}
          </span>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-gold sm:block"
            >
              Admin
            </Link>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <a href="#agendar">Agendar</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate flex min-h-[92vh] items-center overflow-hidden">
        <img
          src={heroImage}
          alt="Interior de barbearia premium com iluminação dourada"
          width={1600}
          height={1104}
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/70 to-background" />
        <div className="relative mx-auto w-full max-w-6xl px-5 pt-28 pb-20">
          <p className="eyebrow animate-rise">BARBEARIA</p>
          <h1 className="animate-rise mt-5 max-w-3xl font-display text-5xl leading-[1.05] sm:text-6xl lg:text-7xl">
            Seu estilo. <span className="text-gradient-gold">Seu horário.</span> Sua experiência.
          </h1>
          <p className="animate-rise mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Agende seu horário com nossos barbeiros de forma rápida e fácil.
          </p>
          <div className="animate-rise mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-14 text-base">
              <a href="#agendar">Agendar meu horário</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 text-base">
              <a href="#profissionais">Conhecer os barbeiros</a>
            </Button>
          </div>
          <div className="mt-14 flex flex-wrap gap-x-10 gap-y-4 text-sm text-muted-foreground">
            <span>Atendimento {settings.open_time} às {settings.close_time}</span>
            <span>{barbers.length} profissionais</span>
            <span>Confirmação imediata</span>
          </div>
        </div>
      </section>

      {/* Serviços */}
      <section className="mx-auto max-w-6xl px-5 py-24" id="servicos">
        <p className="eyebrow">Serviços</p>
        <h2 className="mt-3 font-display text-4xl sm:text-5xl">Feito com precisão</h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <article
              key={service.id}
              className="panel group p-6 transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="hairline-gold w-10" />
              <h3 className="mt-5 font-display text-2xl">{service.name}</h3>
              <p className="mt-3 min-h-14 text-sm text-muted-foreground">{service.description}</p>
              <div className="mt-6 flex items-baseline justify-between">
                <span className="text-lg text-gold">
                  {service.price != null
                    ? new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(Number(service.price))
                    : "Sob consulta"}
                </span>
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {service.duration_minutes} min
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Profissionais */}
      <section className="border-y border-border/60 bg-surface/40 py-24" id="profissionais">
        <div className="mx-auto max-w-6xl px-5">
          <p className="eyebrow">Profissionais</p>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl">Quem cuida do seu visual</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {barbers.map((barber, index) => (
              <article key={barber.id} className="panel overflow-hidden">
                <img
                  src={barber.photo_url ?? fallbackPhotos[index % fallbackPhotos.length]}
                  alt={`Barbeiro ${barber.name}`}
                  loading="lazy"
                  width={800}
                  height={1008}
                  className="h-72 w-full object-cover object-top"
                />
                <div className="p-6">
                  <h3 className="font-display text-2xl">{barber.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{barber.specialty}</p>
                  <p className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    Disponível para agendamento
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Agendamento */}
      <section className="mx-auto max-w-3xl px-5 py-24" id="agendar">
        <p className="eyebrow">Agendamento</p>
        <h2 className="mt-3 font-display text-4xl sm:text-5xl">Reserve seu horário</h2>
        <p className="mt-4 text-sm text-muted-foreground">
          Apenas os horários realmente livres do profissional escolhido aparecem disponíveis.
        </p>
        <div className="mt-10">
          <BookingForm barbers={barbers} services={services} settings={settings} />
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <span className="font-display tracking-[0.18em] uppercase">{settings.shop_name}</span>
          <span>
            Atendimento de {settings.open_time} às {settings.close_time}
          </span>
          <Link to="/admin" className="transition-colors hover:text-gold">
            Área do administrador
          </Link>
        </div>
      </footer>

      {/* CTA fixo mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 p-3 backdrop-blur sm:hidden">
        <Button asChild size="lg" className="h-13 w-full text-base">
          <a href="#agendar">Agendar horário</a>
        </Button>
      </div>
    </div>
  );
}
