import { privacyCenterRepository } from "@/backend/repositories/privacy-center.repository";
import { ApplicationError } from "@/backend/errors/application-error";
import { getCurrentTermsVersion } from "@/lib/privacy-policy";

export class PrivacyCenterService {
  async getTermsAcceptances(userId: string) {
    const termsAcceptances =
      await privacyCenterRepository.listTermsAcceptances(userId);
    return {
      currentTermsVersion: getCurrentTermsVersion(),
      termsAcceptances,
    };
  }

  async hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
    const version = getCurrentTermsVersion();
    return privacyCenterRepository.hasTermsAcceptance(userId, version);
  }

  async acceptCurrentTerms(userId: string, termsVersion: string) {
    const currentVersion = getCurrentTermsVersion();
    if (termsVersion !== currentVersion) {
      throw new ApplicationError(
        "A versão dos Termos mudou. Atualize a página e leia a versão atual.",
        409,
      );
    }
    return privacyCenterRepository.recordTermsAcceptance(
      userId,
      currentVersion,
    );
  }
}

export const privacyCenterService = new PrivacyCenterService();
