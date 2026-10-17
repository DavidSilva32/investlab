import { privacyCenterRepository } from "@/backend/repositories/privacy-center.repository";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";

export class PrivacyCenterService {
  async getTermsAcceptances(userId: string) {
    const termsAcceptances =
      await privacyCenterRepository.listTermsAcceptances(userId);
    return { currentTermsVersion: CURRENT_TERMS_VERSION, termsAcceptances };
  }
}

export const privacyCenterService = new PrivacyCenterService();
