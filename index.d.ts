declare module "browserstack-local" {
  interface Options {
    key: string;
    verbose: boolean;
    force: boolean;
    only: string;
    onlyAutomate: boolean;
    forceLocal: boolean;
    localIdentifier: string;
    folder: string;
    proxyHost: string;
    proxyPort: string;
    proxyUser: string;
    proxyPass: string;
    forceProxy: boolean;
    logFile: string;
    parallelRuns: string;
    binarypath: string;
    [key: string]: string | boolean;
  }

  type LocalOptions = Partial<Options>;

  class Local {
    start(options: LocalOptions, callback: (error?: Error) => void): void;
    isRunning(): boolean;
    stop(callback: (error?: Error) => void): void;
  }
}
