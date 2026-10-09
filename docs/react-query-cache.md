# Cache de consultas com TanStack Query

## Problema

As telas carregavam dados remotos com estado local e `fetch` dentro dos
componentes. Ao desmontar uma tela e voltar a ela, o estado era perdido e a
mesma requisição voltava a bloquear a interface. Também não havia um ponto
central para atualizar leituras relacionadas depois de uma gravação.

## Solução

O `QueryProvider` envolve a aplicação e cria um `QueryClient` por sessão do
navegador. As chaves ficam em `src/lib/query-keys.ts`; as requisições HTTP
compartilhadas usam `src/lib/api-client.ts`, que converte falhas em `ApiError` e
preserva o cabeçalho `Retry-After` quando a resposta contém limite de chamadas.

Os dados permanecem frescos por 30 segundos e no cache por até cinco minutos.
Ao retornar a uma tela nesse período, a consulta reutiliza os dados em memória e
revalida no foco da janela. Erros não são repetidos automaticamente. Uma
resposta 401 limpa o cache privado e dispara a navegação para login; o logout
também limpa o cache.

As leituras de dashboard e carteira, análises, screener, oportunidades,
objetivos, alocação, reserva de emergência, estratégia e status das
configurações usam `useQuery`. Prévia de alocação, projeção da reserva e
sugestões de combinação são operações de leitura mesmo quando a API usa POST;
seus parâmetros fazem parte da chave para evitar compartilhar resultados entre
entradas diferentes. Gravações continuam sendo chamadas de mutação e invalidam
as consultas relacionadas por chave ou pelo evento `portfolio:updated`.

O evento `portfolio:updated` invalida as consultas de carteira, e os fluxos de
configuração invalidam também seus próprios dados depois de uma sincronização.
Chamadas de login/logout, gravações, upload, exclusões e atualização manual do
mercado continuam fora do cache de leitura.

## Verificação

O teste de integração em `tests/lib/portfolio-query-cache.test.tsx` comprova que
uma tela que desmonta e monta novamente com a mesma chave reutiliza os dados
cacheados e que `portfolio:updated` refaz a leitura. Os testes unitários cobrem
as chaves, o cliente HTTP e o tratamento de sessão; testes dos componentes
verificam cargas, erros, mutações e invalidação.

Validações executadas: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` e
`pnpm test:coverage` passaram. A cobertura ficou em 100% para statements,
branches, funções e linhas; foram executados 2.007 testes em 214 arquivos. O
build de produção também passou. O smoke test da rota `/login` respondeu HTTP 200.

O teste E2E existente não pôde iniciar o Chromium: o executável não estava
instalado e o download oficial do Playwright foi bloqueado pela rede com `403
Domain forbidden` em `cdn.playwright.dev`. Nenhuma migration ou escrita no Neon
foi executada.
