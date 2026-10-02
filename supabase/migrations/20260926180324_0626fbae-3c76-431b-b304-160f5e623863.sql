
-- roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- first signed-up user becomes admin
CREATE OR REPLACE FUNCTION public.grant_first_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_grant_admin
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_first_admin();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- barbers
CREATE TABLE public.barbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  specialty text NOT NULL DEFAULT '',
  photo_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.barbers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barbers TO authenticated;
GRANT ALL ON public.barbers TO service_role;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads barbers" ON public.barbers FOR SELECT USING (true);
CREATE POLICY "admins manage barbers" ON public.barbers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER barbers_updated_at BEFORE UPDATE ON public.barbers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- services
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 30,
  price numeric(10,2),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads services" ON public.services FOR SELECT USING (true);
CREATE POLICY "admins manage services" ON public.services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- shop settings (singleton)
CREATE TABLE public.shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name text NOT NULL DEFAULT 'Barbearia',
  open_time time NOT NULL DEFAULT '07:00',
  close_time time NOT NULL DEFAULT '18:00',
  slot_minutes integer NOT NULL DEFAULT 30,
  last_slot_is_start boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_settings TO authenticated;
GRANT ALL ON public.shop_settings TO service_role;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads settings" ON public.shop_settings FOR SELECT USING (true);
CREATE POLICY "admins manage settings" ON public.shop_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER shop_settings_updated_at BEFORE UPDATE ON public.shop_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- appointments
CREATE TYPE public.appointment_status AS ENUM ('confirmado', 'cancelado', 'concluido');

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE RESTRICT,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  starts_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 30,
  status public.appointment_status NOT NULL DEFAULT 'confirmado',
  notes text,
  synced_to_sheet boolean NOT NULL DEFAULT false,
  calendar_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX appointments_unique_active_slot
  ON public.appointments (barber_id, appointment_date, appointment_time)
  WHERE status <> 'cancelado';
CREATE INDEX appointments_date_idx ON public.appointments (appointment_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage appointments" ON public.appointments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- seed
INSERT INTO public.shop_settings (shop_name, open_time, close_time, slot_minutes, last_slot_is_start)
VALUES ('Barbearia Nobre', '07:00', '18:00', 30, true);

INSERT INTO public.barbers (name, specialty, active, sort_order) VALUES
  ('Barbeiro 1', 'Cortes clássicos e navalha', true, 1),
  ('Barbeiro 2', 'Degradê e desenhos', true, 2),
  ('Barbeiro 3', 'Barba e cuidados faciais', true, 3);

INSERT INTO public.services (name, description, duration_minutes, price, active, sort_order) VALUES
  ('Corte', 'Corte personalizado com acabamento preciso.', 30, 45.00, true, 1),
  ('Barba', 'Toalha quente, navalha e finalização.', 30, 35.00, true, 2),
  ('Corte + Barba', 'Experiência completa de barbearia.', 60, 70.00, true, 3),
  ('Acabamento', 'Retoque rápido de pézinho e contornos.', 30, 25.00, true, 4);
