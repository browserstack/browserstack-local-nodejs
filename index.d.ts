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

  interface LocalError extends Error {
    /** Raw binary output (truncated to 1KB) attached when the output could not be parsed. */
    extra?: string;
  }

  class Local {
    start(options: Partial<Options>, callback: (error?: LocalError) => void): void;
    startSync(options: Partial<Options>): LocalError | undefined;
    isRunning(): boolean;
    stop(callback: (error?: LocalError) => void): void;
  }
}
