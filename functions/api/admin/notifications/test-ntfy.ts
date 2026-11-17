import { PagesFunction, Env } from '../../../types';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth,
  createEdgeFirestoreClient
} from '../../../lib/adminAuth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('POST, OPTIONS');
};

/**
 * POST /api/admin/notifications/test-ntfy
 * Protected Admin Endpoint: Sends a test notification to the configured ntfy topic.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  let body: any = {};
  try {
    const ct = context.request.headers.get('content-type') || '';
    if (ct.toLowerCase().includes('application/json')) {
      body = await context.request.json();
    }
  } catch {
    body = {};
  }

  let topic = 'nama_store_orders_1383';
  const dbCheck = createEdgeFirestoreClient(context.env);
  if (dbCheck.ok) {
    try {
      const privateSnap = await dbCheck.client.getDocument('settings/private');
      if (privateSnap.exists && privateSnap.data?.ntfyTopic) {
        topic = String(privateSnap.data.ntfyTopic).trim() || topic;
      }
    } catch {
      // Fallback safely
    }
  }

  const customMessage = typeof body?.message === 'string' && body.message.trim()
    ? body.message.trim()
    : 'سیستم اعلان فروشگاه ناما با موفقیت متصل است و تمامی سفارشات جدید فوراً ارسال خواهند شد.';

  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        'Title': 'تست اتصال اعلان فروشگاه ناما',
        'Priority': '4',
        'Tags': 'bell,white_check_mark',
        'Content-Type': 'text/plain; charset=utf-8'
      },
      body: customMessage
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `ارسال اعلان تست به ntfy با شکست مواجه شد (کد ${res.status}).` }),
        { status: 502, headers: ADMIN_SECURITY_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'اعلان تست با موفقیت از سرور به تاپیک اختصاصی ntfy ارسال شد.'
      }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در تست اعلان: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
