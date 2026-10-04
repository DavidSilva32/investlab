# Referências visuais

O [inventário de rotas](../active-route-inventory.md) e o [processo de design](../design-process.md) definem experiências, fontes de verdade e critérios de cobertura. Os READMEs de cada área documentam os estados de suas imagens; referências geradas por IA são propostas, salvo quando identificadas explicitamente como aprovadas.

Nomenclatura oficial de classes específicas: `fixed_income` — Renda fixa; `brazilian_equities` — Ações e BDRs; `international_etfs` — ETFs internacionais; `fiis` — Fundos imobiliários (FIIs). Consulte a fonte por ID em `src/lib/strategy-allocation.ts` antes de criar artefatos. Categorias amplas, subclasses, instrumentos, geografias e destinos têm nomes próprios e não são sinônimos dessas classes.

## Estratégia — desktop

- Arquivo: [`strategy/page-desktop.png`](./strategy/page-desktop.png)
- Origem: referência fornecida e aprovada pelo usuário para a experiência da página Estratégia.
- Uso: hierarquia do patrimônio, comparação de composição e fluxo visual do próximo aporte.
- Escopo: referência de uma página; não aplicar o mesmo layout indiscriminadamente a outras áreas.
- Nota: é uma referência fornecida, não uma captura gerada por este fluxo. Nenhuma captura mobile foi aprovada nesta entrega.
- Estados separados: referência criada; contexto funcional parcialmente revisado; layout registrado na issue #94 e não revalidado nesta tarefa; verificação estrutural não registrada por imagem e não revalidada nesta tarefa; comparação visual real pendente; o usuário aprovou esta referência, não a implementação.

Nova captura só é evidência de comparação quando registrar experiência, estado, viewport e resultado observado. Não registrar protótipos ou capturas hipotéticas como validação.

Referências históricas aprovadas ou já utilizadas podem conter nomes anteriores. Não as regenere automaticamente: identifique a nomenclatura antiga no README específico e use o catálogo oficial atual para qualquer imagem nova.
