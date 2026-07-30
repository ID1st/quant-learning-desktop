export async function clearLocalUserProfile(): Promise<void> {
  const secureCredentials = window.quantDesktop?.secureCredentials;
  await Promise.allSettled([
    secureCredentials?.clearAlphaFeed(),
    secureCredentials?.clearAlphaFeedStream(),
    secureCredentials?.clearLongPort(),
  ]);

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("quant-learning.")) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }
}
