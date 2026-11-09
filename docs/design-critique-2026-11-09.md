# Revisão de design: ImobAdm WSA (09/11/2026)

Escopo: Painel, Empresas, ficha da empresa, Funil de Vendas, Leads & Contatos (com a ficha do lead), Relatórios
Comerciais e Facebook e Instagram, em 1366 px e 390 px (celular), com dados de exemplo.
Base: design system aprovado do imobdocerias (tokens em `src/styles.css`, ícones coloridos Iconify, Fraunces e
Plus Jakarta Sans). Nada foi implementado; esta lista é para aprovação.

## Impressão geral
O painel é consistente, legível e parece um produto só. Os números importantes aparecem primeiro e cada tela tem uma
ação principal clara. Os maiores ganhos estão em três frentes:
- **Painel:** a régua explicativa fica acima da lista do que precisa de ação, e deveria ficar abaixo.
- **Celular:** os indicadores ocupam a tela inteira antes do conteúdo.
- **Acessibilidade:** os selos de atraso têm contraste baixo.

## Uso
| O que foi visto | Gravidade | Sugestão |
|---|---|---|
| No celular, os 4 indicadores (Leads, Painel, Relatórios) empilham em cartões altos e empurram a lista para baixo da dobra | 🟡 Moderado | Grade 2×2 compacta no celular (ícone menor, sem a linha de detalhe) |
| Na ficha da empresa, o botão **"Pago"** da tabela de mensalidades parece um status, não uma ação | 🟡 Moderado | Trocar para **"Dar baixa"** e usar o ícone de check |
| A Régua de cobrança (texto explicativo) aparece no Painel **antes** da lista "Vão ser suspensas", que é o que pede ação | 🟡 Moderado | Subir a lista de ações; deixar a régua embaixo ou recolhível ("Como funciona a régua") |
| No Funil, as 8 colunas pedem rolagem lateral sem nenhum aviso; arrastar não funciona bem no celular | 🟡 Moderado | Sombra/seta de "tem mais à direita" e colunas vazias mais estreitas; no celular, lista agrupada por etapa (mudar etapa pela ficha, que já existe) |
| No menu lateral, com tela de 900 px de altura, os itens de Configurações ficam escondidos atrás de "Sair", sem indicação de rolagem | 🟢 Leve | Diminuir o espaçamento vertical dos itens ou mostrar um degradê no fim da lista |
| Em Leads, os filtros ocupam duas linhas (origem e temperatura) | 🟢 Leve | Juntar numa barra só, com a temperatura como menu suspenso |
| Na tabela de vínculos da empresa, há o liga/desliga e também o botão "Desligar" | 🟢 Leve | Manter só um controle (o liga/desliga) e passar "Desligar vínculo" para um menu "⋯" |

## Hierarquia visual
- **O que chama o olho primeiro:** os indicadores no topo e o título em Fraunces. Está certo em todas as telas.
- **Ordem de leitura:** boa em Leads, Funil e Relatórios. No Painel, a régua (bonita, mas informativa) rouba o
  segundo lugar da lista de suspensões.
- **Ênfase:** a ficha do lead acerta: próximo passo em destaque, "Por que quente?" com os pontos, respostas e histórico.
  Na ficha da empresa, os 4 botões do topo têm o mesmo peso; "Registrar pagamento" (verde) está certo como principal.

## Consistência
| Elemento | O que destoa | Sugestão |
|---|---|---|
| Botão "Ver todas" (Painel) | Fundo bege, diferente do botão contornado das outras telas | Usar o mesmo `variant="outline"` |
| Barras de gráfico | Painel usa uma cor por sistema; Relatórios usa só azul | Padronizar: cor por sistema quando a barra é um sistema, azul nos demais |
| Textos | "1 mornos · 1 frios" (plural fixo); "Asaas: received" em inglês no histórico | Plural correto; traduzir os eventos do Asaas (recebido, confirmado, vencido…) |
| Selos de etapa | "Qualificação" e "Demonstração" usam o mesmo azul de "Novo lead" | Dar tons próprios às etapas (já existem `abobora`, `warning`, `success`) |

## Acessibilidade (contraste calculado pelos tokens)
| Combinação | Contraste | AA texto pequeno (4,5) |
|---|---|---|
| Texto principal sobre o fundo | 15,1 | ✅ |
| Texto secundário (muted) sobre fundo / cartão | 5,5 / 6,0 | ✅ |
| Texto branco no botão azul | 4,8 | ✅ (no limite) |
| **Selo de atraso (warning sobre warning-soft)** | **3,9** | ❌ |
| Selo "em breve" | 5,6 | ✅ |
| Selo verde (success sobre success-soft) | 4,6 | ✅ (no limite) |

- **Áreas de toque:** os filtros têm cerca de 32 px de altura e o "×" das linhas do Ganho é pequeno. No celular, o ideal é 44 px.
- **Teclado:** arrastar os cards do Funil não funciona pelo teclado. A alternativa (mudar a etapa pela ficha) existe; falta deixar isso visível no card.
- **Ícones:** são decorativos e estão junto de texto. Ok.

## O que funciona bem
- A identidade é a mesma do imobdocerias em todo o painel: cores, fontes, ícones coloridos e cartões.
- A ficha do lead explica a classificação ("Por que quente?") e já mostra o próximo passo com prazo.
- Os estados vazios têm texto útil e ação ("Nenhum lead ainda… aparecem aqui sozinhos").
- O Funil prioriza os quentes no topo de cada coluna e marca o atrasado em vermelho.
- Os Relatórios respondem às perguntas certas: de onde vem, quanto converte, por que perde.

## Prioridades (para aprovar)
1. **Escurecer o texto dos selos de atraso.** Hoje o contraste é 3,9; o mínimo é 4,5. Basta ajustar um token (`--warning` para o texto do selo).
2. **Painel: lista "Vão ser suspensas" antes da régua.** O que pede ação vem primeiro; a régua fica recolhível.
3. **Indicadores em 2×2 no celular.** O conteúdo aparece sem rolar.
4. **"Pago" → "Dar baixa" e um controle só nos vínculos.** Ações claras, sem duplicidade.
5. **Textos:** plural certo e eventos do Asaas em português.
6. **Funil:** aviso de rolagem lateral e lista por etapa no celular.
7. **Menu lateral:** espaçamento ou degradê para mostrar que há mais itens.
