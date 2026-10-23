import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";
import type { LegalDocumentSection } from "@/app/(public)/_components/legal-document-page";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Quem responde pelo tratamento",
    paragraphs: [
      "A identidade e os dados de contato da pessoa ou organização responsável pelo InvestLab ainda aguardam confirmação. Este rascunho não substitui essa identificação nem a revisão jurídica necessária antes da aprovação final.",
    ],
  },
  {
    title: "2. Quais dados são usados e para quê",
    paragraphs: [
      "Para criar e proteger sua conta, o InvestLab usa dados como nome, e-mail e informações de acesso protegidas. Também registra sessões, convites e tentativas de acesso. Os registros de sessão podem incluir endereço IP e informações sobre o navegador.",
      "Para organizar sua carteira, o serviço guarda posições, instituições financeiras, movimentações, objetivos, estratégias e classificações que você registra. Quando você importa um arquivo compatível da B3, seus dados são processados para organizar os registros correspondentes. São guardados o nome e uma identificação digital do arquivo, além dos dados resultantes. Ainda é preciso confirmar se o arquivo original também é guardado e por quanto tempo.",
      "Também podem ser gerados registros técnicos para operar e proteger o serviço. Os usos específicos, quem pode acessá-los e por quanto tempo são mantidos ainda precisam de confirmação dos responsáveis pela operação.",
    ],
  },
  {
    title: "3. Serviços e fontes de dados",
    paragraphs: [
      "O serviço usa Neon para o banco de dados e Vercel para hospedagem. Para apresentar informações de mercado, consulta fontes como BRAPI, CVM, Banco Central e Tesouro Direto. Algumas telas também podem solicitar imagens de logotipos ao domínio icons.brapi.dev.",
      "A presença desses serviços no produto foi identificada, mas os contratos, as funções de cada fornecedor, os locais de processamento, eventuais prestadores adicionais e os prazos de guarda ainda precisam ser confirmados. A configuração efetiva da hospedagem e dos registros operacionais também aguarda conferência.",
    ],
  },
  {
    title: "4. Prazo de armazenamento e segurança",
    paragraphs: [
      "Os prazos de armazenamento de dados e registros, o ciclo de cópias de segurança e a eliminação de dados dessas cópias ainda não foram confirmados. Não há prazos definitivos que possam ser informados nesta versão.",
      "O serviço conta com controles de acesso e recursos para proteger a conta. A confirmação das medidas operacionais, da proteção das bases e dos procedimentos em caso de incidente ainda está pendente; por isso, este texto não representa uma garantia de segurança integral.",
    ],
  },
  {
    title: "5. Seus direitos e como fazer uma solicitação",
    paragraphs: [
      "Você pode solicitar informações sobre o uso dos seus dados e exercer os direitos previstos na legislação aplicável, como pedir acesso ou correção. Pedidos de exportação ou exclusão dependem de confirmação da identidade e da análise de obrigações de guarda e de cópias de segurança. O serviço ainda não oferece uma ferramenta para exportar ou excluir automaticamente todos os dados da conta.",
      "O canal oficial de privacidade e a identificação do responsável ainda aguardam confirmação. Para uma solicitação, procure o administrador do InvestLab por um canal que você já conheça. Não envie senhas, códigos de acesso ou extratos financeiros por canais cuja identidade não tenha sido confirmada.",
    ],
  },
  {
    title: "6. Bases legais e revisão",
    paragraphs: [
      "As bases legais aplicáveis a cada finalidade ainda estão em avaliação. O registro de aceite dos Termos de Uso é separado e não representa uma autorização genérica para qualquer uso de dados pessoais.",
      "Este documento é um rascunho atualizado em 17 de outubro de 2026. A identificação do responsável, os fornecedores e prazos pendentes e as bases legais devem ser confirmados antes da publicação de uma versão definitiva.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      title="Política de Privacidade"
      introduction="Saiba quais informações são usadas para manter sua conta e organizar sua carteira. Os dados de contato do responsável e alguns detalhes de operação ainda aguardam confirmação."
      sections={sections}
    />
  );
}
