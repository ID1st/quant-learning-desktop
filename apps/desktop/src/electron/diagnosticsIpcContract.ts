export const diagnosticsIpcChannels = {
  exportPackage: "diagnostics:export",
} as const;

export interface DiagnosticExportSummary {
  readonly fileName: string;
  readonly includedMinidumps: number;
  readonly excludedMinidumps: number;
}

export type DiagnosticExportResult =
  | { readonly ok: true; readonly data: DiagnosticExportSummary }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "CANCELLED" | "EXPORT_FAILED";
        readonly message: string;
      };
    };

export interface DiagnosticPackageExporter {
  exportPackage(): Promise<DiagnosticExportResult>;
}

export interface DiagnosticsIpcHandlers {
  exportPackage(): Promise<DiagnosticExportResult>;
}

export interface DiagnosticsIpcBridge {
  exportPackage(): Promise<DiagnosticExportResult>;
}

export function createDiagnosticsIpcHandlers(
  exporter: DiagnosticPackageExporter,
): DiagnosticsIpcHandlers {
  return {
    exportPackage: () => exporter.exportPackage(),
  };
}
