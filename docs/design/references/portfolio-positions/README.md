# Carteira — Posições

## Contexto funcional

- Rota: `/portfolio?view=positions`, dentro da carteira geral.
- Objetivo principal: consultar posições atuais importadas e cadastradas manualmente; ordenar a tabela e distinguir a origem e a base do valor.
- Fluxo da página: `AppShell` → texto contextual e link `Importar dados` → abas `Visão geral`, `Posições` e `Movimentações` → posições atuais → posições manuais.
- Tabela de posições: Produto, Código, Quantidade, Instituição, Emissão, Vencimento e Valor atual. Todos os cabeçalhos permitem ordenação; há paginação de 10 itens, rolagem horizontal em telas estreitas e mensagem vazia `Importe um arquivo da B3 ou adicione uma posição manual.`
- Valor atual preserva a origem e a data observada: dados importados indicam o último valor informado pela B3; estimativas de CDB mostram limites, data-base e configuração quando existentes; registros manuais identificam o valor informado, a moeda, a data observada e, quando aplicável, conversão registrada ou ausência de conversão.
- Ações existentes: importar dados; ajustar as taxas de CDBs elegíveis; excluir posições importadas; expandir a lista manual; adicionar, editar e remover posição manual. A remoção pede confirmação. Operações usam `/api/positions/manual`; importação e taxa preservam suas rotas atuais.
- Lista manual: estado vazio `Nenhuma posição manual cadastrada.`; em estado preenchido, abre por controle expansível com quantidade, produto/código, quantidade, valor original, conversão e datas disponíveis, classe e origem manual. Editar abre o mesmo formulário; remover usa confirmação.
- Formulário manual: `Ativo ou produto`, `Classe`, `Subclasse`, `Geografia`, `Ticker ou código (opcional)`, `Instituição (opcional)`, `Quantidade`, `Moeda` (BRL, USD ou EUR), `Como informar o valor` (valor total ou preço por unidade), respectivo valor e `Data do valor`. As opções de classe são `Renda fixa`, `Renda variável`, `Fundos`, `Criptoativos`, `Imóveis` e `Outros`; não são opções as classes específicas Ações brasileiras, ETFs internacionais ou FIIs. Para moeda estrangeira, exibe `Valor convertido para BRL (opcional)` e `Data da conversão`. Ao selecionar classe diferente, a subclasse é limpa. Classe tem validação inline; falhas e sucesso de API usam toast; durante gravação, o botão fica desabilitado.
- Estados a preservar: carregando e erro/retry do carregamento da carteira; tabela vazia e preenchida, ordenação e paginação; lista manual vazia, recolhida e expandida; criação e edição; validação de classe; moeda BRL e estrangeira; gravação e falhas/sucesso; confirmação de remoção.

## Referências propostas

As duas imagens abaixo são **mockups gerados por IA**, não capturas do produto. A composição usa os componentes, textos, ações e dados que a rota realmente suporta. Os valores e registros visíveis são sintéticos e servem apenas para ilustrar hierarquia e estados. A imagem de Posições mostra uma carteira coerente com seis registros, incluindo quatro manuais. Uma revisão de contrato substituiu os rótulos estreitos de classe do primeiro rascunho por `Renda variável` e `Fundos`, que são as opções reais; estes rótulos usam `asset-class-neutral`, sem inferir identidade pelo ticker/produto. Renda fixa permanece laranja. As classes específicas ações brasileiras/ETFs internacionais/FIIs mantêm seus tokens no sistema e só podem receber essas cores quando a fonte do dado as identificar explicitamente. A identidade azul da interface usa tokens globais separados.

| Experiência / estado | Referência e origem | Escopo funcional representado | Layout implementado | Verificação estrutural | Comparação visual real | Aprovação do usuário |
| --- | --- | --- | --- | --- | --- | --- |
| `/portfolio?view=positions`, dados carregados, lista manual expandida | [proposal-positions-contract-corrected.png](./proposal-positions-contract-corrected.png) — mockup gerado por IA para esta tarefa; revisão dos rótulos de classe feita após conferência do formulário/API | AppShell, texto contextual, abas reais, ações da carteira, tabela ordenável/paginada, origem dos valores, lista e ações manuais | Pendente | Pendente | Pendente — nenhuma comparação com a implementação foi feita | Sim — composição aprovada pelo usuário em 03/10/2026; rótulos sintéticos foram corrigidos para o contrato suportado antes da implementação |
| Cadastro manual aberto, estado inicial em BRL | [proposal-manual-position.png](./proposal-manual-position.png) — mockup gerado por IA para esta tarefa; sem captura de tela | Campos reais do formulário, selects, data atual, ações Salvar/Cancelar e descrição sobre cotação/conversão manual | Pendente | Pendente | Pendente — nenhuma comparação com a implementação foi feita | Sim — composição aprovada pelo usuário em 03/10/2026 |

## Decisões visuais da proposta

- A tabela principal aparece antes da lista manual para priorizar consulta das posições; no código atual a lista manual aparece primeiro. Essa mudança de hierarquia requer aprovação antes da implementação.
- A lista manual permanece uma lista de linhas, sem se transformar em uma tabela ou em uma nova funcionalidade.
- Identidades semânticas aplicáveis: renda fixa laranja, ações brasileiras azul, ETFs internacionais roxo e FIIs verde. Classes amplas ou desconhecidas mantêm a cor neutra definida pelo mapeamento existente. Fundo escuro, superfície, texto e primária continuam seguindo os tokens atuais de tema.
- A tela representa o tema escuro. A versão final também deverá manter o tema claro e os estados responsivos/acessíveis do sistema.
- O primeiro arquivo [proposal-positions.png](./proposal-positions.png) é o rascunho aprovado antes da auditoria de contrato e está supersedido: seus exemplos de classe Ações brasileiras, ETFs internacionais e FIIs não são opções desta experiência. Use o arquivo contract-corrected como a proposta vigente.
- A proposta não altera regras financeiras, métodos de cálculo, dados, validação, endpoints ou persistência. Também não define visual final para carregamento, erro, vazio, breakpoint móvel ou confirmação de exclusão; esses estados serão preservados e refinados durante a implementação aprovada.

## Referência anterior

[manual-position-reference.png](./manual-position-reference.png) é o mockup anterior, mantido apenas como histórico. Ele mostra seletor de conta, navegação e preço automático que não existem no fluxo real; não deve orientar implementação.

## Limites de uso

Movimentações (`/portfolio?view=movements`) e demais páginas não fazem parte desta experiência. O protótipo não autoriza alterar a navegação, o contrato dos dados nem outras páginas. A referência não é evidência de fidelidade visual: comparação só poderá ser registrada após captura real da implementação em desktop e móvel.
