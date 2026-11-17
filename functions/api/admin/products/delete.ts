import { PagesFunction, Env } from '../../../types';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth,
  createEdgeFirestoreClient,
  isValidFirestoreDocId
} from '../../../lib/adminAuth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('POST, DELETE, OPTIONS');
};

async function handleDeleteProduct(context: Parameters<PagesFunction<Env>>[0]): Promise<Response> {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const url = new URL(context.request.url);
  let body: any = null;
  try {
    const contentType = context.request.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('application/json')) {
      body = await context.request.json();
    }
  } catch {
    body = null;
  }

  const productId =
    body?.productId ||
    body?.id ||
    url.searchParams.get('productId') ||
    url.searchParams.get('id');

  if (!isValidFirestoreDocId(productId)) {
    return new Response(
      JSON.stringify({ error: 'شناسه محصول معتبر نیست یا ارسال نشده است.' }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  try {
    await dbCheck.client.deleteDocument(`products/${productId}`);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در حذف محصول از پایگاه داده: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
}

/**
 * POST /api/admin/products/delete
 */
export const onRequestPost: PagesFunction<Env> = handleDeleteProduct;

/**
 * DELETE /api/admin/products/delete
 */
export const onRequestDelete: PagesFunction<Env> = handleDeleteProduct;
