import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";
import type { LegalDocumentSection } from "@/app/(public)/_components/legal-document-page";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Resultado do inventário no código",
    paragraphs: [
      "A análise estática identificou cookies funcionais de autenticação e suporte administrativo, além de armazenamento local do navegador usado por preferências do produto. Não foram encontrados scripts explícitos de analytics, publicidade ou rastreamento opcional no código pesquisado.",
      "Essa análise não inspeciona configurações externas da hospedagem nem substitui uma verificação em runtime de todos os cookies, cabeçalhos e requisições. A auditoria de produção e a confirmação do proprietário continuam pendentes.",
    ],
  },
  {
    title: "2. Cookies funcionais observados",
    paragraphs: [
      "O Better Auth utiliza um cookie de sessão próprio da aplicação para manter a autenticação. A biblioteca configura o atributo HttpOnly e SameSite=Lax; em produção, o cookie usa Secure. A duração padrão observada na configuração instalada é de até sete dias, sujeita a expiração antecipada da sessão. O nome inclui o prefixo Better Auth e pode variar entre desenvolvimento e produção.",
      "O modo temporário de visualização de suporte administrativo usa o cookie `investlab-support-view`, HttpOnly e SameSite=Lax, Secure em produção, com duração de 30 minutos. Ele é usado apenas no fluxo de suporte autorizado por ADMIN.",
      "Esses cookies são necessários às funções solicitadas de autenticação e suporte; não há opção de desligá-los sem afetar essas funções.",
    ],
  },
  {
    title: "3. Armazenamento local do navegador",
    paragraphs: [
      "O produto usa `localStorage` para guardar a preferência de tema, critérios personalizados de análise e tickers recentes. Esses itens permanecem no navegador até serem substituídos, removidos pelo produto ou apagados nas configurações do navegador. Eles não são cookies e o código não os usa para publicidade ou analytics.",
      "A chave e o comportamento efetivos do tema dependem da biblioteca de tema instalada e precisam ser conferidos na auditoria em runtime.",
    ],
  },
  {
    title: "4. Cookies opcionais e preferências",
    paragraphs: [
      "No inventário estático atual não foram identificados cookies opcionais de analytics, publicidade ou rastreamento. Por isso, o InvestLab não apresenta banner nem oferece categorias fictícias de consentimento. A decisão será reavaliada se uma tecnologia opcional for adicionada ou identificada em runtime.",
      "As imagens de logos solicitadas a `icons.brapi.dev` são requisições externas, não uma categoria de cookie identificada no código. O fornecedor pode receber dados técnicos da requisição; contratos, registros e retenção dependem de confirmação externa.",
    ],
  },
  {
    title: "5. Revisões e contato",
    paragraphs: [
      "Este inventário técnico foi preparado em 17 de outubro de 2026 com base no código do repositório. Nome de controlador, fornecedor contratual, região, prazos dos registros da plataforma e canal oficial para dúvidas sobre privacidade ainda precisam ser confirmados.",
      "O texto permanece em preparação e revisão jurídica pendente. A observância das orientações da ANPD não representa, por si só, confirmação de conformidade integral com a legislação.",
    ],
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalDocumentPage
      title="Política de Cookies e armazenamento local"
      introduction="Inventário baseado no código atual. Diferencia cookies de autenticação, armazenamento do navegador e requisições externas, sem criar categorias opcionais que não foram identificadas."
      sections={sections}
    />
  );
}
