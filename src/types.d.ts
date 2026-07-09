declare module 'qrcode' {
  interface QRCodeOptions {
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeOptions): Promise<string>;
  };

  export default QRCode;
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(source: unknown): { promise: Promise<PdfJsDocument> };

  export interface PdfJsDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfJsPage>;
  }

  export interface PdfJsPage {
    getTextContent(): Promise<{ items: PdfJsTextItem[] }>;
  }

  export interface PdfJsTextItem {
    str: string;
    width: number;
    height: number;
    transform: number[];
  }
}
