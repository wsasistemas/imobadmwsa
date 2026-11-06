
-- =========================================================================
-- ENUM: app_role
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('gestor', 'corretor');

-- =========================================================================
-- TABLE: imobiliarias
-- =========================================================================
CREATE TABLE public.imobiliarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  cor_primaria TEXT DEFAULT '#1B4F72',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imobiliarias TO authenticated;
GRANT ALL ON public.imobiliarias TO service_role;
ALTER TABLE public.imobiliarias ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- TABLE: usuarios (perfil, sem role)
-- =========================================================================
CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  avatar_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuarios_imobiliaria ON public.usuarios(imobiliaria_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO authenticated;
GRANT ALL ON public.usuarios TO service_role;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- TABLE: user_roles (SEPARADA da tabela de perfil — evita escalonamento)
-- =========================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- SECURITY DEFINER FUNCTIONS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_imobiliaria_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT imobiliaria_id FROM public.usuarios WHERE id = auth.uid();
$$;

-- =========================================================================
-- TRIGGER: handle_new_user
-- Primeiro usuário do sistema vira gestor + cria a imobiliária demo.
-- Demais usuários entram na mesma imobiliária como corretor.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_imob_id UUID;
  v_nome TEXT;
  v_is_first BOOLEAN;
BEGIN
  v_nome := COALESCE(
    NEW.raw_user_meta_data->>'nome',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  SELECT id INTO v_imob_id FROM public.imobiliarias ORDER BY created_at ASC LIMIT 1;
  v_is_first := v_imob_id IS NULL;

  IF v_is_first THEN
    INSERT INTO public.imobiliarias (nome)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'imobiliaria_nome', 'ImobSystem Demo Ltda'))
    RETURNING id INTO v_imob_id;
  END IF;

  INSERT INTO public.usuarios (id, imobiliaria_id, nome, email)
  VALUES (NEW.id, v_imob_id, v_nome, NEW.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_first THEN 'gestor'::public.app_role ELSE 'corretor'::public.app_role END);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- TRIGGER: updated_at helper
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_imobiliarias_updated BEFORE UPDATE ON public.imobiliarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- RLS POLICIES: imobiliarias
-- =========================================================================
CREATE POLICY "Ver imobiliária própria"
  ON public.imobiliarias FOR SELECT TO authenticated
  USING (id = public.get_my_imobiliaria_id());

CREATE POLICY "Gestor atualiza imobiliária própria"
  ON public.imobiliarias FOR UPDATE TO authenticated
  USING (id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(), 'gestor'));

-- =========================================================================
-- RLS POLICIES: usuarios
-- =========================================================================
CREATE POLICY "Ver usuários da mesma imobiliária"
  ON public.usuarios FOR SELECT TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id());

CREATE POLICY "Atualizar próprio perfil"
  ON public.usuarios FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND imobiliaria_id = public.get_my_imobiliaria_id());

CREATE POLICY "Gestor atualiza qualquer usuário da imobiliária"
  ON public.usuarios FOR UPDATE TO authenticated
  USING (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (imobiliaria_id = public.get_my_imobiliaria_id() AND public.has_role(auth.uid(), 'gestor'));

-- =========================================================================
-- RLS POLICIES: user_roles
-- =========================================================================
CREATE POLICY "Ver papéis dos usuários da mesma imobiliária"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = user_roles.user_id
        AND u.imobiliaria_id = public.get_my_imobiliaria_id()
    )
  );
