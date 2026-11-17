import { PagesFunction, Env } from '../../../types';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth,
  createEdgeFirestoreClient,
  isValidFirestoreDocId
} from '../../../lib/adminAuth';

const VALID_ORDER_STATUSES = new Set([
  'pending_receipt',
  'paid_pending_approval',
  'approved',
  'processing',
  'packaging',
  'shipped',
  'delivered',
  'refunded',
  'cancelled'
]);

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('POST, OPTIONS');
};

/**
 * POST /api/admin/orders/update
 * Protected Admin Endpoint: Updates order status, trackingCode, and refund metadata in Firestore.
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

  const { orderId, status, trackingCode, refundNotes, refundStatus, refundAmount } = body || {};
  if (!isValidFirestoreDocId(orderId) || !status) {
    return new Response(
      JSON.stringify({ error: 'شناسه سفارش معتبر و وضعیت جدید الزامی است.' }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  if (!VALID_ORDER_STATUSES.has(status)) {
    return new Response(
      JSON.stringify({ error: 'وضعیت سفارش انتخاب شده نامعتبر است.' }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  const updateData: Record<string, any> = {
    status,
    updatedAt: new Date().toISOString()
  };

  if (trackingCode !== undefined) updateData.trackingCode = trackingCode;
  if (refundNotes !== undefined) updateData.refundNotes = refundNotes;
  if (refundStatus !== undefined) {
    updateData.refundStatus = refundStatus;
  } else if (status === 'refunded') {
    updateData.refundStatus = 'refunded';
  }
  if (refundAmount !== undefined && Number(refundAmount) >= 0) {
    updateData.refundAmount = Number(refundAmount);
  }
  if (status === 'refunded') {
    updateData.refundDate = new Date().toISOString();
  }

  try {
    await dbCheck.client.setDocument(`orders/${orderId}`, updateData, true);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در بروزرسانی وضعیت سفارش: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
