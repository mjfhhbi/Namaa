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
 * GET /api/admin/orders
 * Protected Admin Endpoint: Lists all customer orders sorted newest-first.
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
    const docs = await dbCheck.client.listDocuments('orders');
    const orders = docs
      .map((d) => d.data)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return new Response(
      JSON.stringify({ success: true, orders }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در دریافت سفارشات: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
