# Como ligar uma plataforma ao acesso do comprador

A regra fica no banco central. Cada plataforma precisa de 1 commit e 1 deploy próprios, uma única vez.

## No repositório da plataforma
- [ ] Copiar `primeiro-acesso.ts` para `src/lib/primeiro-acesso.ts`
- [ ] Depois do login com senha, chamar `verificarPrimeiroAcesso()`:
  - `vencida`: mostrar `SENHA_VENCIDA`;
  - `trocar`: mandar para a tela de nova senha.
- [ ] Na sessão restaurada, chamar `exigirNovaSenha('<rota da tela de nova senha>')`
- [ ] Na tela de nova senha, chamar `concluirPrimeiroAcesso()` depois do `updateUser` dar certo
- [ ] Na tela de login, iniciar o e-mail com `emailDoLink()`
- [ ] Testar: senha provisória → pede nova senha → entra; segundo login não pede mais

## No banco central (migration aditiva)
- [ ] Criar `adm.provisionar_<sistema>(usuario uuid, ref text, email text, nome text)`, que coloca a pessoa como dona da empresa. Modelo: `adm.provisionar_suprimentos`
- [ ] Preencher `adm.sistemas.funcao_provisionar` e, se o link for diferente de `acessos.aplicativos.url`, `adm.sistemas.url_login`

O botão **Liberar acesso** só aparece na plataforma depois do preenchimento de `funcao_provisionar`.
