# Padrões de página

Use estes padrões como ponto de partida, não como um layout obrigatório. Consulte `design-system.md` e as referências aprovadas antes de uma página nova ou de uma refatoração visual relevante.

## Dashboard

Comece pela resposta ou ação mais útil para a situação da carteira. Destaque valores e o fluxo do dinheiro; mantenha origem, justificativa e detalhes acessíveis sem competir com o resultado.

## Formulários e edição

Agrupe campos por tarefa, use controles shadcn com rótulos explícitos e preserve validação junto ao campo. Em drawers/sheets, garanta largura usável no celular, rolagem interna, foco e fechamento acessíveis. Salvar deve produzir feedback transitório claro.

## Análises

Mostre primeiro a conclusão que os dados sustentam, depois explicação, período, fonte e limitações. Separe fatos, cálculo e interpretação. Valores e gráficos devem identificar sua unidade e referência temporal.

## Tabelas e listas

Mantenha colunas e ações legíveis em telas estreitas; use cartões ou rolagem horizontal controlada quando necessário. Não dependa apenas de cor para estado, classe ou seleção.

## Gráficos

Use o componente shadcn `ChartContainer`/Recharts. Inclua título ou nome acessível, eixos/unidades quando aplicável, legenda e tooltip identificável. Compare apenas grandezas compatíveis. Em gráficos de composição, use cores semânticas estáveis e percentuais legíveis.

## Estados

- **Carregamento:** use skeleton alinhado à estrutura final; evite texto redundante quando a forma já comunica o estado.
- **Vazio:** explique em uma frase o que falta e ofereça a próxima ação possível.
- **Erro:** mantenha falha de carregamento persistente na tela, com retry quando disponível; erros de ação transitórios usam toast.
- **Parcial/indisponível:** identifique o que foi calculado, período/data e o que está faltando. Não substitua dado desconhecido por zero.

## Prototipação e aprovação

Para mudanças visuais relevantes:

1. Inspecione página, dados e interações atuais; registre a tarefa principal do usuário e os estados importantes.
2. Proponha uma composição usando componentes e tokens existentes. Mantenha o protótipo fora das rotas de produção; use branch/ambiente isolado quando isso puder coexistir sem tocar em trabalho em andamento.
3. Quando o browser integrado ou Playwright estiver disponível, capture desktop e mobile. Nomeie cada captura com página, viewport e estado. Registre apenas imagens realmente capturadas e aprovadas em `references/`.
4. Se capturas não estiverem disponíveis, registre a limitação e apresente uma especificação/protótipo verificável antes de pedir aprovação.
5. Aguarde aprovação visual antes de substituir a tela definitiva. Depois valide breakpoints, contraste, foco, teclado e estados de carregamento/vazio/erro.

Para ajustes pequenos e localizados, consulte tokens e padrões, valide o componente afetado e não crie uma etapa de captura desnecessária.
