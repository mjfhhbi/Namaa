import { PagesFunction, Env } from '../../../types';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth,
  createEdgeFirestoreClient,
  isValidFirestoreDocId
} from '../../../lib/adminAuth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('POST, OPTIONS');
};

/**
 * POST /api/admin/orders/delete
 * Protected Admin Endpoint: Deletes an order and its short_codes index if present.
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
      JSON.stringify({ error: 'داده‌های ارسالی نامعتبر است.' }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  const orderId = body?.orderId;
  if (!isValidFirestoreDocId(orderId)) {
    return new Response(
      JSON.stringify({ error: 'شناسه سفارش معتبر نیست یا ارسال نشده است.' }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  try {
    const existing = await dbCheck.client.getDocument(`orders/${orderId}`);
    await dbCheck.client.deleteDocument(`orders/${orderId}`);
    if (existing.exists && existing.data?.shortCode && isValidFirestoreDocId(String(existing.data.shortCode))) {
      await dbCheck.client.deleteDocument(`short_codes/${String(existing.data.shortCode)}`).catch(() => {});
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در حذف سفارش: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
