import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { UserRole, Usuario, UsuarioComRole } from "@/types";
import { toast } from "sonner";

const KEY = ["corretores"] as const;

export function useCorretores() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, nome, email, imobiliaria_id, telefone, avatar_url, ativo, created_at, updated_at")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Usuario[];
    },
  });
}

/** Retorna todos os usuários da imobiliária com role resolvido (gestor > corretor). */
export function useEquipe() {
  return useQuery({
    queryKey: ["equipe"] as const,
    queryFn: async () => {
      const { data: usuarios, error } = await supabase
        .from("usuarios")
        .select("id, nome, email, imobiliaria_id, telefone, avatar_url, ativo, created_at, updated_at")
        .order("nome");
      if (error) throw error;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const byUser = new Map<string, UserRole[]>();
      (roles ?? []).forEach((r) => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as UserRole);
        byUser.set(r.user_id, arr);
      });

      return (usuarios ?? []).map((u) => {
        const list = byUser.get(u.id) ?? [];
        const role: UserRole = list.includes("gestor") ? "gestor" : "corretor";
        return { ...(u as unknown as Usuario), role } as UsuarioComRole;
      });
    },
  });
}

export function useUpdateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Usuario> & { id: string }) => {
      const { data, error } = await supabase
        .from("usuarios")
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Usuario;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipe"] });
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Corretor atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Alterna papel entre gestor e corretor. */
export function useSetRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      if (role === "gestor") {
        // Adiciona gestor se ainda não existir
        const { error } = await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "gestor" } as never, {
            onConflict: "user_id,role",
          });
        if (error) throw error;
      } else {
        // Remove papel de gestor (deixa apenas corretor)
        const { error: dErr } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "gestor");
        if (dErr) throw dErr;
        // Garante corretor
        const { error: iErr } = await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "corretor" } as never, {
            onConflict: "user_id,role",
          });
        if (iErr) throw iErr;
      }
      return { userId, role };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipe"] });
      toast.success("Papel atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
