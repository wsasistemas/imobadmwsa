
-- Fix SECURITY DEFINER view -> invoker
ALTER VIEW public.vw_aging_comissoes SET (security_invoker = on);

-- Revoke public execute on new RPCs; keep only authenticated + service_role
REVOKE ALL ON FUNCTION public.reservar_unidade(uuid, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.converter_reserva_em_venda(uuid, numeric, numeric, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_politica_comercial(uuid, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expirar_reservas() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reservar_unidade(uuid, uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.converter_reserva_em_venda(uuid, numeric, numeric, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validar_politica_comercial(uuid, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expirar_reservas() TO service_role;
