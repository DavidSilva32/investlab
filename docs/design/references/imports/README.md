# Importações — referência histórica

## Referência

`design-reference.png` é uma proposta de IA desktop recriada em 06/10/2026 para a antiga rota `/imports`. Ela retrata prévia de posições da B3 e não é uma captura do produto.

## Experiência atual

A página `/imports` foi removida. A importação de arquivos B3 e a conciliação continuam disponíveis no painel lateral aberto pelas ações rápidas do Dashboard. O fluxo reutiliza `src/components/portfolio-import.tsx` e os endpoints `/api/imports/*`. Links de importação em estados vazios levam ao Dashboard e abrem o painel.

O painel agora identifica a origem com os arquivos oficiais da marca B3 em `public/brands/b3/`, respeitando os temas claro e escuro. A referência desta pasta permanece como registro histórico da página anterior, não como referência para o painel atual.

## Estados de entrega

| Estado                      | Situação                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Referência criada           | Sim; proposta desktop histórica, gerada por IA.                                                         |
| Contexto funcional revisado | Sim; fluxo ativo é o painel lateral no Dashboard; APIs de prévia, confirmação e conciliação permanecem. |
| Layout implementado         | Sim; a seleção, prévia, conciliação e confirmação são fornecidas por `PortfolioImport`.                 |
| Comparação visual real      | Pendente; nenhuma captura do produto foi feita.                                                         |

Os valores e registros ilustrativos da imagem não representam dados reais. A tela antiga não deve ser usada para validar o layout atual do painel.
