import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";
import type { LegalDocumentSection } from "@/app/(public)/_components/legal-document-page";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Quem é responsável pelo tratamento",
    paragraphs: [
      "A pessoa física ou jurídica responsável pelo InvestLab, seu endereço e o canal oficial para assuntos de privacidade ainda precisam ser confirmados pelo proprietário do produto. Esses dados não foram inventados nesta versão técnica.",
      "A política e a identificação do controlador devem passar por revisão jurídica antes de serem apresentadas como definitivas.",
    ],
  },
  {
    title: "2. Dados tratados e finalidades observadas",
    paragraphs: [
      "O código atual trata informações de conta e autenticação, como nome, e-mail, credencial protegida, sessões, convites e tentativas de autenticação. O esquema de sessões inclui campos de endereço IP e agente do navegador.",
      "Para oferecer as funções de organização de carteira, o sistema armazena dados de posições, instituições, movimentações, objetivos, estratégias e classificações. Os arquivos XLSX enviados são processados no fluxo de importação; o código inspecionado armazena nome e hash do arquivo e os registros derivados, sem evidência de persistência do arquivo bruto.",
      "A aplicação também mantém registros operacionais de requisições e eventos técnicos. Finalidades detalhadas, prazos e acessos a esses registros dependem de confirmação dos operadores da infraestrutura.",
    ],
  },
  {
    title: "3. Bases legais e transparência",
    paragraphs: [
      "As bases legais aplicáveis a cada finalidade ainda precisam ser avaliadas e aprovadas. A execução do serviço, obrigações legais, legítimo interesse e consentimento são hipóteses distintas; nenhuma delas é declarada como base universal por esta versão.",
      "O aceite dos Termos de Uso é um registro contratual separado e não representa consentimento genérico para todo tratamento de dados pessoais.",
    ],
  },
  {
    title: "4. Prestadores e fontes externas",
    paragraphs: [
      "O repositório documenta PostgreSQL via Neon e implantação via Vercel. O produto consulta dados públicos da BRAPI, CVM, Banco Central e Tesouro Direto; o navegador também pode solicitar logos ao domínio icons.brapi.dev. Esses nomes descrevem integrações observadas no código, não confirmam contratos, papéis de tratamento, região, retenção ou subprocessadores.",
      "Não foi localizada integração de IA remota ou ferramenta de analytics no código pesquisado. A configuração efetiva da hospedagem, logs da plataforma e tráfego de produção ainda precisa ser auditada.",
    ],
  },
  {
    title: "5. Armazenamento, retenção e transferências",
    paragraphs: [
      "A localização das bases, os prazos de retenção, o ciclo de cópias de segurança, a eliminação em backups e os procedimentos de restauração ainda não foram confirmados. Não é possível informar prazos definitivos com base apenas no repositório.",
      "A eventual transferência internacional de dados, salvaguardas e regiões dos prestadores dependem da verificação dos ambientes e contratos em uso.",
    ],
  },
  {
    title: "6. Segurança",
    paragraphs: [
      "O código inclui autenticação por sessão, cookies HttpOnly e SameSite=Lax, uso de Secure em produção e controles de autorização por usuário e papel nas rotas verificadas. Isso descreve mecanismos observados no repositório e não constitui garantia de segurança integral ou auditoria independente.",
      "Criptografia em repouso, controles de acesso operacional, monitoramento, resposta a incidentes e retenção de logs precisam ser confirmados com os responsáveis pela infraestrutura.",
    ],
  },
  {
    title: "7. Direitos e canal de atendimento",
    paragraphs: [
      "A pessoa titular pode solicitar informações sobre o tratamento, confirmação, acesso e correção de dados, além de outros direitos previstos na legislação aplicável. O tratamento de pedidos de exportação ou exclusão depende de verificação de identidade, análise de retenção e avaliação dos dados e backups envolvidos. O InvestLab ainda não oferece exportação ou exclusão integral automatizada.",
      "Canal oficial para solicitações e identificação do responsável: pendentes de confirmação pelo proprietário do produto. Não envie senhas, tokens de acesso ou extratos financeiros por canais que ainda não tenham sido confirmados.",
    ],
  },
  {
    title: "8. Atualizações desta política",
    paragraphs: [
      "Esta versão técnica foi preparada em 17 de outubro de 2026. Mudanças de finalidade, categorias de dados, prestadores ou operações devem ser refletidas em nova versão e avaliadas antes de sua publicação definitiva.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      title="Política de Privacidade"
      introduction="Resumo das categorias de dados e operações identificadas no código atual do InvestLab. Informações de operação e decisões jurídicas ainda estão pendentes de confirmação."
      sections={sections}
    />
  );
}
