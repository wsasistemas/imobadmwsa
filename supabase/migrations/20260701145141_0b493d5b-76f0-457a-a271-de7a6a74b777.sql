
CREATE POLICY "emp_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'empreendimentos'
    AND (storage.foldername(name))[1] = public.get_my_imobiliaria_id()::text);

CREATE POLICY "emp_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'empreendimentos'
    AND (storage.foldername(name))[1] = public.get_my_imobiliaria_id()::text);

CREATE POLICY "emp_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'empreendimentos'
    AND (storage.foldername(name))[1] = public.get_my_imobiliaria_id()::text);

CREATE POLICY "emp_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'empreendimentos'
    AND (storage.foldername(name))[1] = public.get_my_imobiliaria_id()::text);
