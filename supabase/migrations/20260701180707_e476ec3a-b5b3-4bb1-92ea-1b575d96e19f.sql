-- Permite gestor gerenciar papéis dos usuários da mesma imobiliária
CREATE POLICY "Gestor cria papéis na imobiliária"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor')
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = user_roles.user_id
        AND u.imobiliaria_id = public.get_my_imobiliaria_id()
    )
  );

CREATE POLICY "Gestor remove papéis na imobiliária"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor')
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = user_roles.user_id
        AND u.imobiliaria_id = public.get_my_imobiliaria_id()
    )
    -- Impede que o próprio gestor remova seu último papel de gestor
    AND NOT (user_id = auth.uid() AND role = 'gestor')
  );

-- Permite gestor deletar construtoras (soft delete via update também é usado)
-- (policies de construtoras já existem para gestor)
