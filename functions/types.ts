/**
 * Cloudflare Pages Functions Type Definitions for Namaa Store
 * Strictly standards-compliant with Cloudflare Workers / Pages runtime.
 */

export interface Env {
  ADMIN_PIN?: string;
  ADMIN_JWT_SECRET?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_DATABASE_ID?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  RATE_LIMIT_KV?: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
  };
}

export interface EventContext<Env, P extends string, Data> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<any>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
}

export type PagesFunction<
  Env = unknown,
  P extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>
> = (context: EventContext<Env, P, Data>) => Response | Promise<Response>;
