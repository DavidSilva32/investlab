import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";
import type { LegalDocumentSection } from "@/app/(public)/_components/legal-document-page";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Sobre o InvestLab",
    paragraphs: [
      "O InvestLab é uma aplicação de acesso por convite para organizar informações de carteira, posições, movimentações, objetivos e dados de mercado. O serviço está em preparação para uso externo; estes termos são uma versão técnica em revisão jurídica.",
      "A pessoa responsável pela operação, sua identificação jurídica, endereço e condições definitivas de vigência ainda precisam ser confirmados.",
    ],
  },
  {
    title: "2. Conta e acesso",
    paragraphs: [
      "O acesso atual é criado por convite. A pessoa usuária deve proteger suas credenciais, manter seus dados de acesso sob controle e avisar o canal de suporte que vier a ser oficialmente confirmado se suspeitar de acesso indevido.",
      "Convites são destinados à pessoa indicada e podem expirar, ser revogados ou ser usados uma única vez, conforme o fluxo exibido no momento da ativação.",
    ],
  },
  {
    title: "3. Informações e arquivos enviados",
    paragraphs: [
      "A aplicação permite incluir posições e movimentações manualmente e importar arquivos compatíveis da B3 para processar e organizar os registros correspondentes. Antes de enviar um arquivo, confira se você pode utilizá-lo e se selecionou o documento correto.",
      "Os resultados dependem dos dados disponíveis, da qualidade do arquivo e das fontes consultadas. Confira os dados importados antes de usá-los para tomar decisões.",
    ],
  },
  {
    title: "4. Natureza informativa das funcionalidades",
    paragraphs: [
      "As informações, cálculos e cenários do InvestLab servem para organização e acompanhamento. Eles não garantem resultados, não executam ordens e não substituem avaliação profissional apropriada à situação de cada pessoa.",
      "A aplicação não deve ser entendida, com base nesta versão técnica, como serviço de consultoria, análise ou recomendação individualizada de investimentos. O enquadramento jurídico e regulatório das funcionalidades será confirmado antes da aprovação definitiva destes termos.",
    ],
  },
  {
    title: "5. Disponibilidade e segurança",
    paragraphs: [
      "O serviço pode ser atualizado, ficar indisponível ou apresentar dados incompletos, atrasados ou indisponíveis por causa de manutenção, conectividade ou fontes externas. Não há, nesta versão, um compromisso de disponibilidade ou prazo de suporte confirmado.",
      "As medidas de segurança implementadas e os procedimentos operacionais de suporte, continuidade e incidentes serão detalhados após confirmação do responsável pela operação e revisão técnica e jurídica.",
    ],
  },
  {
    title: "6. Encerramento e disposições pendentes",
    paragraphs: [
      "O procedimento para encerrar uma conta, tratar dados associados e cumprir eventuais obrigações de retenção ainda está em definição. Não há ferramenta de autoatendimento para exclusão integral de conta.",
      "Identificação do controlador, endereço, foro, lei aplicável, canais de contato, vigência e condições finais permanecem pendentes de confirmação. Esta versão não representa aprovação jurídica nem substitui os termos definitivos.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalDocumentPage
      title="Termos de Uso"
      introduction="Condições propostas para o acesso ao InvestLab. Este texto descreve o funcionamento observado no produto e identifica os pontos que ainda dependem de confirmação."
      sections={sections}
    />
  );
}
