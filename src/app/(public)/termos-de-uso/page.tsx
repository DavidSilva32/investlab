import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";
import type { LegalDocumentSection } from "@/app/(public)/_components/legal-document-page";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Sobre o InvestLab",
    paragraphs: [
      "O InvestLab ajuda você a organizar informações da sua carteira, posições, movimentações, objetivos e dados de mercado. O acesso atual é feito por convite.",
      "A identificação de quem opera o serviço, os dados de contato, as condições de vigência e outros pontos contratuais ainda aguardam confirmação e revisão jurídica. Este documento é um rascunho, não a versão definitiva dos Termos de Uso.",
    ],
  },
  {
    title: "2. Sua conta e seu acesso",
    paragraphs: [
      "O acesso é criado por convite destinado à pessoa indicada. O convite pode expirar, ser revogado ou ser válido para um único uso, conforme as instruções apresentadas na ativação.",
      "Mantenha seus dados de acesso protegidos. Se suspeitar que outra pessoa acessou sua conta, procure o administrador que enviou seu convite. O canal oficial de suporte ainda está pendente de confirmação.",
    ],
  },
  {
    title: "3. Dados e arquivos que você envia",
    paragraphs: [
      "Você pode registrar posições e movimentações e importar arquivos compatíveis da B3 para organizar os dados correspondentes. Antes de enviar um arquivo, confira se selecionou o documento correto e se pode utilizá-lo.",
      "Os resultados dependem das informações disponíveis, da qualidade dos dados enviados e das fontes consultadas. Confira os registros importados e os dados apresentados antes de usá-los em suas decisões.",
    ],
  },
  {
    title: "4. Informações sobre investimentos",
    paragraphs: [
      "As informações, cálculos e cenários do InvestLab apoiam a organização e o acompanhamento da sua carteira. Eles não garantem resultados nem executam ordens. Considere sua situação e busque orientação profissional quando necessário.",
      "O enquadramento das funcionalidades e as condições aplicáveis ao uso do serviço ainda precisam de revisão jurídica. Este rascunho não deve ser tratado como uma definição definitiva sobre a natureza regulatória do produto.",
    ],
  },
  {
    title: "5. Disponibilidade e suporte",
    paragraphs: [
      "O serviço pode passar por manutenção ou ficar temporariamente indisponível. Informações de fontes externas também podem estar incompletas, indisponíveis ou desatualizadas. Não há, neste rascunho, um compromisso confirmado de disponibilidade ou prazo de suporte.",
      "Os procedimentos de suporte, continuidade do serviço e tratamento de incidentes dependem de confirmação de quem opera o InvestLab.",
    ],
  },
  {
    title: "6. Encerramento e pontos em aberto",
    paragraphs: [
      "O procedimento para encerrar uma conta e tratar os dados relacionados ainda está em definição. No momento, não há uma ferramenta de autoatendimento para excluir todos os dados da conta.",
      "A identificação do responsável, os canais de contato, a vigência, a lei aplicável, o foro e as condições finais ainda aguardam confirmação. Este texto permanece em revisão jurídica e não é uma versão definitiva.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalDocumentPage
      title="Termos de Uso"
      introduction="Este rascunho descreve as condições de uso que ainda estão em revisão. A identificação do responsável e outros pontos contratuais serão confirmados antes da aprovação final."
      sections={sections}
    />
  );
}
