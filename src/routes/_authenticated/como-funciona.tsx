import { createFileRoute } from "@tanstack/react-router";

import { Cartao, Pagina } from "@/components/adm/ui";

export const Route = createFileRoute("/_authenticated/como-funciona")({
  head: () => ({ meta: [{ title: "Como funciona — ImobAdm WSA" }] }),
  component: ComoFunciona,
});

const ETAPAS = [
  ["1. Empresa", "Cada cliente que paga é uma empresa (CNPJ). Ela pode usar vários sistemas WSA."],
  ["2. Vínculo", "A empresa é ligada ao lugar dos dados em cada sistema: um schema (ImobDoces: loja_<slug>) ou um tenant (ImobSystem, ImobDesk…). A mensalidade é a soma dos vínculos."],
  ["3. Assinatura no Asaas", "Uma assinatura mensal por empresa. O cliente paga por PIX, boleto ou cartão no link da fatura."],
  ["4. Webhook", "O Asaas avisa cada cobrança criada, paga, vencida ou estornada. O pagamento baixa a fatura e reativa o acesso na hora."],
  ["5. Régua (00:05)", "Todo dia recalcula todas as empresas e manda os avisos D-3, D+1, D+5 e D+8 por WhatsApp e e-mail, sem repetir."],
  ["6. Suspensão", "Passou de 10 dias de atraso, a empresa fica suspensa no 11º dia e o acesso cai em todos os sistemas dela."],
  ["7. Trava nos sistemas", "Cada site pergunta public.empresa_liberada(app, schema/tenant) ao abrir, no login, ao voltar para a aba e a cada 5 minutos (Fase 9)."],
] as const;

function ComoFunciona() {
  return (
    <Pagina titulo="Como funciona" texto="O caminho do dinheiro até o acesso, em todos os sistemas WSA do Supabase central.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao icone="flat-color-icons:timeline" titulo="Do cadastro à suspensão">
          <ol className="space-y-3">
            {ETAPAS.map(([t, d]) => (
              <li key={t} className="rounded-lg border border-border p-3">
                <b className="text-sm">{t}</b>
                <p className="mt-0.5 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </Cartao>
        <div className="space-y-4">
          <Cartao icone="flat-color-icons:database" titulo="Onde ficam os dados">
            <ul className="space-y-2 text-sm">
              <li><code className="rounded bg-muted px-1.5">adm.empresas</code> · cliente, contato, modalidade, situação</li>
              <li><code className="rounded bg-muted px-1.5">adm.vinculos</code> · empresa × sistema × schema/tenant, valor</li>
              <li><code className="rounded bg-muted px-1.5">adm.faturas</code> · uma por mês, ligada ao pagamento do Asaas</li>
              <li><code className="rounded bg-muted px-1.5">adm.eventos</code> · histórico de tudo (situação, avisos, pagamentos)</li>
              <li><code className="rounded bg-muted px-1.5">adm.regua</code> · tolerância e passos dos avisos</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">O schema adm não fica exposto na API: o painel só fala com funções que conferem o super admin.</p>
          </Cartao>
          <Cartao icone="fluent-color:shield-checkmark-24" titulo="Situações">
            <ul className="space-y-2 text-sm">
              <li><b className="text-success">Em dia</b> · nenhuma fatura vencida</li>
              <li><b className="text-warning-strong">Em atraso</b> · vencida há 1 a 10 dias (ou com prazo extra): continua no ar</li>
              <li><b className="text-destructive">Suspensa</b> · mais de 10 dias, ou suspensa à mão: fora do ar</li>
              <li><b className="text-info">Cortesia</b> · não cobra e nunca suspende</li>
              <li><b>Cancelada</b> · sem acesso</li>
            </ul>
          </Cartao>
        </div>
      </div>
    </Pagina>
  );
}
