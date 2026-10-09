# Issue #124 — latência da análise e comparação

## Escopo avaliado

Os fluxos são `GET /api/analyses/stocks/[ticker]` (Análise individual) e
`POST /api/analyses/companies/compare` (Comparar empresas). As etapas incluem
provedor de mercado, leitura dos dados da CVM, consultas ao cache do Neon e
cálculo das métricas. A comparação já carregava emissores distintos em
paralelo; o trabalho abaixo trata dependências desnecessárias e emissor repetido.

## Baseline reproduzível antes do ajuste

Não foi possível coletar duração ponta a ponta de provedores reais neste
ambiente. A tentativa de medição somente leitura falhou antes da chamada HTTP
porque o DNS não resolveu `brapi.dev` (`EAI_AGAIN`). Não foram consultadas nem
alteradas tabelas do Neon. Por isso, este documento não apresenta tempos reais
antes/depois nem um limite arbitrário de latência.

O baseline estrutural foi reconstruído no fluxo anterior e é coberto pelos
testes que verificam o comportamento otimizado:

- BRAPI: a cotação era aguardada antes de iniciar perfil e histórico. Para três
  respostas independentes, o caminho crítico somava a cotação ao mais lento
  entre perfil e histórico.
- CVM: o ITR atual só começava depois de concluir os arquivos DFP. Os outros
  arquivos DFP já eram carregados em paralelo.
- Comparação: três tickers de dois CNPJs (duas classes de um emissor e uma do
  outro) acionavam três leituras/carregamentos de fundamentos; o agrupamento
  por CNPJ ocorria depois dessas chamadas.
- Cache frio concorrente: requisições simultâneas do mesmo ticker podiam
  consultar a CVM e salvar a mesma atualização mais de uma vez.

## Ajustes e medidas verificáveis

- BRAPI agora inicia cotação, perfil e histórico juntos. Se a cotação falha, as
  chamadas opcionais são canceladas; indisponibilidade isolada de perfil ou
  histórico continua parcial, e o histórico mantém a tentativa de cinco anos
  seguida da alternativa de um ano.
- A CVM inicia o ITR atual junto com os arquivos DFP independentes. A busca de
  ITR histórico continua condicionada aos saldos anuais, e o ITR do ano
  anterior continua condicionado à validação usada pelo cálculo.
- A comparação agrupa classes pelo CNPJ normalizado antes de carregar
  fundamentos. O cenário de três tickers e dois emissores passa de três para
  duas chamadas de fundamentos, mantendo as classes selecionadas na resposta.
- Um cache em andamento por ticker, CNPJ e versão compartilha atualizações
  simultâneas de fundamentos e evita duplicar consulta e persistência. Falhas
  removem a entrada em andamento e permitem uma nova tentativa.

Os testes de concorrência verificam que as solicitações BRAPI e o ITR atual
começam enquanto a resposta DFP ainda está pendente. Esses testes medem a
ordenação e a quantidade de trabalho com respostas controladas; não simulam a
latência de serviços externos nem são apresentados como tempo de produção.

## Instrumentação para medições no ambiente da aplicação

Os logs estruturados permitem agrupar uma requisição por `requestId` e separar
as etapas sem registrar payloads ou credenciais:

- `stock_market_provider_request_completed` e
  `stock_market_provider_request_failed`: operação, status e duração BRAPI.
- `stock_fundamentals_cvm_issuer_resolved` e
  `stock_fundamentals_cvm_document_completed`: duração do cadastro e de cada
  arquivo da CVM.
- `stock_fundamentals_cache_checked`: duração da leitura do Neon e resultado
  hit/miss, compatibilidade de CNPJ e número de períodos em cache.
- `stock_analysis_stage_timing` e
  `stock_issuer_fundamentals_stage_timing`: mercado, busca de emissor, fallback
  de cotação, leitura de cache, atualização de fundamentos e duração total.
- `stock_comparison_stage_timing`: quantidade de tickers e emissores, consulta
  de metadados, carga dos fundamentos, cálculo e duração total.

Uma comparação de tempo antes/depois requer executar os mesmos tickers e
condições de cache em um ambiente de teste isolado ou obter logs do release
anterior. A medição real ainda está pendente devido à indisponibilidade DNS
deste ambiente e à política de não executar o caminho de cache frio contra o
Neon compartilhado.

## Reprodução local

```sh
pnpm exec vitest run tests/backend/providers/brapi-market-data.provider.test.ts
pnpm exec vitest run tests/backend/providers/cvm-fundamentals.provider.test.ts
pnpm exec vitest run tests/backend/services/stock-analysis.service.test.ts
pnpm exec vitest run tests/backend/services/stock-comparison.service.test.ts
```
