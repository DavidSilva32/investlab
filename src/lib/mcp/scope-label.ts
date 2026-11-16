export function scopeLabel(scope: string): string {
  if (scope === "mcp:read") return "Consultar sua carteira e posições.";
  if (scope === "mcp:write")
    return "Criar, editar ou excluir objetivos e posições manuais, e informar saldos dos objetivos. Posições e saldos de objetivos são acompanhamentos independentes; nenhuma compra ou venda é executada.";
  if (scope === "mcp:admin:read")
    return "Buscar dados básicos de contas e consultar a carteira escolhida; disponível somente para ADMIN.";
  if (scope === "openid") return "Confirmar sua identidade para esta conexão.";
  if (scope === "profile")
    return "Compartilhar informações básicas do seu perfil.";
  if (scope === "email") return "Compartilhar seu endereço de e-mail.";
  if (scope === "offline_access")
    return "Manter a conexão ativa até você revogá-la.";
  return scope;
}
