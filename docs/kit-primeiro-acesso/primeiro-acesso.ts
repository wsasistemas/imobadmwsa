// Primeiro acesso (ImobAdm WSA, Supabase central ikvj). Copiar para src/lib/primeiro-acesso.ts de cada plataforma.
// A regra fica no banco central; aqui o site só pergunta e obedece. Falha de rede ou função ausente nunca barram ninguém.
import { supabase } from '@/integrations/supabase/client';

type Cliente = { schema: (s: string) => { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> } };
const publico = () => (supabase as unknown as Cliente).schema('public');

export const SENHA_VENCIDA = 'Sua senha provisória venceu. Peça um novo acesso à WSA Sistemas.';

/** Depois do login com senha. 'trocar' → mande para a tela de nova senha; 'vencida' → a sessão já foi encerrada. */
export async function verificarPrimeiroAcesso(): Promise<'ok' | 'trocar' | 'vencida'> {
  try {
    const { data, error } = await publico().rpc('primeiro_acesso_situacao');
    if (error || !data) return 'ok';
    const s = data as { precisa?: boolean; expirada?: boolean };
    if (s.expirada) {
      await supabase.auth.signOut();
      return 'vencida';
    }
    return s.precisa ? 'trocar' : 'ok';
  } catch {
    return 'ok';
  }
}

/** Sessão restaurada: quem ainda não trocou a senha não fica fora da tela de nova senha. */
export async function exigirNovaSenha(rotaNovaSenha: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === new URL(rotaNovaSenha, window.location.origin).pathname) return;
  if ((await verificarPrimeiroAcesso()) === 'trocar') window.location.replace(rotaNovaSenha);
}

/** Chamar logo depois de supabase.auth.updateUser({ password }) dar certo. */
export async function concluirPrimeiroAcesso(): Promise<void> {
  try {
    await publico().rpc('primeiro_acesso_concluir');
  } catch {
    // A pessoa já trocou a senha; a marcação é refeita no próximo login.
  }
}

/** E-mail que vem no botão do e-mail de parabéns (?email=...), para já preencher o login. */
export const emailDoLink = (): string =>
  typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('email') ?? '';
