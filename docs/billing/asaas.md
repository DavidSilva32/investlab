# Integração de assinaturas Asaas

## Estado e ativação

A integração começa no sandbox. A cobrança fica indisponível por padrão e só é apresentada como contratável quando houver preço definido em centavos, chave de API e `ASAAS_BILLING_ENABLED=true`. O ambiente `production` também exige `ASAAS_LIVE_BILLING_APPROVED=true`; configurar essa variável não substitui a validação comercial da issue #231 nem uma aprovação explícita para cobranças reais.

Configure no ambiente da aplicação:

- `ASAAS_ENVIRONMENT=sandbox` ou `production`.
- `ASAAS_API_KEY`: chave da API do mesmo ambiente.
- `ASAAS_WEBHOOK_TOKEN`: token secreto configurado no webhook do Asaas.
- `ASAAS_BILLING_ENABLED=true` somente depois de validar oferta, preço e conta.
- `ASAAS_SUBSCRIPTION_AMOUNT_CENTS`: preço mensal aprovado como inteiro em centavos. Não há preço padrão no código.
- `ASAAS_LIVE_BILLING_APPROVED=true` somente após aprovação explícita para cobranças reais.

Cadastre `POST https://<domínio-da-aplicação>/api/webhooks/asaas` como webhook no Asaas, com o segredo no campo de autenticação do webhook. Configure os eventos de Checkout `CHECKOUT_PAID`, `CHECKOUT_CANCELED` e `CHECKOUT_EXPIRED`, além dos eventos de assinatura e pagamento usados na conciliação. O serviço valida o header `asaas-access-token` em tempo constante. Os eventos correlacionados são persistidos antes de responder; falhas de banco ou de conciliação retornam erro para permitir nova entrega. Eventos duplicados são ignorados pela chave única do evento. O payload persistido é reduzido aos identificadores e campos de estado necessários, sem armazenar dados pessoais ou detalhes completos de pagamento.

O campo `dateCreated` dos exemplos oficiais do Asaas usa `YYYY-MM-DD HH:mm:ss` sem fuso. O InvestLab interpreta esse formato como UTC, de forma fixa, apenas para ordenar eventos; timestamps ISO 8601 com fuso também são aceitos. Webhooks que possam alterar estado precisam trazer uma data válida.

## Fluxo suportado

1. A pessoa autenticada abre **Minha conta → Assinatura**.
2. O servidor grava um checkout pendente com uma referência externa aleatória vinculada à conta antes de chamar o Asaas.
3. O Asaas cria um Checkout hospedado mensal por cartão de crédito. Os dados do cartão são inseridos somente na página do Asaas; o InvestLab não os recebe nem armazena. Embora o Checkout comum aceite PIX, a documentação de assinatura recorrente consultada só confirma cartão; PIX fica fora desta jornada até haver suporte oficial documentado.
4. A pessoa é redirecionada para `https://asaas.com/checkoutSession/show?id=...`. A URL de retorno serve apenas para navegação e nunca libera acesso.
5. `CHECKOUT_PAID` confirma o pagamento do checkout; `SUBSCRIPTION_CREATED` só é conciliado quando o evento vincula um checkout ou assinatura já conhecida. A documentação oficial mostra `subscription.externalReference` como `null` no exemplo de criação. Um evento de ativação sem vínculo conhecido retorna erro para nova entrega e não é gravado como processado. Se um pagamento tardio concorrer com um novo Checkout pendente, o sistema solicita o cancelamento do Checkout mais recente antes de confirmar o pagamento antigo; se o cancelamento falhar, o webhook retorna erro. A reentrega só prossegue após confirmação do Asaas ou após o webhook `CHECKOUT_CANCELED`/`CHECKOUT_EXPIRED` atualizar a reserva. Portanto, mantenha `ASAAS_BILLING_ENABLED=false` até um teste no sandbox confirmar como os eventos do Checkout recorrente permitem correlacionar com segurança o checkout e a assinatura, ou até existir uma correlação segura validada. Sem essa correlação, a integração falha fechada e não concede acesso.
6. Eventos de pagamento confirmam períodos subsequentes. Atrasos antigos não rebaixam um período mais recente. Ao solicitar cancelamento local, o InvestLab registra `localCancellationAt` separado do horário dos eventos Asaas: pagamentos confirmados antes desse instante preservam o período já pago; eventos no instante ou depois mantêm a assinatura cancelada e não iniciam uma nova recorrência. Reembolso e contestação continuam revogando o acesso.
7. Reembolso e contestação retiram o acesso pago; inadimplência suspende o acesso pago. Checkout pendente pode ser cancelado por `POST /v3/checkouts/{id}/cancel`.

Acesso pago é separado do papel `USER`/`ADMIN`. No momento, ele impede que o período beta expirado bloqueie gravações. Os limites e recursos específicos do futuro plano Pro ainda dependem da decisão comercial da issue #231.

## Teste de sandbox

1. Use uma conta e chave de API do sandbox; nunca copie uma chave de produção para desenvolvimento.
2. Defina preço de teste em `ASAAS_SUBSCRIPTION_AMOUNT_CENTS` e habilite `ASAAS_BILLING_ENABLED=true` somente no ambiente de teste.
3. Cadastre o webhook de sandbox para a URL HTTPS disponível e configure `ASAAS_WEBHOOK_TOKEN` com o mesmo segredo.
4. Crie uma conta InvestLab de teste, inicie a assinatura e conclua a cobrança com os meios/dados de teste documentados pelo Asaas.
5. Confira o evento recebido, o status da assinatura e o acesso; reenvie o mesmo evento para confirmar idempotência.
6. Teste cancelamento, atraso, estorno, contestação e eventos duplicados/fora de ordem. Não use uma conta real nem efetue cobrança real nesta etapa.

As chaves e tarifas variam por ambiente e conta. Confirme as tarifas efetivas na conta Asaas antes de definir o preço público. A integração usa Checkout hospedado e endpoints REST v3; o MCP de documentação do Asaas não é usado pelo backend. Referências: [Checkout recorrente](https://docs.asaas.com/docs/checkout-with-subscription-recurring), [Checkout Asaas](https://docs.asaas.com/docs/asaas-checkout), [eventos de Checkout](https://docs.asaas.com/docs/checkout-events), [eventos de assinatura](https://docs.asaas.com/docs/subscription-events) e [cancelar Checkout](https://docs.asaas.com/reference/cancel-a-checkout).
