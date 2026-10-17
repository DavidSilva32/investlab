import { privacyCenterRepository } from "@/backend/repositories/privacy-center.repository";
import { getApprovedTermsVersion } from "@/lib/privacy-policy";

export class PrivacyCenterService {
  async getTermsAcceptances(userId: string) {
    const termsAcceptances =
      await privacyCenterRepository.listTermsAcceptances(userId);
    return {
      currentTermsVersion: getApprovedTermsVersion(),
      termsAcceptances,
    };
  }
}

export const privacyCenterService = new PrivacyCenterService();
