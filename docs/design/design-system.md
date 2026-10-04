# Design system do InvestLab

Esta documentação orienta novas páginas e mudanças visuais relevantes. A implementação dos tokens fica em `src/app/globals.css`; os componentes reutilizáveis ficam em `src/components/ui`. O contrato compartilhado para geração de referências e validação de fidelidade está em [`design-process.md`](./design-process.md).

## Direção visual

- **Identidade global aprovada em 03/10/2026:** azul. Use os tokens compartilhados de identidade para marca, navegação ativa, foco e ações primárias; não derive identidade global dos tokens das classes de ativos.
- O tema escuro usa superfícies neutras, sem dominante verde ou azul saturada; o tema claro continua suportado e precisa manter contraste e hierarquia equivalentes.
- Apresente primeiro a informação que ajuda a decidir. Use texto curto, valores importantes em destaque e detalhes explicativos sob demanda.
- Use gráficos quando ajudarem a comparar composição, evolução, concentração ou cenários. Evite métricas e ornamentos sem uma decisão associada.
- Use `Card`, `Sheet`, `Collapsible`, `Skeleton`, `Table` e os demais componentes shadcn existentes antes de criar padrões locais.
- Tipografia e espaçamento seguem as famílias e escalas do Tailwind já configuradas. Priorize título claro, valor tabular legível, texto secundário com contraste suficiente e espaçamento regular; não introduza escalas paralelas.

## Tokens de cor

Use as variáveis CSS existentes ou suas classes Tailwind semânticas. Não replique valores hex/OKLCH em componentes.

| Uso                          | Tokens                                                                                                                          | Significado                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Identidade global            | `brand`, `brand-foreground`                                                                                                     | Azul da marca e componentes explicitamente migrados; não representa classe de ativo                              |
| Primitivos legados           | `primary`, `primary-foreground`, `ring`                                                                                         | Tokens shadcn ainda consumidos por telas não migradas; a conversão global é acompanhada na #106                  |
| Superfícies e texto          | `background`, `foreground`, `card`, `muted`, `border`, `destructive`                                                            | Estrutura neutra e hierarquia geral, com valores próprios para tema claro/escuro                                 |
| Renda fixa                   | `asset-class-fixed-income`                                                                                                      | Laranja                                                                                                          |
| Ações e BDRs                 | `asset-class-brazilian-equities`                                                                                                | Azul                                                                                                             |
| ETFs internacionais          | `asset-class-international-etfs`                                                                                                | Roxo                                                                                                             |
| Fundos imobiliários (FIIs)   | `asset-class-fiis`                                                                                                              | Verde                                                                                                            |
| Classe ampla ou desconhecida | `asset-class-neutral`                                                                                                           | Neutro; não inferir classe por proximidade de cor                                                                |
| Estados operacionais         | `status-success`, `status-warning`, `status-danger`, `status-info`                                                              | Sucesso, alerta, erro e informação; não são cores de classe de ativo                                             |
| Finalidade/destino           | `destination-reserve`, `destination-personal`, `destination-long-term`, `destination-purpose-unknown`, `destination-unassigned` | Reserva, objetivos pessoais, longo prazo, finalidade não definida e sem destino; não representam classe de ativo |
| Séries genéricas em gráficos | `chart-category-1` a `chart-category-6`                                                                                         | Categorias sem significado financeiro fixo, como instituições; não usar como cor de classe, destino ou estado    |

Os tokens de classe mantêm a mesma identidade em claro e escuro, com luminosidade ajustada para o fundo. Cores não devem ser o único meio de explicar um estado: associe-as a texto, ícone ou rótulo. Use texto principal/secundário pelos tokens de foreground, não pela cor de classe.

A cor da identidade pode ser azul, assim como a cor de uma classe de ações brasileiras, mas os dois significados continuam independentes: use `brand` para a interface e `asset-class-brazilian-equities` somente para dados identificados como ações brasileiras. Não derive a classe nem sua cor do ticker, produto, subclasse ou proximidade visual. Quando o dado estiver em uma classe ampla ou desconhecida, use `asset-class-neutral`.

Na etapa piloto da #105, o token compartilhado `brand` é consumido somente em Carteira → Posições e cadastro manual. Os tokens shadcn `primary` e as superfícies existentes permanecem temporariamente nas telas e no shell compartilhado; a adoção ampla do azul, a neutralização global das superfícies e a revisão visual rota a rota pertencem à #106. Não faça ajustes manuais isolados nem migre markup de outras páginas dentro da #105.

