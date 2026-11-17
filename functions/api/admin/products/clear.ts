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
 * POST /api/admin/products/clear
 * Protected Admin Endpoint: Deletes all product documents in Firestore.
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
    const existingDocs = await dbCheck.client.listDocuments('products');
    const deleteWrites = existingDocs.map((d) => ({
      delete: `${dbCheck.databasePath}/documents/${d.path}`
    }));

    // Firestore commit supports up to 500 writes per batch
    for (let i = 0; i < deleteWrites.length; i += 450) {
      const chunk = deleteWrites.slice(i, i + 450);
      await dbCheck.client.commitBatch(chunk);
    }

    return new Response(
      JSON.stringify({ success: true, deletedCount: existingDocs.length }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در پاک‌سازی کاتالوگ محصولات: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
