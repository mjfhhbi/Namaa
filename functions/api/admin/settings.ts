import { PagesFunction, Env } from '../../types';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth,
  createEdgeFirestoreClient
} from '../../lib/adminAuth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('GET, OPTIONS');
};

/**
 * GET /api/admin/settings
 * Protected Admin Endpoint: Fetches merged public & private settings from Firestore.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  try {
    const [publicDoc, privateDoc] = await Promise.all([
      dbCheck.client.getDocument('settings/public'),
      dbCheck.client.getDocument('settings/private')
    ]);

    const merged = {
      ...(publicDoc.exists ? publicDoc.data : {}),
      ...(privateDoc.exists ? privateDoc.data : {})
    };

    return new Response(
      JSON.stringify({ success: true, settings: merged }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در دریافت تنظیمات مدیریت: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
