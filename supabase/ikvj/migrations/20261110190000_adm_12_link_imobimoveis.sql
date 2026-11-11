-- =====================================================================================
-- ImobAdm — link de acesso do ImobVendas (schema imobimoveis) passa a ser imobimoveis.imobsystems.com.br.
-- Vale para o botão do e-mail de parabéns (criar senha / entrar direto) e para o "Link de acesso" do painel.
-- =====================================================================================

UPDATE adm.sistemas SET url_login = 'https://imobimoveis.imobsystems.com.br' WHERE app = 'imobimoveis';
