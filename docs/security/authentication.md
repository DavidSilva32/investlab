# Autenticação e proteção de rotas

## Diagnóstico da issue #137

O InvestLab usa uma sessão stateless assinada com HMAC-SHA-256. O login valida as credenciais configuradas no ambiente e grava o token em um cookie `HttpOnly`, `SameSite=Lax`, com `Secure` em produção. A validade do token é conferida no servidor pelo proxy e inclui a expiração embutida no payload.

O problema era a localização do proxy. O App Router está em `src/app`, mas o arquivo estava na raiz do checkout. No Next.js 16, o arquivo `proxy.ts` precisa estar no mesmo nível do diretório `app` (ou seja, em `src/proxy.ts` neste projeto). Como consequência, o manifesto de middleware gerado no build ficava vazio e requisições sem cookie chegavam às páginas e aos handlers de API.

## Correção

O proxy foi movido para `src/proxy.ts`. Ele mantém `/login` e `/api/auth/login` como rotas públicas, redireciona páginas privadas sem sessão para `/login` e responde `401` para APIs privadas. As respostas de bloqueio usam `Cache-Control: no-store` para evitar cache de decisões de autorização. Tokens ausentes, expirados, adulterados ou malformados são rejeitados; falhas de decodificação não escapam como erro de servidor.

O logout agora usa o mesmo atributo `Secure` condicional do login, permitindo limpar corretamente o cookie em desenvolvimento e mantendo-o seguro em produção.

## Verificação

- Visitante sem cookie: redirecionado para `/login` ao acessar uma página privada.
- Visitante sem cookie: recebe `401` em APIs de leitura e mutação.
- Sessão HMAC válida: acessa a página privada sem redirecionamento.
- Sessão expirada, adulterada ou malformada: recebe o mesmo bloqueio de uma sessão ausente.
- Login e logout preservam `HttpOnly`, `SameSite=Lax` e `Secure` em produção.

A sessão continua stateless: o logout remove o cookie do navegador, mas um token já copiado e ainda válido não pode ser revogado individualmente sem introduzir armazenamento de sessão. A chave `AUTH_SECRET` deve ser mantida privada e rotacionada quando houver suspeita de exposição; a rotação invalida os tokens antigos.
