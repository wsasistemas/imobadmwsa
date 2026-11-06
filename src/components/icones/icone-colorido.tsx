import { addIcon, Icon } from "@iconify/react";

import { DADOS_COLORIDOS, type NomeIcone } from "./icones.data";

// Ícones coloridos (Iconify) embutidos no bundle, gerados por `npm run icones` (mesmo modelo do imobdocerias).
// Só o menu e os ícones ilustrativos ficam coloridos; botões de ação continuam com o ícone de linha (Lucide).
// O @iconify/react troca os ids dos degradês a cada cópia, então o mesmo ícone pode aparecer várias vezes.

for (const [nome, data] of Object.entries(DADOS_COLORIDOS)) addIcon(nome, data);

export type { NomeIcone };

export function IconeColorido({
  nome,
  tamanho = 20,
  className,
}: {
  nome: NomeIcone;
  tamanho?: number;
  className?: string;
}) {
  return <Icon icon={nome} width={tamanho} height={tamanho} className={className} aria-hidden="true" />;
}
