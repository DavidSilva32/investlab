# Aprender

## Referências visuais

| Arquivo                                                                                | Rota e estado                                                                   | Origem e escopo                                                                                                                              | Estado funcional mostrado                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [learning-page-light-desktop-proposal.png](./learning-page-light-desktop-proposal.png) | `/learn`, desktop, light mode, quatro classes; FIIs selecionado; vídeo pausado. | Referência de IA apresentada para aprovação e reaproveitada na implementação. Uma única composição desktop evita duplicar variantes visuais. | Proposta visual; texto descritivo e imagens são ilustrativos. O player representa o MP4 fornecido pelo usuário, confirmado em `public/videos/fiis.mp4`. |

## Contexto funcional revisado

A rota `/learn` está implementada. As capas reutilizam os quatro arquivos WebP compartilhados em `public/images/asset-classes/`, usados também na Estratégia e descritos em `docs/design/references/strategy/class-imagery/README.md`. Não há cópias específicas da página Aprender. Os nomes e IDs das classes vêm de `src/lib/strategy-allocation.ts`: `fiis` — Fundos imobiliários (FIIs), `brazilian_equities` — Ações e BDRs, `international_etfs` — ETFs internacionais e `fixed_income` — Renda fixa. Os cards mostram “Vídeo em breve” sem player para as três classes sem mídia.

O arquivo `public/videos/fiis.mp4` foi fornecido manualmente pelo usuário e está disponível localmente (23.360.811 bytes). O mockup não confirma hospedagem, entrega em produção, acessibilidade do conteúdo audiovisual, nem existência de legendas/transcrição. Não gerar, editar ou revisar conteúdo de vídeo nesta implementação.

As descrições visíveis nas imagens são rascunhos ilustrativos, não copy aprovada. O card de FIIs usa um galpão como exemplo visual e não define a composição dos FIIs; as classes devem ser descritas sem generalizar um tipo de ativo.

## Tokens e composição

A referência usa o tema claro solicitado; a implementação conserva os temas claro e escuro suportados globalmente pelo app. As classes usam os tokens oficiais independentes da identidade: renda fixa laranja, ações e BDRs azul, ETFs internacionais roxo, FIIs verde. As cores não são o único identificador. A referência é desktop; não foi gerada imagem mobile.

## Estados de entrega

| Estado                      | Situação                                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referência criada           | Sim: uma única proposta desktop em light mode, registrada aqui.                                                                                                                                                                                                                                                      |
| Contexto funcional revisado | Sim: issue #132, shell, catálogo oficial, classes e MP4 local conferidos.                                                                                                                                                                                                                                            |
| Layout implementado         | Sim: página, cards, conteúdo selecionável e player FIIs sem autoplay.                                                                                                                                                                                                                                                |
| Verificação estrutural      | Sim: testes focados e globais, cobertura 100%, lint, typecheck, build e Prettier nos arquivos alterados passaram. O check global de formatação ainda aponta três arquivos não alterados: `docs/design/references/branding/README.md`, `docs/design/references/strategy/README.md` e `src/components/brand-logo.tsx`. |
| Comparação visual real      | Pendente; nenhuma captura do app foi feita.                                                                                                                                                                                                                                                                          |
| Aprovação do usuário        | Direção visual aprovada em 08/10/2026; a referência light mode é a única variante mantida. Validação visual final permanece pendente.                                                                                                                                                                                |

Propostas geradas por IA não são capturas, conteúdo final ou prova de fidelidade. Não usar navegador/Playwright neste fluxo visual; registrar comparação como pendente até existir captura real solicitada e realizada.
