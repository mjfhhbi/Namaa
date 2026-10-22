import { PagesFunction, Env } from './types';

const SECURITY_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Edge-Runtime': 'cloudflare-pages'
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS
    }
  });
};

/**
 * GET /healthz
 * Cloudflare Pages Functions Health Check
 */
export const onRequestGet: PagesFunction<Env> = async () => {
  return new Response('OK', {
    status: 200,
    headers: SECURITY_HEADERS
  });
};
