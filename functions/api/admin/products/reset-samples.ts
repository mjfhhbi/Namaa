import { PagesFunction, Env } from '../../../types';
import { toFirestoreValue } from '../../../lib/firestoreRest';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth,
  createEdgeFirestoreClient,
  sanitizeProductPayload
} from '../../../lib/adminAuth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('POST, OPTIONS');
};

/**
 * POST /api/admin/products/reset-samples
 * Protected Admin Endpoint: Resets catalog (clears existing products and optionally writes provided products).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  let body: any = {};
  try {
    const contentType = context.request.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('application/json')) {
      body = await context.request.json();
    }
  } catch {
    body = {};
  }

  const requestedProducts: any[] = Array.isArray(body?.products) ? body.products : [];
  const sanitizedProducts: Record<string, any>[] = [];
  for (const item of requestedProducts) {
    const res = sanitizeProductPayload(item);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: res.error }),
        { status: 400, headers: ADMIN_SECURITY_HEADERS }
      );
    }
    sanitizedProducts.push(res.product);
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  try {
    const existingDocs = await dbCheck.client.listDocuments('products');
    const writes: any[] = existingDocs.map((d) => ({
      delete: `${dbCheck.databasePath}/documents/${d.path}`
    }));

    for (const prod of sanitizedProducts) {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(prod)) {
        if (v !== undefined) fields[k] = toFirestoreValue(v);
      }
      writes.push({
        update: {
          name: `${dbCheck.databasePath}/documents/products/${prod.id}`,
          fields
        }
      });
    }

    for (let i = 0; i < writes.length; i += 450) {
      await dbCheck.client.commitBatch(writes.slice(i, i + 450));
    }

    return new Response(
      JSON.stringify({ success: true, products: sanitizedProducts }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در بازنشانی کاتالوگ محصولات: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
