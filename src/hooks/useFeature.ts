import { useAuth } from "./useAuth";
import { useImobiliaria } from "./useImobiliaria";

export function useFeature(flag: string): { enabled: boolean; loading: boolean } {
  const { usuario } = useAuth();
  const { data, isLoading } = useImobiliaria(usuario?.imobiliariaId);
  const features = (data?.features ?? {}) as Record<string, unknown>;
  return { enabled: features[flag] === true, loading: isLoading };
}
