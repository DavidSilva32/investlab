# Design system do InvestLab

Esta documentação orienta novas páginas e mudanças visuais relevantes. A implementação dos tokens fica em `src/app/globals.css`; os componentes reutilizáveis ficam em `src/components/ui`.

## Direção visual

- O tema escuro da Estratégia é a referência visual inicial; o tema claro continua sendo suportado e precisa manter contraste e hierarquia equivalentes.
- Apresente primeiro a informação que ajuda a decidir. Use texto curto, valores importantes em destaque e detalhes explicativos sob demanda.
- Use gráficos quando ajudarem a comparar composição, evolução, concentração ou cenários. Evite métricas e ornamentos sem uma decisão associada.
- Use `Card`, `Sheet`, `Collapsible`, `Skeleton`, `Table` e os demais componentes shadcn existentes antes de criar padrões locais.
- Tipografia e espaçamento seguem as famílias e escalas do Tailwind já configuradas. Priorize título claro, valor tabular legível, texto secundário com contraste suficiente e espaçamento regular; não introduza escalas paralelas.

## Tokens de cor

Use as variáveis CSS existentes ou suas classes Tailwind semânticas. Não replique valores hex/OKLCH em componentes.

| Uso                          | Tokens                                                                                                                          | Significado                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Superfícies e texto          | `background`, `foreground`, `card`, `muted`, `border`, `primary`, `destructive`                                                 | Estrutura e hierarquia geral, com valores próprios para tema claro/escuro                                        |
| Renda fixa                   | `asset-class-fixed-income`                                                                                                      | Laranja                                                                                                          |
| Ações brasileiras            | `asset-class-brazilian-equities`                                                                                                | Azul                                                                                                             |
| ETFs internacionais          | `asset-class-international-etfs`                                                                                                | Roxo                                                                                                             |
| FIIs                         | `asset-class-fiis`                                                                                                              | Verde                                                                                                            |
| Classe ampla ou desconhecida | `asset-class-neutral`                                                                                                           | Neutro; não inferir classe por proximidade de cor                                                                |
| Estados operacionais         | `status-success`, `status-warning`, `status-danger`, `status-info`                                                              | Sucesso, alerta, erro e informação; não são cores de classe de ativo                                             |
| Finalidade/destino           | `destination-reserve`, `destination-personal`, `destination-long-term`, `destination-purpose-unknown`, `destination-unassigned` | Reserva, objetivos pessoais, longo prazo, finalidade não definida e sem destino; não representam classe de ativo |
| Séries genéricas em gráficos | `chart-category-1` a `chart-category-6`                                                                                         | Categorias sem significado financeiro fixo, como instituições; não usar como cor de classe, destino ou estado    |

Os tokens de classe mantêm a mesma identidade em claro e escuro, com luminosidade ajustada para o fundo. Cores não devem ser o único meio de explicar um estado: associe-as a texto, ícone ou rótulo. Use texto principal/secundário pelos tokens de foreground, não pela cor de classe.

## Auditoria inicial

- `src/app/globals.css` já centraliza superfícies e tipografia de foreground em OKLCH, com variantes clara/escura. Os tokens de classe de ativo e seus aliases Tailwind também existem e são reutilizados por `src/lib/portfolio-asset-class-colors.ts`; a referência Estratégia mantém o mapa aprovado.
- A visão “Patrimônio por destino” tem finalidade própria, diferente de classe. Sua paleta foi ligada a tokens `destination-*` nesta entrega.
- `portfolio-distribution-charts.tsx` usa tokens de paleta indexada para categorias genéricas, como instituições; séries com significado financeiro fixo usam os tokens semânticos correspondentes.
- Loading usa tanto `AppPageSkeleton` compartilhado quanto skeletons locais mais específicos. A consistência deve ser avaliada por página e por conteúdo, sem forçar a mesma silhueta em todas as rotas.
- Cores de estados operacionais ainda aparecem como utilitários locais em diferentes páginas. Os tokens `status-*` fornecem o ponto comum para migração incremental; esta primeira entrega não redesenha nem reescreve todas as páginas.

## Gráficos e dados

- Use `ChartContainer`, `ChartTooltip` e `ChartTooltipContent` de `src/components/ui/chart` com Recharts.
- Configure séries por identificador estável e use os tokens semânticos correspondentes. Não derive a cor da posição ou ordenação do dado.
- Preserve unidade, período/data e legenda. O tooltip deve identificar a série/classe além do valor.
- Dado ausente não é zero. Mostre estado vazio/limitação em vez de desenhar uma série enganosa.

## Interação e feedback

- Reutilize os controles shadcn existentes, com rótulo associado, foco visível e uso por teclado.
- Validação de campo permanece junto ao campo. Feedback transitório de operação usa Sonner; conteúdo persistente, limitações e erro de carregamento com retry permanecem na página.
- Loading local usa skeleton ou indicador no controle. Reserve toast de carregamento para processamento prolongado.
- Prefira layouts que refluam em telas estreitas, preservem ordem de leitura e não causem rolagem horizontal acidental.
