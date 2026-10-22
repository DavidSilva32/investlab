# Aprender

## Referências visuais

| Arquivo                                                                                | Rota e estado                                                                      | Origem e escopo                                                                                                                              | Estado funcional mostrado                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [learning-page-light-desktop-proposal.png](./learning-page-light-desktop-proposal.png) | `/aprender`, desktop, light mode, quatro classes; FIIs selecionado; vídeo pausado. | Referência de IA apresentada para aprovação e reaproveitada na implementação. Uma única composição desktop evita duplicar variantes visuais. | Proposta visual anterior aos quizzes; texto descritivo e imagens são ilustrativos. O player representa o MP4 fornecido pelo usuário, confirmado em `public/videos/fiis.mp4`. |

## Contexto funcional revisado

A rota ativa é `/aprender`. As capas reutilizam os quatro arquivos WebP compartilhados em `public/images/asset-classes/`, usados também na Estratégia e descritos em `docs/design/references/strategy/class-imagery/README.md`. Não há cópias específicas da página Aprender. Os nomes e IDs das classes vêm de `src/lib/strategy-allocation.ts`: `fiis` — Fundos imobiliários (FIIs), `brazilian_equities` — Ações e BDRs, `international_etfs` — ETFs internacionais e `fixed_income` — Renda fixa. A issue #237 acrescenta uma aula curta e um quiz de quatro alternativas a cada classe; os vídeos continuam disponíveis em complemento às aulas.

Os arquivos MP4 das quatro classes estão disponíveis localmente. O mockup não confirma hospedagem, entrega em produção, acessibilidade do conteúdo audiovisual, nem existência de legendas/transcrição. Não gerar, editar ou revisar conteúdo de vídeo nesta implementação.

As aulas e os quizzes são educativos, sem recomendação de compra ou venda e sem progresso persistido. Cada classe oferece fontes oficiais do Portal do Investidor/CVM sob demanda. O texto de FIIs distingue a participação no fundo da propriedade direta de imóveis e informa que cotas podem ser negociadas em bolsa ou balcão organizado.

As descrições visíveis nas imagens são rascunhos ilustrativos, não copy aprovada. O card de FIIs usa um galpão como exemplo visual e não define a composição dos FIIs; as classes devem ser descritas sem generalizar um tipo de ativo.

## Tokens e composição

A referência usa o tema claro solicitado; a implementação conserva os temas claro e escuro suportados globalmente pelo app. As classes usam os tokens oficiais independentes da identidade: renda fixa laranja, ações e BDRs azul, ETFs internacionais roxo, FIIs verde. As cores não são o único identificador. A referência é desktop; não foi gerada imagem mobile.

## Estados de entrega

| Estado                      | Situação                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referência criada           | Sim: uma única proposta desktop em light mode, registrada aqui.                                                                                                                                       |
| Contexto funcional revisado | Sim nesta tarefa: issue #237, rota `/aprender`, catálogo oficial, quatro vídeos, aulas, quizzes e fontes foram conferidos.                                                                            |
| Layout implementado         | Sim: página e cards existentes, aula curta e quiz acessível com feedback e nova tentativa em cada uma das quatro classes.                                                                             |
| Verificação estrutural      | Validação focada desta tarefa: 16 testes em cinco arquivos, TypeScript e ESLint focado passaram. Lint, formatação global, cobertura global, build e captura visual não foram executados nesta tarefa. |
| Comparação visual real      | Pendente; nenhuma captura do app foi feita.                                                                                                                                                           |
| Aprovação do usuário        | Direção visual da referência original aprovada em 08/10/2026; a aula e o quiz da issue #237 não estão representados nem foram aprovados visualmente como estados separados.                           |

Propostas geradas por IA não são capturas, conteúdo final ou prova de fidelidade. Não usar navegador/Playwright neste fluxo visual; registrar comparação como pendente até existir captura real solicitada e realizada.
