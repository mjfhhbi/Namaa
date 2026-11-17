import { PagesFunction, Env } from '../../../types';
import {
  ADMIN_SECURITY_HEADERS,
  createCorsPreflightResponse,
  requireEdgeAdminAuth,
  createEdgeFirestoreClient
} from '../../../lib/adminAuth';

const PUBLIC_SETTING_KEYS = [
  'storeName', 'slogan', 'shippingCost', 'freeShippingThreshold', 'supportPhone',
  'supportWhatsApp', 'supportInstagram', 'supportTelegram', 'supportAddress',
  'announcement', 'isStoreOpen', 'storeClosedMessage', 'shippingNote',
  'introEnabled', 'introBadge', 'introTitle', 'introSlogan', 'introSubtitle', 'introButtonText',
  'footerCopyright',
  'heroBadge', 'heroTitle', 'heroSubtitle', 'heroButtonText',
  'promoBadge', 'promoTitle', 'promoSubtitle', 'aboutText',
  'qualityBadge1', 'qualityBadge2', 'qualityBadge3', 'qualityBadge4',
  'refundPolicyTitle', 'refundPolicyText', 'adminLoginButtonText',
  'checkoutTitle', 'checkoutSubtitle', 'checkoutSubmitButtonText',
  'trackingModalTitle', 'trackingModalSubtitle', 'trackingInputPlaceholder',
  'footerAboutTitle', 'footerAboutText', 'footerTrustTitle', 'footerTrustText', 'footerContactTitle',
  'cartTitle', 'cartEmptyMessage',
  'customCategories', 'zarinpalEnabled', 'zarinpalSandbox'
];

const PRIVATE_SETTING_KEYS = [
  'cardNumber', 'cardHolder', 'bankName', 'shabaNumber', 'ntfyTopic',
  'discountCodes', 'zarinpalMerchantId'
];

export const onRequestOptions: PagesFunction<Env> = async () => {
  return createCorsPreflightResponse('POST, OPTIONS');
};

/**
 * POST /api/admin/settings/update
 * Protected Admin Endpoint: Separates public and private settings and writes them to Firestore.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const authResult = await requireEdgeAdminAuth(context.request, context.env);
  if (!authResult.authorized) {
    return authResult.response;
  }

  let settings: any;
  try {
    settings = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'داده‌های ارسالی نامعتبر است. ساختار JSON الزامی است.' }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  if (!settings || typeof settings !== 'object' || !settings.storeName) {
    return new Response(
      JSON.stringify({ error: 'اطلاعات تنظیمات نامعتبر است.' }),
      { status: 400, headers: ADMIN_SECURITY_HEADERS }
    );
  }

  const newPublic: Record<string, any> = {};
  for (const k of PUBLIC_SETTING_KEYS) {
    if (settings[k] !== undefined) newPublic[k] = settings[k];
  }

  const newPrivate: Record<string, any> = {};
  for (const k of PRIVATE_SETTING_KEYS) {
    if (settings[k] !== undefined) newPrivate[k] = settings[k];
  }

  const dbCheck = createEdgeFirestoreClient(context.env);
  if (!dbCheck.ok) {
    return dbCheck.response;
  }

  try {
    if (Object.keys(newPublic).length > 0) {
      await dbCheck.client.setDocument('settings/public', newPublic, true);
    }
    if (Object.keys(newPrivate).length > 0) {
      await dbCheck.client.setDocument('settings/private', newPrivate, true);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: ADMIN_SECURITY_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'خطا در ذخیره تنظیمات در پایگاه داده: ' + (err?.message || 'خطای سرور') }),
      { status: 500, headers: ADMIN_SECURITY_HEADERS }
    );
  }
};
