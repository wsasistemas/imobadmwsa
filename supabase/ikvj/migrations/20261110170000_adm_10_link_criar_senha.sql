-- =====================================================================================
-- ImobAdm — o botão do e-mail de parabéns abre direto a tela de criar senha (aditiva).
-- Cada plataforma diz em qual rota fica essa tela; o link leva ?token_hash=...&type=recovery e o site entra sozinho.
-- =====================================================================================

ALTER TABLE adm.sistemas ADD COLUMN IF NOT EXISTS rota_primeiro_acesso text NOT NULL DEFAULT '/auth'
  CHECK (rota_primeiro_acesso ~ '^/[A-Za-z0-9/_-]*$');
UPDATE adm.sistemas SET rota_primeiro_acesso = '/auth/reset-password' WHERE app = 'suprimentos' AND rota_primeiro_acesso = '/auth';

CREATE FUNCTION public.adm_srv_rota_primeiro_acesso(p_app text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT s.rota_primeiro_acesso FROM adm.sistemas s WHERE s.app = p_app $$;

REVOKE ALL ON FUNCTION public.adm_srv_rota_primeiro_acesso(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adm_srv_rota_primeiro_acesso(text) TO service_role;
