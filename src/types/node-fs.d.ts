// Mínimo de node:fs/promises que usan los tests (sin @types/node en el proyecto).
declare module 'node:fs/promises' {
  export function stat(path: URL | string): Promise<{ size: number }>;
  export function readFile(path: URL | string): Promise<Uint8Array>;
}
