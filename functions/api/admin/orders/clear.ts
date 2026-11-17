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
 * POST /api/admin/orders/clear
 * Protected Admin Endpoint: Clears all order documents and short_codes from Firestore.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  try {
    const [orderDocs, shortCodeDocs] = await Promise.all([
      dbCheck.client.listDocuments('orders'),
      dbCheck.client.listDocuments('short_codes')
    ]);

    const deleteWrites = [
      ...orderDocs.map((d) => ({ delete: `${dbCheck.databasePath}/documents/${d.path}` })),
      ...shortCodeDocs.map((d) => ({ delete: `${dbCheck.databasePath}/documents/${d.path}` }))
    ];

    for (let i = 0; i < deleteWrites.length; i += 450) {
      await dbCheck.client.commitBatch(deleteWrites.slice(i, i + 450));
    }

    return new Response(
      JSON.stringify({ success: true, deletedCount: orderDocs.length }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در پاکسازی سفارشات: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
