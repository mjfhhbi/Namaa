import { PagesFunction, Env } from '../types';
import { fromFirestoreFields } from '../lib/firestoreRest';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
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
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS
    }
  });
};

const LEGACY_MOCK_IDS = new Set([
  'prod-1', 'prod-2', 'prod-3', 'prod-4', 'prod-5', 'prod-6',
  'prod-7', 'prod-8', 'prod-9', 'prod-10', 'prod-11', 'prod-12',
  'prod_saffron_super_negin'
]);

/**
 * GET /api/products
 * Public products catalog: Reads active products from Firestore REST API.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const projectId = context.env.FIREBASE_PROJECT_ID?.trim();
  const databaseId = context.env.FIRESTORE_DATABASE_ID?.trim() || '(default)';

  if (!projectId) {
    return new Response(
      JSON.stringify({ success: true, products: [] }),
      { status: 200, headers: SECURITY_HEADERS }
    );
  }

  try {
    const allProducts: Record<string, any>[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({ pageSize: '300' });
      if (pageToken) params.set('pageToken', pageToken);
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/products?${params.toString()}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });

      if (!res.ok) break;
      const body = await res.json() as any;
      const docs = Array.isArray(body?.documents) ? body.documents : [];
      for (const d of docs) {
        const parsed = fromFirestoreFields(d.fields || {});
        if (parsed.id && !LEGACY_MOCK_IDS.has(parsed.id)) {
          allProducts.push(parsed);
        }
      }
      pageToken = body?.nextPageToken;
    } while (pageToken);

    return new Response(
      JSON.stringify({ success: true, products: allProducts }),
      { status: 200, headers: SECURITY_HEADERS }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: true, products: [] }),
      { status: 200, headers: SECURITY_HEADERS }
    );
  }
};
