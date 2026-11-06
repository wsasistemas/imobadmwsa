import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { SessaoUsuario, UserRole } from "@/types";

interface UseAuthState {
  loading: boolean;
  session: Session | null;
  usuario: SessaoUsuario | null;
}

async function loadProfile(userId: string): Promise<SessaoUsuario | null> {
  const [{ data: perfil }, { data: roles }] = await Promise.all([
    supabase.from("usuarios").select("id, nome, email, imobiliaria_id").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (!perfil) return null;

  // Se o usuário tiver múltiplos papéis, `gestor` prevalece.
  const roleList = (roles ?? []).map((r) => r.role as UserRole);
  const role: UserRole = roleList.includes("gestor") ? "gestor" : "corretor";

  return {
    userId: perfil.id,
    email: perfil.email,
    nome: perfil.nome,
    imobiliariaId: perfil.imobiliaria_id,
    role,
  };
}

export function useAuth(): UseAuthState & {
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<UseAuthState>({
    loading: true,
    session: null,
    usuario: null,
  });

  useEffect(() => {
    let cancelled = false;

    // 1) Assinar mudanças ANTES de checar sessão (padrão Supabase)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, session }));

      if (session?.user) {
        // Adia a chamada async pra não bloquear o callback
        setTimeout(async () => {
          const usuario = await loadProfile(session.user.id);
          if (!cancelled) setState({ loading: false, session, usuario });
        }, 0);
      } else {
        setState({ loading: false, session: null, usuario: null });
      }
    });

    // 2) Sessão inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        const usuario = await loadProfile(session.user.id);
        if (!cancelled) setState({ loading: false, session, usuario });
      } else {
        setState({ loading: false, session: null, usuario: null });
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    ...state,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
}
