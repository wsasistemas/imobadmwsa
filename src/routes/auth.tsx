import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconeColorido } from "@/components/icones/icone-colorido";
import { api, mensagemErro } from "@/lib/adm/api";
import { sb } from "@/lib/adm/supabase";

// Login do ImobAdm: e-mail e senha do login compartilhado do Supabase central (ikvj).
// Só entra o super admin da Central de Acessos (pa_sou_super_admin); os outros logins veem "Acesso bloqueado".

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — ImobAdm WSA" },
      { name: "description", content: "Acesso ao painel central da WSA Sistemas." },
    ],
  }),
  component: AuthPage,
});

type Modo = "entrar" | "esqueci" | "nova_senha" | "bloqueado";

function AuthPage() {
  const { next } = Route.useSearch();
  const destino = next ?? "/dashboard";
  const [checando, setChecando] = useState(true);
  const [modo, setModo] = useState<Modo>("entrar");
  const [emailBloqueado, setEmailBloqueado] = useState("");

  useEffect(() => {
    const { data: sub } = sb.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") { setModo("nova_senha"); setChecando(false); }
    });
    // Link do e-mail de recuperação: a sessão chega pela URL e o evento acima troca o modo.
    if (window.location.hash.includes("type=recovery")) { setModo("nova_senha"); setChecando(false); return () => sub.subscription.unsubscribe(); }
    sb.auth.getSession().then(async ({ data }) => {
      if (data.session && (await api.souSuperAdmin().catch(() => false))) window.location.replace(destino);
      else setChecando(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [destino]);

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Lado da marca (só em telas largas) */}
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(155deg,var(--primary-dark)_0%,var(--primary)_75%,oklch(0.6_0.11_245)_100%)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-abobora/25 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <img src="/logo-wsa-128.png" alt="" className="size-11 rounded-full bg-white shadow-md ring-2 ring-white/50" />
          <div className="leading-tight">
            <strong className="block text-lg font-extrabold tracking-tight">ImobAdm</strong>
            <small className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75">WSA Sistemas</small>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-[2.6rem] leading-[1.1] tracking-tight">
            Todas as empresas de todos os sistemas WSA, num lugar só.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/85">
            Mensalidades no Asaas, régua de cobrança automática e o acesso de cada empresa ligado ao pagamento.
          </p>
          <ul className="mt-8 space-y-3 text-[14px]">
            {[
              ["flat-color-icons:department", "Empresas e sistemas vinculados"],
              ["flat-color-icons:money-transfer", "Mensalidades e pagamentos em tempo real"],
              ["fluent-color:clock-24", "Suspensão automática após 10 dias de atraso"],
            ].map(([ic, t]) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/95 shadow-sm">
                  <IconeColorido nome={ic as never} tamanho={20} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} WSA Sistemas IA</p>
      </aside>

      {/* Formulário */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <img
              src="/logo-wsa.png"
              alt="WSA Sistemas IA"
              width={160}
              height={160}
              className="size-36 rounded-full shadow-[0_18px_40px_-18px_oklch(0.55_0.11_250/0.55)] sm:size-40"
            />
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Painel central · ImobAdm
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_20px_50px_-30px_oklch(0.24_0.03_255/0.35)] sm:p-8">
            {checando ? (
              <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
            ) : modo === "entrar" ? (
              <FormEntrar
                destino={destino}
                onEsqueci={() => setModo("esqueci")}
                onBloqueado={(e) => { setEmailBloqueado(e); setModo("bloqueado"); }}
              />
            ) : modo === "esqueci" ? (
              <FormEsqueci onVoltar={() => setModo("entrar")} />
            ) : modo === "nova_senha" ? (
              <FormNovaSenha destino={destino} />
            ) : (
              <Bloqueado email={emailBloqueado} onVoltar={() => setModo("entrar")} />
            )}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Acesso restrito à administração da WSA Sistemas.
          </p>
        </div>
      </main>
    </div>
  );
}

function Cabecalho({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-2xl tracking-tight">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

function CampoSenha({ id, valor, onChange, autoComplete }: { id: string; valor: string; onChange: (v: string) => void; autoComplete: string }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={ver ? "text" : "password"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="h-11 pl-9 pr-10"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        aria-label={ver ? "Esconder senha" : "Mostrar senha"}
      >
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function FormEntrar({ destino, onEsqueci, onBloqueado }: { destino: string; onEsqueci: () => void; onBloqueado: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setEnviando(false);
      toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      return;
    }
    const pode = await api.souSuperAdmin().catch(() => false);
    if (!pode) {
      await sb.auth.signOut();
      setEnviando(false);
      onBloqueado(email.trim());
      return;
    }
    window.location.replace(destino);
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
      <Cabecalho titulo="Entrar" texto="Use o e-mail e a senha do seu login WSA." />
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus className="h-11 pl-9" placeholder="voce@wsasistemas.com.br" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="senha">Senha</Label>
          <button type="button" onClick={onEsqueci} className="text-xs font-medium text-primary hover:underline">
            Esqueci minha senha
          </button>
        </div>
        <CampoSenha id="senha" valor={senha} onChange={setSenha} autoComplete="current-password" />
      </div>
      <Button type="submit" disabled={enviando} className="menu-ativo h-11 w-full text-[15px] font-semibold hover:opacity-95">
        {enviando ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
      </Button>
    </form>
  );
}

function FormEsqueci({ onVoltar }: { onVoltar: () => void }) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth` });
    setEnviando(false);
    if (error) { toast.error(mensagemErro(error)); return; }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="space-y-5">
        <Cabecalho titulo="Verifique seu e-mail" texto={`Se ${email} tiver login, chega em instantes um link para criar uma senha nova.`} />
        <Button variant="outline" className="h-11 w-full" onClick={onVoltar}>Voltar para o login</Button>
      </div>
    );
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      <Cabecalho titulo="Esqueci minha senha" texto="Informe o e-mail do login. Enviaremos um link para criar uma senha nova." />
      <div className="space-y-1.5">
        <Label htmlFor="email-rec">E-mail</Label>
        <Input id="email-rec" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="h-11" />
      </div>
      <Button type="submit" disabled={enviando} className="menu-ativo h-11 w-full font-semibold">
        {enviando ? <Loader2 className="size-4 animate-spin" /> : "Enviar link"}
      </Button>
      <button type="button" onClick={onVoltar} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">
        Voltar para o login
      </button>
    </form>
  );
}

function FormNovaSenha({ destino }: { destino: string }) {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) { toast.error("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (senha !== confirma) { toast.error("As duas senhas não são iguais."); return; }
    setEnviando(true);
    const { error } = await sb.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) { toast.error(mensagemErro(error)); return; }
    toast.success("Senha alterada.");
    window.location.replace(destino);
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <Cabecalho titulo="Criar senha nova" texto="Mínimo de 8 caracteres." />
      <div className="space-y-1.5">
        <Label htmlFor="nova">Nova senha</Label>
        <CampoSenha id="nova" valor={senha} onChange={setSenha} autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirma">Repita a senha</Label>
        <CampoSenha id="confirma" valor={confirma} onChange={setConfirma} autoComplete="new-password" />
      </div>
      <Button type="submit" disabled={enviando} className="menu-ativo h-11 w-full font-semibold">
        {enviando ? <Loader2 className="size-4 animate-spin" /> : "Salvar e entrar"}
      </Button>
    </form>
  );
}

function Bloqueado({ email, onVoltar }: { email: string; onVoltar: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="size-7" />
      </span>
      <div>
        <h2 className="font-display text-2xl tracking-tight">Acesso bloqueado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O login <b className="text-foreground">{email}</b> existe, mas não tem permissão para o painel central.
          Só a administração da WSA Sistemas entra aqui.
        </p>
      </div>
      <Button variant="outline" className="h-11 w-full" onClick={onVoltar}>Entrar com outro login</Button>
    </div>
  );
}
