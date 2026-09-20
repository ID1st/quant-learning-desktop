export function createRendererStartupQuery(version: string, processId: number, now = Date.now()) {
  return {
    startup: `${version}-${processId}-${now}`,
  };
}
