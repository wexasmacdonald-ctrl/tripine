// Local compatibility shim for the incomplete Next.js declaration payload shipped
// by the current Windows npm mirror. Remove when upstream package declarations are present.
declare module "next" {
  export interface Metadata { title?: string; description?: string }
  export interface NextConfig { [key: string]: unknown }
}

declare module "next/headers" {
  interface CookieOptions { httpOnly?: boolean; secure?: boolean; sameSite?: boolean | "lax" | "strict" | "none"; maxAge?: number; path?: string; [key: string]: unknown }
  interface CookieStore {
    get(name: string): { name: string; value: string } | undefined;
    set(name: string, value: string, options?: CookieOptions): void;
    delete(name: string): void;
    getAll(): Array<{ name: string; value: string }>;
    set(name: string, value: string, options?: CookieOptions & Record<string, unknown>): void;
  }
  export function cookies(): Promise<CookieStore>;
}

declare module "next/server" {
  export function after(callback: () => void | Promise<void>): void;
}

declare module "next/font/google" {
  export function Geist(options: { variable: string; subsets: string[] }): { variable: string };
  export function Geist_Mono(options: { variable: string; subsets: string[] }): { variable: string };
}
