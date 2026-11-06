import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { STATUS_EMPREENDIMENTO } from "@/lib/empreendimentosMeta";
import { useConstrutoras } from "@/hooks/useConstrutoras";
import { useAuth } from "@/hooks/useAuth";
import {
  useCreateEmpreendimento,
  useUpdateEmpreendimento,
} from "@/hooks/useEmpreendimentos";
import type { Empreendimento, StatusEmpreendimento } from "@/types";
import { ImageUpload } from "./ImageUpload";
import { toast } from "sonner";

type Props = { empreendimento?: Empreendimento };

const emptyForm = {
  nome: "",
  descricao: "",
  construtora_id: "",
  status: "em_lancamento" as StatusEmpreendimento,
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  valor_a_partir_de: "",
  total_unidades: "",
  unidades_disponiveis: "",
  entrega_prevista: "",
  video_url: "",
  tour_360_url: "",
  diferenciais_texto: "",
  ativo: true,
};

export function EmpreendimentoForm({ empreendimento }: Props) {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const { data: construtoras } = useConstrutoras();
  const create = useCreateEmpreendimento();
  const update = useUpdateEmpreendimento();

  const [form, setForm] = useState(emptyForm);
  const [imagens, setImagens] = useState<string[]>([]);
  const [plantas, setPlantas] = useState<string[]>([]);
  const [buscandoCep, setBuscandoCep] = useState(false);

  useEffect(() => {
    if (empreendimento) {
      setForm({
        nome: empreendimento.nome,
        descricao: empreendimento.descricao ?? "",
        construtora_id: empreendimento.construtora_id ?? "",
        status: empreendimento.status,
        cep: empreendimento.cep ?? "",
        endereco: empreendimento.endereco ?? "",
        numero: empreendimento.numero ?? "",
        complemento: empreendimento.complemento ?? "",
        bairro: empreendimento.bairro ?? "",
        cidade: empreendimento.cidade ?? "",
        estado: empreendimento.estado ?? "",
        valor_a_partir_de: empreendimento.valor_a_partir_de?.toString() ?? "",
        total_unidades: empreendimento.total_unidades?.toString() ?? "",
        unidades_disponiveis: empreendimento.unidades_disponiveis?.toString() ?? "",
        entrega_prevista: empreendimento.entrega_prevista ?? "",
        video_url: empreendimento.video_url ?? "",
        tour_360_url: empreendimento.tour_360_url ?? "",
        diferenciais_texto: (empreendimento.diferenciais ?? []).join("\n"),
        ativo: empreendimento.ativo,
      });
      setImagens(empreendimento.imagens ?? []);
      setPlantas(empreendimento.plantas ?? []);
    }
  }, [empreendimento]);

  async function buscarCep() {
    const cep = form.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await r.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setForm((f) => ({
        ...f,
        endereco: data.logradouro ?? f.endereco,
        bairro: data.bairro ?? f.bairro,
        cidade: data.localidade ?? f.cidade,
        estado: data.uf ?? f.estado,
      }));
    } catch {
      toast.error("Falha ao consultar CEP");
    } finally {
      setBuscandoCep(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !usuario) {
      toast.error("Nome é obrigatório");
      return;
    }
    const payload: Partial<Empreendimento> = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      construtora_id: form.construtora_id || null,
      status: form.status,
      cep: form.cep || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      valor_a_partir_de: form.valor_a_partir_de ? Number(form.valor_a_partir_de) : null,
      total_unidades: form.total_unidades ? Number(form.total_unidades) : null,
      unidades_disponiveis: form.unidades_disponiveis
        ? Number(form.unidades_disponiveis)
        : null,
      entrega_prevista: form.entrega_prevista || null,
      video_url: form.video_url || null,
      tour_360_url: form.tour_360_url || null,
      diferenciais: form.diferenciais_texto
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      imagens,
      plantas,
      ativo: form.ativo,
    };

    if (empreendimento) {
      await update.mutateAsync({ id: empreendimento.id, patch: payload });
      navigate({ to: "/empreendimentos/$id", params: { id: empreendimento.id } });
    } else {
      const created = await create.mutateAsync({
        ...payload,
        nome: payload.nome!,
        imobiliaria_id: usuario.imobiliariaId,
      });
      navigate({ to: "/empreendimentos/$id", params: { id: created.id } });
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <form onSubmit={onSubmit}>
      <Tabs defaultValue="dados" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="endereco">Endereço</TabsTrigger>
          <TabsTrigger value="midia">Mídia</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Construtora</Label>
                  <Select
                    value={form.construtora_id || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, construtora_id: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {(construtoras ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm({ ...form, status: v as StatusEmpreendimento })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_EMPREENDIMENTO.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  rows={4}
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="diferenciais">Diferenciais (um por linha)</Label>
                <Textarea
                  id="diferenciais"
                  rows={4}
                  placeholder={"Piscina\nAcademia\nSalão de festas"}
                  value={form.diferenciais_texto}
                  onChange={(e) => setForm({ ...form, diferenciais_texto: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="ativo"
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                />
                <Label htmlFor="ativo">Ativo no catálogo</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="endereco">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Localização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cep"
                      value={form.cep}
                      onChange={(e) => setForm({ ...form, cep: e.target.value })}
                      onBlur={buscarCep}
                      placeholder="00000-000"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={buscarCep}
                      disabled={buscandoCep}
                    >
                      Buscar
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="endereco">Endereço</Label>
                  <Input
                    id="endereco"
                    value={form.endereco}
                    onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input
                    id="complemento"
                    value={form.complemento}
                    onChange={(e) => setForm({ ...form, complemento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input
                    id="bairro"
                    value={form.bairro}
                    onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={form.cidade}
                    onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado</Label>
                  <Input
                    id="estado"
                    maxLength={2}
                    value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="midia">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Imagens e vídeos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ImageUpload
                value={imagens}
                onChange={setImagens}
                folder="imagens"
                label="Galeria de fotos"
              />
              <ImageUpload
                value={plantas}
                onChange={setPlantas}
                folder="plantas"
                label="Plantas"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="video">Vídeo (URL)</Label>
                  <Input
                    id="video"
                    value={form.video_url}
                    onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                    placeholder="https://youtube.com/…"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tour">Tour 360º (URL)</Label>
                  <Input
                    id="tour"
                    value={form.tour_360_url}
                    onChange={(e) => setForm({ ...form, tour_360_url: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comercial">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comercial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="valor">Valor a partir de (R$)</Label>
                  <Input
                    id="valor"
                    type="number"
                    min="0"
                    value={form.valor_a_partir_de}
                    onChange={(e) =>
                      setForm({ ...form, valor_a_partir_de: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entrega">Entrega prevista</Label>
                  <Input
                    id="entrega"
                    type="date"
                    value={form.entrega_prevista}
                    onChange={(e) => setForm({ ...form, entrega_prevista: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total">Total de unidades</Label>
                  <Input
                    id="total"
                    type="number"
                    min="0"
                    value={form.total_unidades}
                    onChange={(e) => setForm({ ...form, total_unidades: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disp">Unidades disponíveis</Label>
                  <Input
                    id="disp"
                    type="number"
                    min="0"
                    value={form.unidades_disponiveis}
                    onChange={(e) =>
                      setForm({ ...form, unidades_disponiveis: e.target.value })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tipologias e condições de pagamento são gerenciadas na página do empreendimento
                após a criação.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => history.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando..." : empreendimento ? "Salvar alterações" : "Cadastrar"}
        </Button>
      </div>
    </form>
  );
}
