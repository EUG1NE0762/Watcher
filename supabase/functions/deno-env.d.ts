// Type stubs so the Deno entry points type-check under Node's tsc. Not used by the Deno runtime.
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
    toObject(): Record<string, string>;
  };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
