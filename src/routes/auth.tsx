import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — ImobSystem" },
      { name: "description", content: "Acesse sua conta do ImobSystem." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const destination = next ?? "/dashboard";
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(destination);
      else setChecking(false);
    });
  }, [destination]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full md:grid-cols-2">
      {/* Brand */}
      <div className="hidden bg-sidebar text-sidebar-foreground md:flex md:flex-col md:justify-between md:p-10">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">ImobSystem</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            A gestão da sua imobiliária, enfim sob controle.
          </h2>
          <p className="mt-3 text-sm text-sidebar-foreground/80">
            CRM, catálogo de lançamentos e simulador em uma única plataforma.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">
          © {new Date().getFullYear()} ImobSystem
        </p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-semibold">ImobSystem</span>
          </div>

          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <LoginCard onSuccess={() => window.location.replace(destination)} />
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <SignupCard onSuccess={() => window.location.replace(destination)} destination={destination} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function LoginCard({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      toast.error("Falha ao entrar", { description: error.message });
      return;
    }
    toast.success("Bem-vindo(a) de volta!");
    onSuccess();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse com seu e-mail e senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">E-mail</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@imobiliaria.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-senha">Senha</Label>
            <Input
              id="login-senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SignupCard({ onSuccess, destination }: { onSuccess: () => void; destination: string }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [imob, setImob] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        emailRedirectTo: `${window.location.origin}${destination}`,
        data: {
          nome,
          imobiliaria_nome: imob || "ImobSystem Demo Ltda",
        },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("Falha ao criar conta", { description: error.message });
      return;
    }
    toast.success("Conta criada!", {
      description: "Se a confirmação por e-mail estiver ativa, verifique sua caixa de entrada.",
    });
    onSuccess();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>
          O primeiro cadastro cria a imobiliária como <strong>gestor</strong>. Os próximos entram como <strong>corretor</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-nome">Seu nome</Label>
            <Input id="s-nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-imob">Nome da imobiliária <span className="text-muted-foreground text-xs">(1º cadastro)</span></Label>
            <Input id="s-imob" value={imob} onChange={(e) => setImob(e.target.value)} placeholder="ImobSystem Demo Ltda" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-email">E-mail</Label>
            <Input
              id="s-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-senha">Senha</Label>
            <Input
              id="s-senha"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar conta
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
