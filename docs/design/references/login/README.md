# Login público

## Referência

`login-page-proposal.png` é uma proposta desktop de IA focada no cartão do formulário público `/login`, em tema escuro e com os campos vazios. O fundo da página foi omitido de propósito; a implementação deverá compor um fundo moderno usando os tokens existentes.

## Contexto funcional

Conferido em `src/app/login/page.tsx` e `src/app/login/loading.tsx`. O formulário usa e-mail e senha, permite exibir/ocultar a senha, valida formato de e-mail, desabilita o envio durante a requisição e redireciona para `/` após sucesso. Falha de API/rede usa toast; erro de formato aparece junto ao formulário. A imagem representa apenas o estado inicial.

## Tokens e diferenças

O cartão usa superfícies neutras e azul de identidade pelos tokens globais. Nenhuma classe de ativo é apresentada. O cadeado, a moldura e as dimensões são proposta de composição. A referência não define o fundo, o controle de tema nem os estados de erro, envio e sucesso; esses estados existentes continuam no código. Não adicionar cadastro, recuperação de senha ou provedores.

## Estados de entrega

| Estado                      | Situação                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Referência criada           | Sim; proposta desktop de IA focada no cartão, no arquivo indicado acima.                   |
| Contexto funcional revisado | Sim; rota pública, campos, validação, envio e feedback conferidos nos componentes citados. |
| Layout implementado         | Sim; cartão translúcido e fundo com gradientes suaves usando o token de identidade azul.   |
| Verificação estrutural      | Sim; fluxos existentes preservados em revisão de código e `git diff --check` passou.       |
| Comparação visual real      | Não realizada por orientação do usuário; não tentar navegador/Playwright neste fluxo.      |
| Aprovação visual do usuário | Direção desktop autorizada; comparação visual não solicitada e não realizada.              |
