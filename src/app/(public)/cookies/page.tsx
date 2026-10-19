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
      "O InvestLab apresenta um aviso para você aceitar cookies ou rejeitar os opcionais. Os cookies necessários para manter sua conta conectada permanecem ativos para o funcionamento do serviço, independentemente dessa escolha.",
      "No momento, não foram identificadas tecnologias opcionais em uso. Assim, aceitar cookies ou rejeitar os opcionais não ativa nem desativa recursos opcionais atualmente. A escolha fica salva neste navegador e pode ser revista pela opção no rodapé ou na Central de Privacidade.",
      "Essa avaliação ainda depende de confirmação da operação do serviço. Se tecnologias opcionais forem identificadas ou adicionadas, este documento será revisto e elas só serão ativadas após a escolha afirmativa correspondente.",
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
      introduction="Este rascunho explica os recursos do navegador encontrados até agora e o que ainda precisa ser confirmado. O aviso de cookies permite aceitar ou rejeitar opções adicionais; os cookies necessários permanecem ativos."
      sections={sections}
      updatedAt="19 de outubro de 2026"
    />
  );
}
