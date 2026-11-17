import { PagesFunction, Env } from '../../types';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth
} from '../../lib/adminAuth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('POST, OPTIONS');
};

/**
 * POST /api/admin/logout
 * Stateless JWT logout acknowledgement endpoint.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  return new Response(
    JSON.stringify({ success: true, message: 'نشست مدیریت با موفقیت ابطال شد.' }),
    { status: 200, headers: ADMIN_SECURITY_HEADERS }
  );
};
