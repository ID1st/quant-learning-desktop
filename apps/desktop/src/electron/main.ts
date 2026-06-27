export interface DesktopWindowOptions {
  title: string;
  width: number;
  height: number;
  preloadEntry: string;
  rendererEntry: string;
}

export function createMainWindowConfig(): DesktopWindowOptions {
  return {
    title: "Quant Learning Desktop",
    width: 1440,
    height: 960,
    preloadEntry: "preload.js",
    rendererEntry: "index.html",
  };
}