## Taxonomia de investimentos e nomenclatura oficial

As classes específicas da estratégia usam IDs técnicos estáveis e nomes oficiais definidos em `src/lib/strategy-allocation.ts`. Consulte essa fonte diretamente antes de criar referências, protótipos ou textos de interface. Nunca use um rótulo apresentado como identidade técnica, crie sinônimos ou abreviações, ou altere uma classe com base apenas em ticker, produto, subclasse ou geografia.

| Conceito               | Definição                                                                                                  | Regra de uso                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Categoria ampla        | Classificação geral, como `Renda fixa`, `Renda variável`, `Fundos`, `Criptoativos`, `Imóveis` ou `Outros`. | Preserve valores e usos atuais em formulários, filtros, persistência e regras. `Renda variável` não é sinônimo de `Ações e BDRs`. |
| Classe específica      | Agrupamento identificado por ID estável da estratégia e exibido onde esse dado está disponível.            | Use somente o nome oficial do catálogo e preserve o critério de agrupamento existente.                                            |
| Subclasse              | Detalhe disponível nas opções do produto, como ação, BDR, ETF ou FII.                                      | Não a promova a classe específica nem deduza um grupo sem suporte do modelo.                                                      |
| Instrumento ou produto | Investimento concreto, como CDB, ação, BDR, ETF ou FII.                                                    | Preserve o nome do instrumento; o nome do produto não é automaticamente o nome da classe.                                         |
| Geografia              | Valor geográfico efetivamente suportado, como Brasil, Exterior ou Global.                                  | Não amplie o grupo `international_etfs` para além dos critérios atuais.                                                           |
| Destino                | Finalidade existente, como reserva, objetivos pessoais ou longo prazo.                                     | Use tokens `destination-*`; destino não é classe, subclasse ou instrumento.                                                       |

O modelo não estabelece uma hierarquia completa nem uma correspondência universal entre esses conceitos. Mantenha cada um em sua estrutura e descreva limites em vez de presumir relações.

## Auditoria inicial

- `src/app/globals.css` centraliza superfícies, foregrounds e os valores dos tokens semânticos em OKLCH, com variantes clara/escura. O catálogo específico indexado por ID em `src/lib/strategy-allocation.ts` associa os nomes oficiais às chaves dos tokens de classe.

- A visão “Patrimônio por destino” tem finalidade própria, diferente de classe. Sua paleta foi ligada a tokens `destination-*` nesta entrega.
- `portfolio-distribution-charts.tsx` usa tokens de paleta indexada para categorias genéricas, como instituições; séries com significado financeiro fixo usam os tokens semânticos correspondentes.
- Loading usa tanto `AppPageSkeleton` compartilhado quanto skeletons locais mais específicos. A consistência deve ser avaliada por página e por conteúdo, sem forçar a mesma silhueta em todas as rotas.
- Cores de estados operacionais ainda aparecem como utilitários locais em diferentes páginas. Em `src/app/analyses/_components/fundamentals-grid.tsx`, `stock-analysis-reading.tsx` e `stock-analysis-dashboard.tsx`; em `src/app/strategy/_components/strategy-allocation-workspace.tsx`; e em `src/app/portfolio/_components/manual-position-manager.tsx`, tons locais de âmbar/verde são candidatos a conferir contra os tokens `status-*`. São pontos de auditoria de status, não divergências de classe nem correções confirmadas. Os tokens `status-*` fornecem o ponto comum para migração incremental; esta primeira entrega não redesenha nem reescreve todas as páginas.

## Auditoria de cores — issue #103

- A auditoria da issue #107 confirmou nomes históricos nas referências de Estratégia, Dashboard, concentração da Carteira e Objetivos; seus READMEs agora identificam os arquivos sem regenerá-los. Os nomes novos devem vir do catálogo por ID, e categorias amplas ou séries genéricas continuam distintas. Cores de estado não são divergências de classe semântica.
- As propostas de Análises e Configurações têm conteúdo funcional sem suporte anotado nos respectivos READMEs. É uma pendência documental sobre fidelidade de conteúdo, não uma divergência de paleta confirmada; não redesenhar as imagens nesta entrega.

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
