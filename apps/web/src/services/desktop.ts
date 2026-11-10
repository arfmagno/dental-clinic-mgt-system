/**
 * Present only inside the Windows desktop app (apps/desktop/src/preload.cjs). There, the app is
 * served from app://clinic and API calls are forwarded to the clinic server address saved here,
 * so the Connect page asks for that address. In the browser/PWA the API is the page's own origin.
 */
export interface DesktopBridge {
  getServerUrl(): Promise<string>;
  /** Validates and saves the address; resolves to the normalised origin or rejects with a message. */
  setServerUrl(url: string): Promise<string>;
}

export const desktop: DesktopBridge | undefined = (globalThis as { clinicDesktop?: DesktopBridge }).clinicDesktop;
export const isDesktop = desktop !== undefined;

/** Electron wraps errors thrown in the main process: "Error invoking remote method '…': Error: <message>". */
export const bridgeErrorMessage = (e: unknown) => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e));
