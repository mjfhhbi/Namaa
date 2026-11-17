import { PagesFunction, Env } from '../../../../types';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth,
  createEdgeFirestoreClient,
  isValidFirestoreDocId
} from '../../../../lib/adminAuth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('POST, OPTIONS');
};

/**
 * POST /api/admin/orders/:id/resend-ntfy
 * Protected Admin Endpoint: Resends order notification to the configured ntfy topic.
 */
export const onRequestPost: PagesFunction<Env, 'id'> = async (context) => {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const orderIdParam = Array.isArray(context.params?.id) ? context.params.id[0] : context.params?.id;
  const orderId = (orderIdParam || '').trim();

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
    const [orderSnap, privateSnap] = await Promise.all([
      dbCheck.client.getDocument(`orders/${orderId}`),
      dbCheck.client.getDocument('settings/private')
    ]);

    if (!orderSnap.exists || !orderSnap.data) {
      return new Response(
        JSON.stringify({ error: 'سفارش مورد نظر در پایگاه داده یافت نشد.' }),
        { status: 404, headers: ADMIN_SECURITY_HEADERS }
      );
    }

    const orderData = orderSnap.data;
    const topic = (privateSnap.exists && privateSnap.data?.ntfyTopic
      ? String(privateSnap.data.ntfyTopic)
      : 'nama_store_orders_1383').trim();

    const itemsSummary = (orderData.items || [])
      .map((i: any) => `• ${i.name} (${i.quantity} عدد) - ${(Number(i.price) * Number(i.quantity)).toLocaleString('fa-IR')} تومان`)
      .join('\n');

    const bodyText = [
      `سفارش: ${orderData.id} (کد پیگیری: ${orderData.shortCode || orderData.id})`,
      `خریدار: ${orderData.customerName}`,
      `تلفن: ${orderData.customerPhone}`,
      `مقصد: ${orderData.province || ''} ${orderData.city || ''}`,
      `آدرس: ${orderData.address || ''}`,
      `مبلغ کل: ${Number(orderData.totalAmount || 0).toLocaleString('fa-IR')} تومان`,
      itemsSummary
    ].join('\n');

    const ntfyRes = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        'Title': `اعلان سفارش ناما (${orderData.shortCode || orderData.id})`,
        'Priority': '4',
        'Tags': 'shopping_bags,white_check_mark',
        'Content-Type': 'text/plain; charset=utf-8'
      },
      body: bodyText
    });

    if (!ntfyRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `ارسال اعلان به تاپیک ntfy با خطا مواجه شد (کد ${ntfyRes.status}).` }),
        { status: 502, headers: ADMIN_SECURITY_HEADERS }
      );
    }

    await dbCheck.client.setDocument(`orders/${orderId}`, {
      ntfySent: true,
      ntfySentAt: new Date().toISOString()
    }, true).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: `اعلان سفارش ${orderData.id} با تمامی مشخصات مجدداً به تاپیک ntfy ارسال گردید.`
      }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در ارسال مجدد اعلان: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
