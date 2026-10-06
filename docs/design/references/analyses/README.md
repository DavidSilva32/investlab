# Análises

## Minha carteira

`design-reference.png` é uma proposta desktop de IA recriada em 06/10/2026 para a aba “Minha carteira” em `/analyses`, não uma captura do produto. A versão azul/neutra substitui a antiga proposta verde, que incluía controles sem suporte. Tickers, valores, datas e fontes são sintéticos.

A referência atual mostra as abas “Minha carteira” e “Análise individual”, a comparação de referências das ações, a premissa configurável do Bazin e cartões de Graham e Bazin com fonte e data. Não incluir ordenação por ticker nem o CTA “Saiba mais sobre as metodologias”: esses controles não existem na tela. As referências calculadas são para estudo e não determinam aporte.

Estados da atualização: referência criada: sim; contexto funcional revisado: sim; implementação existente: sim; verificação estrutural: não refeita; comparação visual real: pendente, sem captura de navegador; aprovação visual desta nova imagem: pendente.

## Análise individual

| Experiência e estado                                                                                                                                                          | Origem                                                                                                                                         | Conteúdo representado                                                                                                                                                                                                                                                       | Implementação e validação                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Aba “Análise individual” em `/analyses?ticker=ABCD3`, consulta carregada com “1 ano” selecionado. Tema escuro; enquadramento do conteúdo, sem o cabeçalho global do AppShell. | [individual-analysis-reference.png](./individual-analysis-reference.png), proposta gerada pelo imagegen integrado; não é captura da aplicação. | Busca de ticker; resumo da cotação e suas variações; histórico de preços de fechamento e períodos disponíveis; P/L, P/VP, ROE e margem líquida com origem/período; leitura dos dados anuais; evolução de receita, lucro líquido e patrimônio; detalhes técnicos recolhidos. | Referência aprovada e implementada. Testes focados e typecheck passaram; comparação visual real desktop/mobile pendente. |

Os valores, ticker, empresa, datas e séries da imagem são sintéticos e ilustram somente campos suportados. A variação no período exclui dividendos, como informa a interface. Os períodos disponíveis dependem da cobertura retornada. A leitura anual pode variar conforme os demonstrativos recebidos; não é classificação, recomendação ou previsão.

A proposta remove o bloco genérico “Sobre os dados financeiros”, conforme pedido do usuário. A origem e o período permanecem junto a cada indicador; os detalhes técnicos ficam dedicados aos demonstrativos e às informações específicas do ativo. A cotação não recebeu fonte ou data inventada.

Não incluir máximas, mínimas, volume, setor, subsetor, Tag Along, liquidez, outros indicadores ausentes do código, estimativa de preço-alvo, ações de compra/venda ou recomendação. A proposta antiga foi substituída; seu verde e seus dados sem suporte não são referência ativa.

## Cores

Usar superfícies neutras e identidade azul. O histórico de cotação usa a cor de identidade `primary`. Os gráficos de fundamentos são séries genéricas, sem significado de classe: usar tokens `chart-category-*`. Não aplicar cores de classes específicas porque a aba não identifica uma classe da Estratégia.

## Aprovação e acompanhamento da referência individual

- Referência atualizada: sim.
- Contexto funcional do estado ilustrado: revisado nos componentes ativos.
- Aprovação visual do usuário: aprovada.
- Implementação desta proposta: concluída; os indicadores ocupam a área principal e o bloco genérico sobre dados financeiros foi removido.
- Verificação estrutural: testes focados, ESLint, typecheck e `git diff --check` passaram.
- Comparação visual real e capturas desktop/mobile: pendentes.
