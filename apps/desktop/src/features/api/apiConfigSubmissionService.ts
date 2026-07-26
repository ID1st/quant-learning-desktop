import {
  resolveAlphaFeedCredentials,
  verifyAlphaFeedApiConfig,
  verifyLongPortApiConfig,
  type AlphaFeedApiBinding,
  type AlphaFeedApiForm,
  type LongPortApiBinding,
  type LongPortApiForm,
} from "./apiConfigService.ts";

interface BackupProviderForms {
  alphaFeed: AlphaFeedApiForm;
  longPort: LongPortApiForm;
}

interface BackupProviderVerificationDependencies {
  resolveAlphaFeedCredentials: typeof resolveAlphaFeedCredentials;
  verifyAlphaFeedApiConfig: typeof verifyAlphaFeedApiConfig;
  verifyLongPortApiConfig: typeof verifyLongPortApiConfig;
}

type BackupProviderVerificationResult =
  | {
      provider: "alphafeed-rest";
      credentials: AlphaFeedApiForm;
      binding: AlphaFeedApiBinding;
    }
  | {
      provider: "longbridge";
      binding: LongPortApiBinding;
    };

const defaultDependencies: BackupProviderVerificationDependencies = {
  resolveAlphaFeedCredentials,
  verifyAlphaFeedApiConfig,
  verifyLongPortApiConfig,
};

export async function verifySelectedBackupProvider(
  provider: "alphafeed-rest" | "longbridge",
  forms: BackupProviderForms,
  dependencies: BackupProviderVerificationDependencies = defaultDependencies,
): Promise<BackupProviderVerificationResult> {
  if (provider === "longbridge") {
    return {
      provider,
      binding: await dependencies.verifyLongPortApiConfig(forms.longPort),
    };
  }

  const credentials = await dependencies.resolveAlphaFeedCredentials(forms.alphaFeed);
  return {
    provider,
    credentials,
    binding: await dependencies.verifyAlphaFeedApiConfig(credentials),
  };
}
