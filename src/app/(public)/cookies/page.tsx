import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";
import type { LegalDocumentSection } from "@/app/(public)/_components/legal-document-page";

const sections: LegalDocumentSection[] = [
  {
    title: "1. Como o navegador mantém o acesso",
    paragraphs: [
      "O InvestLab usa um cookie de sessão para manter sua conta conectada enquanto você utiliza o serviço. A sessão pode durar até sete dias e pode terminar antes quando você sair da conta ou quando ela expirar.",
      "Em uma atividade de suporte autorizada, pode ser usado um cookie temporário por até 30 minutos. Ele apoia esse acesso de suporte e não é usado para publicidade.",
      "Esses recursos são necessários para as funções solicitadas. Desativá-los pode impedir o acesso ou o suporte autorizado.",
    ],
  },
  {
    title: "2. Preferências guardadas no seu navegador",
    paragraphs: [
      "O navegador também pode guardar sua preferência de tema, critérios personalizados de análise e itens vistos recentemente. Essas informações ajudam a manter preferências e agilizar o uso; não são cookies e não são usadas para publicidade ou medição de anúncios.",
      "Essas informações permanecem no navegador até serem substituídas, removidas pelo InvestLab ou apagadas por você nas configurações do navegador. Algumas preferências podem ser perdidas e precisarão ser definidas novamente.",
    ],
  },
  {
    title: "3. Cookies opcionais e consentimento",
    paragraphs: [
      "No momento, não foram identificadas tecnologias opcionais de publicidade ou medição que exijam uma escolha de consentimento. Por isso, o InvestLab não exibe um banner nem apresenta opções que não correspondam a recursos em uso.",
      "Essa avaliação ainda depende de confirmação da operação do serviço. Se tecnologias opcionais forem identificadas ou adicionadas, este documento será revisto e as escolhas necessárias serão apresentadas antes do uso dessas tecnologias.",
    ],
  },
  {
    title: "4. Serviços externos",
    paragraphs: [
      "Algumas telas podem solicitar imagens de logotipos ao serviço icons.brapi.dev. Essa solicitação é diferente de um cookie; os dados técnicos recebidos pelo serviço e os prazos aplicáveis ainda precisam ser confirmados.",
    ],
  },
  {
    title: "5. O que ainda está em confirmação",
    paragraphs: [
      "A lista completa de cookies e dados guardados no navegador, as configurações do serviço em produção, os responsáveis por cada operação e os prazos de retenção ainda aguardam confirmação. Este documento é um rascunho e será atualizado após essa conferência e revisão jurídica.",
    ],
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalDocumentPage
      title="Política de Cookies"
      introduction="Este rascunho explica os recursos do navegador encontrados até agora e o que ainda precisa ser confirmado. Não foram identificadas tecnologias opcionais que exijam um banner de consentimento."
      sections={sections}
    />
  );
}
