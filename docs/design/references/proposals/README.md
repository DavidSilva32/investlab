# Administração de usuários — proposta visual

- Imagem: `admin-users-management-proposal.png`
- Origem: gerada por IA a pedido do usuário; proposta visual, não captura do produto.
- Rota proposta: `/admin/usuarios`.
- Experiência atual: administração de usuários com convite, edição de nome e papel, ativação/desativação e redefinição assistida; exclusão permanente e alteração de e-mail não fazem parte do escopo.
- Estado representado: listagem desktop com busca/filtros, tabela de usuários e estados de acesso.
- Tema: claro; identidade global azul e superfícies neutras. Cores de classes de ativos não são usadas.
- Dados: nomes, e-mails e horários são sintéticos; não representam clientes reais.
- A proposta visual original incluía primeiro acesso. Por decisão posterior do usuário, a implementação registra somente `lastLoginAt` e mostra “Último acesso”; contas existentes não recebem uma data histórica inventada.
- Estados de conta: Ativo, Pendente e Desativado. A tabela reutiliza o filtro e a paginação do componente `PortfolioTable` existente.
- Elementos laterais “Configurações” e “Logs de auditoria” não fazem parte desta implementação e não devem ser inferidos como navegação aprovada; são divergências visuais anotadas para revisão futura do arquivo.
- Exclusão permanente não é mostrada, pois o vínculo dos dados financeiros exige uma estratégia específica de retenção/remoção antes de definir essa ação.

## Estados de validação

1. Referência criada: sim.
2. Revisão do contexto funcional: concluída; ver decisões e limites acima.
3. Layout implementado: sim, dentro do escopo aprovado.
4. Verificação estrutural: concluída por testes automatizados; comparação visual real continua pendente.
5. Comparação visual real: pendente; não houve captura da aplicação.
6. Aprovação do usuário: aprovada para direção visual em 2026-10-16; não comprova fidelidade da implementação.
