# Matriz dos arquivos de importação B3

Esta matriz registra a estrutura observada nos três exemplos reais disponibilizados para a issue #212. Os arquivos não foram copiados para o repositório; nenhum valor de posição, ticker, conta, instituição ou CNPJ é reproduzido aqui. O conteúdo das planilhas foi tratado apenas como dado de origem.

## Posição

O arquivo tem três abas. Linhas auxiliares sem produto e quantidade não são posições.

| Aba observada         | Linhas de posição | Campos relevantes                                                                                                                                                                                                             | Interpretação permitida                                                                                                                                           |
| --------------------- | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ações                 |                 3 | Produto, Instituição, Conta, Código de Negociação, CNPJ da Empresa, Código ISIN / Distribuição, Tipo, Escriturador, Quantidade, Quantidade Disponível, Quantidade Indisponível, Motivo, Preço de Fechamento, Valor Atualizado | O código de negociação identifica o ativo; `Tipo` distingue classes reportadas pela B3, como ON e PN. Quantidade e valor são um snapshot, não uma compra.         |
| Fundo de Investimento |                 2 | Produto, Instituição, Conta, Código de Negociação, CNPJ do Fundo, Código ISIN / Distribuição, Tipo, Administrador, Quantidade, Quantidade Disponível, Quantidade Indisponível, Motivo, Preço de Fechamento, Valor Atualizado  | A aba identifica cotas de fundos. Não agregar com ações nem inferir detalhes além dos campos reportados.                                                          |
| Renda Fixa            |                28 | Produto, Instituição, Emissor, Código, Indexador, Tipo de regime, Data de Emissão, Vencimento, Quantidade, Quantidade Disponível, Quantidade Indisponível, Motivo, Contraparte e preços/valores MTM, CURVA e FECHAMENTO       | Preservar a precedência e a metodologia de valoração já implementadas para renda fixa. Uma nova aba continua compondo o snapshot, sem somar snapshots anteriores. |

As abas contêm respectivamente 5, 4 e 30 linhas não vazias; as linhas restantes são auxiliares sem produto/quantidade. O arquivo não fornece uma data-base inequívoca nas linhas. A data informada pelo usuário no fluxo atual continua sendo a referência do snapshot; o horário de exportação/nome do arquivo não substitui essa data.

## Negociação

Foram observadas 5 linhas, todas com tipo `Compra`, na mesma data de negociação. A coluna Mercado contém operações à vista e fracionárias. A coluna Prazo/Vencimento está preenchida com `-` nas linhas observadas.

| Campo da B3                        | Uso seguro                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Data do Negócio                    | Data da negociação.                                                                                                   |
| Tipo de Movimentação               | Lado informado pela B3, por exemplo Compra ou Venda; valores não reconhecidos não devem ser convertidos em operações. |
| Mercado                            | Preservar a modalidade reportada, inclusive fracionário.                                                              |
| Prazo/Vencimento                   | Preservar quando preenchido; não presumir que seja data de liquidação.                                                |
| Instituição e Código de Negociação | Identidade da corretora e do ticker de origem. Normalização de fracionário deve conservar também o código original.   |
| Quantidade, Preço e Valor          | Registrar os valores reportados, sem calcular custo médio ou resultado quando o histórico não for suficiente.         |

O layout observado não apresenta coluna de taxa/imposto nem data explícita de liquidação. Esses campos permanecem ausentes; não são estimados.

## Movimentação

Foram observadas 9 linhas entre 17/09/2026 e 16/10/2026. Todas estão na direção `Crédito`; 5 têm o evento `Transferência - Liquidação` e 4 têm `APLICAÇÃO`.

| Campo da B3                                   | Uso seguro                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Entrada/Saída                                 | Preservar como direção financeira do evento; crédito, por si só, não significa compra.                                   |
| Data                                          | Data informada para a movimentação, sem reinterpretá-la como data de negócio ou liquidação de uma negociação específica. |
| Movimentação                                  | Preservar a descrição original do evento.                                                                                |
| Produto, Instituição                          | Apoiam a identificação e a revisão de candidatos, sem equivalência presumida.                                            |
| Quantidade, Preço unitário, Valor da Operação | Preservar os valores presentes; ausências permanecem nulas.                                                              |

## Limites da reconciliação

- Os documentos não fornecem um identificador de ordem comum nem uma data explícita de liquidação para ligar todas as negociações às movimentações.
- Similaridade de ativo, instituição, quantidade ou valor pode sugerir uma revisão, mas não prova identidade. Candidatos permanecem separados até uma decisão explícita.
- Linhas iguais em arquivos sobrepostos também podem representar ordens distintas legítimas. A ocorrência original deve ser preservada e a ambiguidade deve ser exibida, sem deduplicação silenciosa.
- Snapshot de posição, negociação e movimentação são fatos diferentes. Nenhuma entrada ou saída será convertida automaticamente em compra/venda, e um snapshot não será somado a outro.
- Sem histórico completo, o sistema não afirma custo médio, saldo derivado, lucro ou rentabilidade. Ausência não é zero.

## Limitação de dados já importados

Versões anteriores usavam a unicidade do fingerprint para ignorar movimentos repetidos. Registros que não chegaram ao banco não podem ser reconstruídos pela nova importação. A implementação preserva ocorrências futuras e sinaliza sobreposições como ambíguas; não preenche o histórico anterior por estimativa.
