# Prontidão para valuation por emissor

## Estado atual

P/L e P/VP permanecem indisponíveis na Análise Individual e na Comparação de Empresas. A cotação validada de um ticker não comprova a capitalização consolidada do emissor quando há mais de uma classe ou evento societário.

O snapshot do screener confirma consistência entre cotações consultadas, mas ainda não comprova que o conjunto de tickers ativos está completo nem como classes, units e eventos societários se relacionam. A reconciliação atual não valida classe do ticker, composição de units, evidência independente entre fontes, vigência histórica nem o histórico de eventos. A data de mercado também permanece desalinhada para o contexto de valuation.

Não há fórmula aprovada para agregar capitalização de classes. Não derivar ações equivalentes, somar capitalizações de classes ou substituir dados ausentes por estimativas.

## Critérios para habilitar

- Identificar o emissor por CNPJ e obter, para cada data de mercado, o conjunto completo e vigente de tickers e classes negociadas, com fonte, data e vínculo CVM verificáveis.
- Obter, para cada classe, a quantidade de ações em circulação na data considerada, com fonte primária, data de referência e vigência rastreáveis. A metodologia também deve definir, com evidência, o tratamento de ações em tesouraria; se quantidade, vigência ou tratamento não puderem ser confirmados, manter a capitalização indisponível.
- Reconciliar a semântica de cada classe e unit, a composição de units e os eventos societários que alterem a quantidade ou os direitos representados. Divergência ou lacuna mantém a capitalização e os múltiplos indisponíveis.
- Validar a cotação e seu timestamp por ticker e conferir a identidade CVM. Um CNPJ conflitante rejeita a evidência; CNPJ ausente não valida a capitalização do emissor.
- Aprovar e documentar a metodologia de capitalização por emissor com evidência suficiente para reconciliar classes, quantidades e eventos na data considerada. A fórmula e os dados necessários dependem dessa decisão e não estão definidos neste documento.
- Exigir que Análise Individual e Comparação usem a mesma evidência canônica, com fonte, data de mercado, método e data-base fundamental registrados. A comparação exige o mesmo dia de pregão em `America/Sao_Paulo` e fundamentos compatíveis segundo os gates existentes.
- Manter preço e histórico disponíveis quando validados, mesmo que a evidência necessária ao valuation esteja ausente ou pendente.

## Validação de saída

Antes de exibir P/L ou P/VP, cobrir com testes: identidade incorreta; ticker ativo ausente ou duplicado; classe ou composição de unit não reconciliada; evento societário sem vigência confirmada; cotação vencida ou de outro pregão; fundamentos incompatíveis; e equivalência da fonte, data e método nos dois fluxos. Casos sem evidência suficiente devem retornar valor e proveniência do valuation nulos, com motivo explícito, sem afetar a cotação validada.

## Fora desta prontidão

Este documento não aprova fórmula, quantidade de ações, tratamento de tesouraria, valor de capitalização, corte, ranking ou recomendação. A decisão metodológica e as fontes primárias necessárias ainda precisam ser definidas e verificadas antes de implementar o cálculo.
