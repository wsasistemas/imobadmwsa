-- =====================================================================================
-- ImobAdm — comprador que já tinha login WSA entra direto pelo botão do e-mail (aditiva).
-- A senha dele não muda (o login é compartilhado); o botão leva um token de entrada de uso único.
-- Só nas plataformas cuja tela de login já trata esse token.
-- =====================================================================================

ALTER TABLE adm.sistemas ADD COLUMN IF NOT EXISTS entra_pelo_link boolean NOT NULL DEFAULT false;
UPDATE adm.sistemas SET entra_pelo_link = true WHERE app = 'imobimoveis';

CREATE FUNCTION public.adm_srv_entra_pelo_link(p_app text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT coalesce((SELECT s.entra_pelo_link FROM adm.sistemas s WHERE s.app = p_app), false) $$;

REVOKE ALL ON FUNCTION public.adm_srv_entra_pelo_link(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adm_srv_entra_pelo_link(text) TO service_role;
