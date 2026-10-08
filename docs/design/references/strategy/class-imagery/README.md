# Imagens das classes de ativos compartilhadas

## Proposta visual

| Arquivo                                                                                         | ID oficial           | Nome                       | Uso e texto alternativo                                                                   |
| ----------------------------------------------------------------------------------------------- | -------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| [fixed-income-office.webp](../../../../../public/images/asset-classes/fixed-income-office.webp) | `fixed_income`       | Renda fixa                 | Notebook com interface discreta de títulos, documentos e instituição financeira ao fundo. |
| [brazilian-equities.webp](../../../../../public/images/asset-classes/brazilian-equities.webp)   | `brazilian_equities` | Ações e BDRs               | Distrito empresarial brasileiro.                                                          |
| [international-etfs.webp](../../../../../public/images/asset-classes/international-etfs.webp)   | `international_etfs` | ETFs internacionais        | Distrito empresarial global visto de um porto.                                            |
| [fiis.webp](../../../../../public/images/asset-classes/fiis.webp)                               | `fiis`               | Fundos imobiliários (FIIs) | Galpão logístico como exemplo de imóvel que pode compor alguns FIIs.                      |

### Microtextos propostos

- **Renda fixa:** Títulos com prazo, remuneração e liquidez que variam conforme o produto.
- **Ações e BDRs:** Exposição a empresas brasileiras por meio de ações e BDRs.
- **ETFs internacionais:** ETFs com exposição a mercados fora do Brasil.
- **Fundos imobiliários (FIIs):** Podem investir em imóveis, recebíveis imobiliários ou ambos.

## Metadados da referência

- Experiências/rotas: `/strategy`, Sheet **Editar composição** aberto; `/learn`, cards das classes e capa do player de FIIs.
- Local compartilhado dos arquivos de produção: `public/images/asset-classes/`; Estratégia e Aprender usam as mesmas quatro imagens, sem duplicar arquivos.
- Componente: `strategy-allocation-workspace.tsx`.
- Estado: composição planejada completa; todos os quatro IDs estão presentes; tema escuro; desktop.
- Apresentação escolhida: fotos e descrições curtas nas linhas do Sheet **Editar composição** e nos cards da página **Aprender**. A visão principal da Estratégia conserva ícones, percentuais e gráfico; não repete as mesmas fotos na área de composição principal.
- Origem: fotos geradas com o image generation integrado em 08/10/2026. A imagem enviada pelo usuário orientou o conceito de fotografia por classe, sem ser usada como imagem-alvo. Os arquivos foram convertidos para WebP, largura máxima de 960 px, qualidade 82.
- Elementos sintéticos: valores atuais e percentuais servem apenas para mostrar a composição. A referência não define uma alocação recomendada.
- Contexto omitido: a página Estratégia sob o Sheet não aparece; a imagem foca o componente de edição.
- Paleta: superfícies neutras e identidade azul; acentos associados somente pelos tokens `asset-class-fixed-income`, `asset-class-brazilian-equities`, `asset-class-international-etfs` e `asset-class-fiis`, conforme `src/lib/strategy-allocation.ts` e `src/app/globals.css`.
- Limites: as imagens são ilustrações, não identificam produtos ou retornos. A cena de galpão é um exemplo; o texto dos FIIs também cita recebíveis imobiliários. A cena internacional não define geografia ou índice de um ETF específico.
- Histórico: `fixed-income.webp` era uma variação anterior, não utilizada pelo componente nem pela proposta atual. Ela não integra os quatro arquivos de produção compartilhados em `public/images/asset-classes/`.

### Especificações finais de geração

Todas as quatro imagens usam o modo integrado `image_gen`, categoria `photorealistic-natural`, enquadramento horizontal 4:3, luz natural, sem escrita legível, marcas, logotipos ou marca d'água. A imagem de renda fixa mostra uma tela conceitual com títulos sem valores, textos ou gráficos de desempenho.

1. **Renda fixa:** mesa moderna com notebook mostrando uma interface financeira sem texto/números, documentos de investimento e instituição bancária brasileira ao fundo; sem gráficos, dinheiro, logotipos ou sinais de retorno garantido.
2. **Ações e BDRs:** distrito empresarial moderno de São Paulo com prédios de empresas e rua ativa; sem letreiros ou marca da B3.
3. **ETFs internacionais:** distrito empresarial internacional visto de um porto, com arquitetura variada e sem ponto turístico, marca ou país único em destaque.
4. **FIIs:** galpão logístico contemporâneo no Brasil como exemplo visual de imóvel; a descrição informa que FIIs também podem investir em recebíveis imobiliários.

## Status do processo

- Referência criada: sim — [proposta desktop](./allocation-sheet-class-imagery-proposal.svg).
- Contexto funcional revisado: sim — classes, nomes e controles conferidos na rota e no componente atuais.
- Layout implementado: sim — imagens usadas nas quatro linhas do Sheet de composição e reaproveitadas nos cards de Aprender.
- Verificação estrutural: teste focado adicionado; execução pendente porque o ambiente falhou antes de iniciar o Vitest.
- Comparação visual real: não realizada; nenhuma captura do produto foi feita nesta etapa.
- Aprovação visual final: pendente; ainda falta comparar a captura real da interface com a referência.
