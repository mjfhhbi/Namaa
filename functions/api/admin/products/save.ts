import { PagesFunction, Env } from '../../../types';
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
 * POST /api/admin/products/save
 * Protected Admin Endpoint: Creates or updates a product document in Firestore.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'داده‌های ارسالی نامعتبر است. ساختار JSON الزامی است.' }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  const rawProduct = body && typeof body === 'object' && body.product ? body.product : body;
  const validation = sanitizeProductPayload(rawProduct);
  if (!validation.ok) {
    return new Response(
      JSON.stringify({ error: validation.error }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  try {
    await dbCheck.client.setDocument(`products/${validation.product.id}`, validation.product, false);
    return new Response(
      JSON.stringify({ success: true, product: validation.product }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در ذخیره محصول در پایگاه داده: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
