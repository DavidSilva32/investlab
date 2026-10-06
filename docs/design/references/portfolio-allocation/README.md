# Carteira — metas e detalhes

## Referência e estado

| Experiência / rota                                                                                                              | Origem e estado                                                                                                                                     | Conteúdo representado                                                                                                                                                                  | Implementação e validação                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sheet “Metas pessoais e dados detalhados” em `/portfolio`, com a dimensão “Classe” selecionada e a lista de posições recolhida. | [allocation-details-reference.png](./allocation-details-reference.png), proposta visual gerada pelo imagegen integrado; não é captura da aplicação. | Concentração observada por classe, base de cálculo, limite de posições sem valor, estado `needs_targets` da orientação da Estratégia e controle para abrir “Posições e classificação”. | Implementação alinhada à proposta; testes focados aprovados. Comparação visual com a aplicação e validação por captura desktop/mobile pendentes. |

## Dados ilustrativos e limites

Os valores da imagem são demonstrativos: R$ 62.000,00 em cinco posições com valor, uma posição sem valor fora da base, e quatro grupos que totalizam 100% da base. Não são dados reais da carteira nem uma recomendação.

A tela mostra a dimensão “Classe”, suportada pelo produto. “Renda variável”, “Fundos” e “Não informado” são categorias amplas de classificação; não representam as classes específicas da Estratégia. As barras usam uma série visual neutra. Não aplicar a elas cores semânticas de classes específicas. A imagem não deve ser interpretada como suporte a dimensões de instituição ou emissor.

O estado de orientação mostrado corresponde à ausência de composição salva na Estratégia: “Salve uma composição na Estratégia”. A orientação deve continuar descritiva e não sugerir compra, venda, alocação ou aporte.

## Identidade visual

Usar superfícies neutras escuras, identidade e ações azuis e suporte ao tema claro, conforme os tokens globais. Se classes específicas forem exibidas em outra visualização, consultar os IDs e cores oficiais em `src/lib/strategy-allocation.ts`; não deduzir classes específicas a partir das categorias amplas desta referência.

## Histórico

A imagem anterior foi substituída por esta proposta e não é mais uma referência ativa. Ela apresentava rótulos de classes desatualizados, dimensões de concentração sem suporte e uma recomendação fixa de aporte. A proposta atual corrige esses pontos.

## Aprovação e acompanhamento

- Referência gerada: sim.
- Contexto funcional: revisado para o estado ilustrado.
- Aprovação visual do usuário: aprovada.
- Implementação da proposta: concluída.
- Verificação estrutural: cinco arquivos de teste de componentes; 51 testes aprovados.
- Comparação visual real e captura desktop/mobile: pendentes.
