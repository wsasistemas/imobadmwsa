-- =====================================================================================
-- ImobAdm — leads de imobiliária vão para o ImobVendas (schema imobimoveis). O ImobSystem não é do ramo imobiliário e sai
-- da classificação. Só atualiza dados: regras de classificação, negócios já classificados e o link de login.
-- =====================================================================================

UPDATE comercial.config_qualificacao
   SET regras = pg_catalog.jsonb_set(regras #- '{sistemas,imobsystem}', '{sistemas,imobimoveis}',
         '["imobiliari", "corretor", "corretora", "imoveis", "imovel", "construtora", "loteadora", "incorporadora", "crm",
           "imobvendas", "imob vendas", "imobimoveis", "atendimento por ia", "robo no whatsapp", "funil de vendas"]'::jsonb)
 WHERE id AND NOT (regras -> 'sistemas' ? 'imobimoveis');

-- Negócios que foram marcados como ImobSystem por serem de imobiliária.
UPDATE comercial.negocios
   SET sistemas = (SELECT pg_catalog.array_agg(DISTINCT s) FROM pg_catalog.unnest(pg_catalog.array_replace(sistemas, 'imobsystem', 'imobimoveis')) s)
 WHERE 'imobsystem' = ANY (sistemas);

-- O comprador entra pelo endereço do ImobVendas.
UPDATE adm.sistemas SET url_login = 'https://imobvendas.imobsystems.com.br' WHERE app = 'imobimoveis' AND url_login IS NULL;

-- O produto é vendido como ImobVendas (schema imobimoveis).
UPDATE acessos.aplicativos SET nome = 'ImobVendas' WHERE schema_name = 'imobimoveis' AND nome = 'Imobimoveis';
