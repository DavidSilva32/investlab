const supportMessage =
  "Olá, preciso de ajuda para recuperar o acesso à minha conta do InvestLab. Posso confirmar minha identidade por um canal confiável. Não enviarei minha senha por aqui.";

export function getSupportWhatsAppUrl(value: string | undefined) {
  if (!value || !/^\d+$/.test(value) || value.startsWith("0")) {
    return null;
  }

  const digits = value;
  const internationalNumber =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;

  if (internationalNumber.length < 12 || internationalNumber.length > 15) {
    return null;
  }

  return `https://wa.me/${internationalNumber}?text=${encodeURIComponent(supportMessage)}`;
}
