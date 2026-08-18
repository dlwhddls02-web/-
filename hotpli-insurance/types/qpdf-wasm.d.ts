declare module "@jspawn/qpdf-wasm/qpdf.js" {
  interface QpdfModule {
    callMain(args: string[]): number;
    FS: {
      writeFile(path: string, data: Uint8Array): void;
      readFile(path: string): Uint8Array;
    };
  }

  interface QpdfInitOptions {
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      receiveInstance: (
        instance: WebAssembly.Instance,
        module: WebAssembly.Module,
      ) => void,
    ) => Record<string, never>;
    noInitialRun?: boolean;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }

  export default function initQpdf(options?: QpdfInitOptions): Promise<QpdfModule>;
}
