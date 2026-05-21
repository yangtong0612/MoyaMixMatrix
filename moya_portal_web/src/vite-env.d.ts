/// <reference types="vite/client" />

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}

declare module 'mammoth/mammoth.browser' {
  export interface MammothRawTextResult {
    value: string;
    messages: unknown[];
  }

  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothRawTextResult>;
  };

  export default mammoth;
}
