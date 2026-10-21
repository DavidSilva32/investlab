# Investigação: MCP da BRAPI no InvestLab

**Issue:** [#253 — Investigar uso do MCP da BRAPI no InvestLab](https://github.com/DavidSilva32/investlab/issues/253)  
**Verificado em:** 21 de outubro de 2026  
**Escopo:** avaliação técnica e de cobertura; nenhuma chamada real foi feita à conta BRAPI do InvestLab.

## Resposta curta

É tecnicamente possível o InvestLab conversar com o MCP da BRAPI sem contratar um provedor de IA. Um cliente MCP pode conectar por HTTP e chamar ferramentas de forma programática. Isso, porém, não torna a integração mais rápida nem mais barata por si só: a BRAPI informa que o MCP usa a mesma conta e os mesmos limites da API REST.

**Recomendação:** manter o cliente REST atual e não trocar a integração de produção por MCP. Se ainda quisermos validar o MCP, fazer uma prova isolada de leitura, com autenticação OAuth e poucos tickers, comparando resposta, latência, limites e custo com chamadas REST equivalentes. Os dados que a documentação pública não permite confirmar para a nossa conta devem ser verificados nesse experimento antes de qualquer decisão.

## O que o código atual faz

| Necessidade no InvestLab                                       | Implementação atual                                                       | Observação                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cotação, variação, valor de mercado e identificação da empresa | `BrapiMarketDataProvider`, `/api/v2/stocks/quote`                         | Bearer via `BRAPI_TOKEN`; resposta validada e normalizada para `MarketQuote`/`MarketData`.                                                                     |
| Busca de ticker                                                | `BrapiMarketDataProvider.searchTickers`, `/api/v2/tickers`                | A busca ativa ações e reduz a resposta ao contrato interno `MarketTicker`.                                                                                     |
| Histórico de cotações                                          | `BrapiMarketDataProvider.getHistoryByTicker`, `/api/v2/stocks/historical` | Tenta ranges decrescentes; normaliza datas e preços, e distingue dados disponíveis, parciais, vazios e indisponíveis. O cache padrão revalida em 300 segundos. |
| Perfil e CNPJ                                                  | `BrapiMarketDataProvider.getByTicker`, `/api/v2/stocks/profile`           | Consulta opcional junto da cotação e do histórico.                                                                                                             |
| Dividendos/JCP                                                 | `BrapiDividendsProvider`, `/api/v2/stocks/dividends`                      | Mesmo quando há pagamentos, o sistema marca a cobertura como incompleta e não usa o valor automaticamente para liberar Bazin.                                  |
| Catálogo e perfil para sincronização do screener               | `BrapiScreenerProvider`, `/api/v2/tickers` e `/api/v2/stocks/profile`     | Exige `BRAPI_TOKEN`, pagina o catálogo e registra diagnósticos de chamadas.                                                                                    |
| Fundamentos para análise individual                            | `CvmFundamentalsProvider` via `StockAnalysisService`                      | A fonte atual dos fundamentos é a CVM, não a BRAPI. A cotação/identidade vem da BRAPI.                                                                         |

Os contratos comuns de mercado estão em `src/backend/providers/market-data.provider.ts`. O pacote MCP usado pelo sistema é de servidor; não foi localizado o SDK `@modelcontextprotocol/client` nem um cliente de saída da BRAPI no `package.json`.

## O que a documentação pública da BRAPI informa sobre MCP

- O endpoint publicado é `https://brapi.dev/api/mcp/mcp`; a primeira conexão orienta o usuário a autenticar pelo navegador via OAuth.
- A documentação lista 77 ferramentas. Para o escopo atual, há equivalentes aparentes para ticker (`get_tickers`, `resolve_tickers`, `get_ticker_coverage`), cotação (`get_stock_quote`), histórico (`get_stock_historical`), dividendos (`get_stock_dividends`), perfil (`get_stock_profile`) e fundamentos (`get_stock_statistics`, `get_stock_financial_data`, `get_stock_balance_sheet`, `get_stock_income_statement`, `get_stock_cash_flow`, `get_stock_value_added`). Também existe `get_account_capabilities`.
- A documentação diz que 10 ferramentas de descoberta funcionam sem login e que as demais exigem conta BRAPI. Ferramentas de screener (`get_stock_screener`) estão indicadas como Startup/Pro.
- A BRAPI informa explicitamente que as consultas MCP usam os mesmos limites da API REST. Na tabela pública consultada, o plano Gratuito aparece com 15.000 requisições por ciclo, uma chamada simultânea, um ticker por chamada, histórico de até três meses, atraso aproximado de 30 minutos, sem dividendos e fundamentos básicos. Os limites do plano não implicam que toda ferramenta listada esteja habilitada: há restrições por recurso/endpoint.

### Limite da evidência sobre o plano gratuito

Os valores acima vêm da documentação pública consultada nesta data, não do painel nem de uma resposta autenticada de `get_account_capabilities` da conta BRAPI configurada no InvestLab. Não confirmei o plano contratado, saldo da cota, permissões efetivas nem as respostas e schemas reais das ferramentas nessa conta. Esses pontos ficam pendentes de uma prova autenticada; não devemos tratá-los como verificados.

## Comparação e impacto

| Critério                   | REST atual                                                                | MCP da BRAPI                                                                             | Efeito esperado                                                                                        |
| -------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Forma de chamada           | Endpoint explícito, query e Bearer configurado no servidor                | Descobrir ferramenta e chamar por protocolo MCP; autenticação indicada via OAuth         | Mais trabalho de sessão, OAuth, armazenamento e renovação de credenciais por usuário/conta.            |
| Resultado e schema         | Normalizado e validado para contratos InvestLab                           | Ferramentas publicam respostas próprias; é necessário mapear e validar cada schema usado | O cliente MCP ainda precisaria de adaptadores; não elimina mapeamento de dados.                        |
| Cota e cobrança            | Limites da conta BRAPI                                                    | Mesmos limites e conta, segundo a documentação BRAPI                                     | MCP não cria cota grátis adicional nem reduz consumo por si só.                                        |
| Concorrência gratuita      | Uma chamada simultânea publicada                                          | Uma chamada simultânea publicada                                                         | Chamadas paralelas em páginas/análises ainda podem competir pelo limite.                               |
| Dados de preço e histórico | Já integrados; histórico tem fallback, status explícito e cache           | Ferramentas correspondentes listadas                                                     | É preciso medir latência e compatibilidade por ticker/plano; MCP não garante maior disponibilidade.    |
| Fundamentos                | Análise usa dados da CVM e regras de conciliação próprias                 | BRAPI lista ferramentas financeiras, mas plano gratuito é descrito como básico           | Não substitui automaticamente a fonte CVM nem prova equivalência de indicadores usados pelo InvestLab. |
| Dividendos                 | Consulta BRAPI observacional com cobertura incompleta; não habilita Bazin | Ferramenta listada, mas plano gratuito público não inclui dividendos                     | Não resolve a limitação de Bazin no plano gratuito.                                                    |

O protocolo MCP permite a um cliente programático conectar a um servidor HTTP e invocar ferramentas; isso é independente de gerar texto com um modelo de IA. Portanto, um provedor de IA não é requisito para a comunicação do protocolo. Ainda são necessários cliente MCP, transporte, autenticação autorizada, gestão segura de tokens e conversão para contratos internos.

## Prova de conceito recomendada

Se quisermos responder à questão prática sem afetar clientes ou produção:

1. Criar um comando/experimento isolado, fora do fluxo de análise em produção, com a biblioteca cliente MCP compatível com a versão do servidor BRAPI.
2. Fazer OAuth no ambiente de teste com a conta gratuita e consultar `get_account_capabilities`; não copiar tokens para logs, screenshots, commits ou documentos.
3. Descobrir ferramentas e schemas realmente disponíveis para a conta; testar um ticker suportado de cada vez, respeitando o limite publicado de concorrência e a cota.
4. Comparar cotação, histórico dentro da janela do plano e fundamentos entre MCP e chamadas REST já existentes, registrando status HTTP/tool, duração, campos, datas de observação e diferenças de valor. Não testar dividendos nem screener como disponíveis no Gratuito sem autorização observada.
5. Encerrar sem persistir tokens de teste e sem alterar o cliente REST. Só propor integração de produto depois de provar que há ganho concreto de cobertura, UX ou manutenção.

### Critério de decisão após a prova

- **Não adotar** se o MCP apenas repassar os mesmos dados/limites e acrescentar OAuth, latência ou pontos de falha sem reduzir custo/manutenção.
- **Coexistir** se alguma ferramenta fornecer dados necessários que o REST atual não cobre, com schema estável e plano compatível.
- **Adotar para uma operação específica** somente depois de comparar dados reais e confirmar custo/limites e ciclo de vida de credenciais. Não substituir o cliente REST globalmente como resultado desta investigação.

## Fontes primárias consultadas

- [Servidor MCP da BRAPI](https://brapi.dev/docs/mcp) — endpoint, OAuth, lista de ferramentas e paridade dos limites com REST.
- [Limites da API BRAPI](https://brapi.dev/faq/quais-as-limitacoes) — cota, concorrência, tickers por chamada e histórico por plano.
- [Limitações do plano gratuito BRAPI](https://brapi.dev/faq/o-plano-gratuito-tem-limitacoes-importantes) — dividendos, fundamentos e limites públicos do Gratuito.
- [Autenticação da BRAPI](https://brapi.dev/docs/authentication) — Bearer no REST, OAuth para cliente MCP e erros de autenticação/plano/limites.
- [Conectar a um servidor — SDK oficial MCP TypeScript](https://ts.sdk.modelcontextprotocol.io/v2/clients/connect) — cliente HTTP e handshake MCP sem depender de um provedor de IA.
- [Autorização MCP — especificação oficial](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) — OAuth para clientes HTTP, fluxos para usuário e cliente de aplicação e requisitos de tokens.
