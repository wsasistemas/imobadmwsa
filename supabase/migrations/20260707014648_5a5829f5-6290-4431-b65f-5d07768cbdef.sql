
-- Storage policies for 'documentos' bucket
-- Path pattern: {imobiliaria_id}/{venda_id}/arquivo.ext
CREATE POLICY "documentos_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1]::uuid = public.get_my_imobiliaria_id()
);

CREATE POLICY "documentos_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1]::uuid = public.get_my_imobiliaria_id()
);

CREATE POLICY "documentos_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1]::uuid = public.get_my_imobiliaria_id()
);

CREATE POLICY "documentos_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1]::uuid = public.get_my_imobiliaria_id()
  AND public.has_role(auth.uid(),'gestor')
);
