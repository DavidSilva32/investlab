export type LegalDocumentSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const TERMS_OF_USE_SECTIONS: LegalDocumentSection[] = [
  {
    title: "1. Sobre o InvestLab",
    paragraphs: [
      "O InvestLab é uma plataforma para organizar informações de investimentos e acompanhar uma carteira. Entre os recursos disponíveis estão o registro de posições e movimentações, a importação de arquivos compatíveis da B3, objetivos, planejamento, conteúdos educativos e análises.",
      "Esta é a versão inicial dos Termos de Uso do produto. Ela descreve o funcionamento atual da plataforma e pode ser atualizada quando os recursos ou as condições de uso mudarem.",
    ],
  },
  {
    title: "2. Conta e acesso",
    paragraphs: [
      "O acesso atual é criado por convite. O convite é destinado à pessoa indicada, pode expirar ou ser revogado e só pode ser usado uma vez. Para ativar a conta, a pessoa escolhe uma senha e aceita a versão destes Termos exibida durante a ativação.",
      "Cada pessoa deve usar a própria conta e manter suas credenciais em segurança. Não compartilhe sua senha. Se perder acesso ou suspeitar que outra pessoa usou sua conta, procure o administrador que enviou seu convite.",
    ],
  },
  {
    title: "3. Informações e arquivos",
    paragraphs: [
      "Você pode informar dados da carteira e importar arquivos aceitos pela plataforma. Antes de confirmar um cadastro ou uma importação, confira os dados apresentados e corrija o que estiver incorreto.",
      "Você é responsável por usar apenas informações e arquivos que pode enviar. A plataforma pode rejeitar arquivos incompatíveis ou dados incompletos. Os resultados dependem da qualidade e da atualidade das informações fornecidas e das fontes consultadas.",
    ],
  },
  {
    title: "4. Informações financeiras",
    paragraphs: [
      "Cálculos, indicadores, projeções e análises ajudam a organizar e acompanhar informações. Eles dependem dos dados disponíveis e não garantem resultados futuros. Confira as premissas e os valores antes de tomar decisões.",
      "O InvestLab não envia ordens de compra ou venda de ativos. A plataforma não substitui a avaliação da sua situação financeira nem a orientação de um profissional escolhido por você.",
    ],
  },
  {
    title: "5. Uso adequado e disponibilidade",
    paragraphs: [
      "Use a plataforma de forma lícita, para fins compatíveis com seus recursos e sem tentar acessar contas ou dados de outras pessoas, interferir no serviço ou contornar seus controles de segurança.",
      "A plataforma pode ficar temporariamente indisponível para manutenção ou por falhas técnicas. Dados de mercado e serviços externos podem estar indisponíveis, incompletos ou desatualizados. Confira as informações antes de utilizá-las.",
    ],
  },
  {
    title: "6. Dados e documentos",
    paragraphs: [
      "O tratamento de dados pessoais é explicado na Política de Privacidade, disponível nesta plataforma. As escolhas sobre cookies são apresentadas separadamente na Política de Cookies e no controle de preferências; aceitar estes Termos não altera essa escolha.",
      "Para pedir acesso ou correção de informações, entre em contato com o administrador que enviou seu convite. O InvestLab ainda não oferece uma ferramenta de autoatendimento para exportar ou excluir todos os dados da conta.",
    ],
  },
  {
    title: "7. Atualizações e encerramento do acesso",
    paragraphs: [
      "Quando uma nova versão destes Termos exigir novo aceite, ela será apresentada antes de continuar usando as áreas privadas da plataforma. O histórico registra a versão aceita e a data do aceite.",
      "O acesso pode ser encerrado ou suspenso pelo administrador responsável pela conta. Para solicitar o encerramento da sua conta ou esclarecer uma situação de acesso, procure esse administrador.",
    ],
  },
];
