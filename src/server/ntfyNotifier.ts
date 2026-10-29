/**
 * Server-Side Secure ntfy Push Notification Service
 * Sends comprehensive order alerts to the store owner's private topic.
 * Ensures zero credential leakage to client-side code.
 */

export interface NtfyDispatchResult {
  success: boolean;
  status?: number;
  error?: string;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_receipt: 'در انتظار بارگذاری فیش واریزی',
  paid_pending_approval: 'پرداخت شده (فیش ضمیمه - در انتظار تایید حسابداری)',
  approved: 'تایید پرداخت و ارجاع به انبار',
  processing: 'در حال پردازش',
  packaging: 'در حال بسته‌بندی بهداشتی با عایق ضدضربه',
  shipped: 'تحویل شرکت ملی پست گردیده (پست پیشتاز)',
  delivered: 'تحویل خریدار گردید',
  cancelled: 'سفارش لغو شده'
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card_to_card: 'کارت به کارت بانکی',
  zarinpal: 'درگاه پرداخت اینترنتی زرین‌پال'
};

/**
 * Verifies whether the ntfy configuration is sufficiently secure (authenticated or private instance)
 */
export function isTopicSecuritySufficient(privateSettings: any): boolean {
  const token = privateSettings?.ntfyToken || process.env.NTFY_TOKEN;
  const serverUrl = (privateSettings?.ntfyServerUrl || process.env.NTFY_SERVER_URL || 'https://ntfy.sh').trim();
  const rawTopic = (privateSettings?.ntfyTopic || '').trim().replace(/^https?:\/\/ntfy\.sh\//, '');

  // 1. Authenticated with Token / Access Key
  if (token && typeof token === 'string' && token.trim().length > 6) {
    return true;
  }

  // 2. Private self-hosted server instance (not the public shared ntfy.sh)
  if (serverUrl && !serverUrl.includes('ntfy.sh')) {
    return true;
  }

  // 3. High-entropy cryptographically unguessable private topic
  if (rawTopic && rawTopic.length >= 24 && /^[a-zA-Z0-9_-]+$/.test(rawTopic)) {
    return true;
  }

  return false;
}

/**
 * Builds Persian notification content with conditional customer PII filtering:
 * If topic is NOT authenticated/private, full customer contact and street address are disabled.
 */
export function formatOrderNotification(
  order: any, 
  isSecureAuthenticatedTopic: boolean = false
): { title: string; body: string; tags: string[]; priority: number } {
  const jalaliDate = new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'Asia/Tehran'
  }).format(new Date(order.createdAt || Date.now()));

  const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status || 'نامشخص';
  const paymentMethodLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod || 'کارت به کارت';

  // Format products table
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsText = items.map((item: any, idx: number) => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.price) || 0;
    const itemTotal = qty * unitPrice;
    const weightLabel = item.weight ? ` (${item.weight})` : '';
    return `${idx + 1}. ${item.name || 'محصول ناما'}${weightLabel}\n   تعداد: ${qty} عدد | قیمت واحد: ${unitPrice.toLocaleString('fa-IR')} تومان | جمع: ${itemTotal.toLocaleString('fa-IR')} تومان`;
  }).join('\n\n');

  // Pricing breakdown
  const subtotalText = Number(order.subtotal || 0).toLocaleString('fa-IR');
  const shippingText = Number(order.shippingCost || 0) === 0 ? 'رایگان' : `${Number(order.shippingCost || 0).toLocaleString('fa-IR')} تومان`;
  const discountText = order.discountAmount ? `${Number(order.discountAmount).toLocaleString('fa-IR')} تومان (کد: ${order.discountCode || '-'})` : 'ندارد';
  const totalAmountText = Number(order.totalAmount || 0).toLocaleString('fa-IR');

  // Tracking info
  const postalTracking = order.trackingCode ? order.trackingCode : 'هنوز صادر نشده (در انتظار ارسال)';

  // Payment status
  let paymentDetails = `روش پرداخت: ${paymentMethodLabel}\nوضعیت پرداخت: ${order.status === 'paid_pending_approval' ? 'فیش ثبت شده (در انتظار تایید)' : order.status === 'approved' ? 'تایید شده' : 'در انتظار دریافت فیش'}`;
  if (order.cardLast4) {
    paymentDetails += `\n۴ رقم کارت واریزکننده: ${order.cardLast4}`;
  }
  if (order.paymentReference) {
    paymentDetails += `\nشماره پیگیری تراکنش: ${order.paymentReference}`;
  }
  if (order.receiptImage) {
    paymentDetails += `\nتصویر فیش: ضمیمه شده (مشاهده در پنل مدیریت)`;
  }

  // Customer PII section: Sent ONLY if the topic is private and authenticated
  const customerSection = isSecureAuthenticatedTopic
    ? [
        `👤 مشخصات خریدار و تماس:`,
        `• نام خریدار: ${order.customerName}`,
        `• شماره تماس: ${order.customerPhone}`,
        ``,
        `📍 آدرس و نحوه ارسال:`,
        `• مقصد: ${order.province || 'تهران'} - ${order.city || '-'}`,
        `• نشانی کامل پستی: ${order.address}`,
        `• کد پستی: ${order.postalCode || 'ثبت نشده'}`,
        `• توضیحات و یادداشت ارسال: ${order.notes || 'توضیحی ثبت نشده'}`,
      ]
    : [
        `👤 مشخصات خریدار:`,
        `• نام خریدار: ${order.customerName ? order.customerName.slice(0, 2) + '***' : 'خریدار گرامی'}`,
        `• شماره تماس: [جهت حفظ امنیت در تاپیک‌های عمومی غیرفعال شده است]`,
        ``,
        `📍 مقصد ارسال:`,
        `• مقصد: ${order.province || 'تهران'} - ${order.city || '-'}`,
        `• نشانی دقیق: [فقط در پنل امن مدیریت قابل مشاهده است]`,
        ``,
        `🔒 نکته امنیتی: به دلیل عدم تنظیم توکن اختصاصی (Auth Token) یا سرور شخصی ntfy، اطلاعات تماس و آدرس دقیق خریدار جهت جلوگیری از افشا در تاپیک عمومی غیرفعال شده است.`
      ];

  const lines = [
    `📦 مشخصات سفارش:`,
    `• شماره سفارش: ${order.id}`,
    `• کد رهگیری پستی: ${postalTracking}`,
    `• زمان ثبت: ${jalaliDate}`,
    `• وضعیت فعلی سفارش: ${statusLabel}`,
    ``,
    `🛒 اقلام خریداری شده:`,
    itemsText || 'موردی ثبت نشده است',
    ``,
    `💰 جزئیات مالی:`,
    `• جمع اقلام: ${subtotalText} تومان`,
    `• هزینه ارسال: ${shippingText}`,
    `• تخفیف: ${discountText}`,
    `• مبلغ نهایی پرداخت: ${totalAmountText} تومان`,
    ``,
    ...customerSection,
    ``,
    `💳 وضعیت و اطلاعات پرداخت:`,
    paymentDetails
  ];

  return {
    title: `🌿 سفارش جدید: ${order.id} (${totalAmountText} تومان)`,
    body: lines.join('\n'),
    tags: ['shopping_cart', 'package', 'dollar', 'bell'],
    priority: 4
  };
}

/**
 * Dispatches ntfy notification to the store owner's private topic.
 * Completely safe against runtime exceptions so order creation is never broken.
 */
export async function sendOrderNtfy(
  order: any, 
  privateSettings: any
): Promise<NtfyDispatchResult> {
  const rawTopic = privateSettings?.ntfyTopic || 'nama_store_orders_1383';
  const cleanTopic = String(rawTopic).trim().replace(/^https?:\/\/ntfy\.sh\//, '');

  if (!cleanTopic) {
    return { success: false, error: 'نام تاپیک ntfy در تنظیمات خصوصی سرور مشخص نشده است.' };
  }

  try {
    const isSecure = isTopicSecuritySufficient(privateSettings);
    const { title, body, tags, priority } = formatOrderNotification(order, isSecure);
    const serverUrl = (privateSettings?.ntfyServerUrl || process.env.NTFY_SERVER_URL || 'https://ntfy.sh').replace(/\/+$/, '');
    const token = privateSettings?.ntfyToken || process.env.NTFY_TOKEN;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const reqHeaders: Record<string, string> = {
      'Title': encodeURIComponent(title),
      'Priority': String(priority),
      'Tags': tags.join(','),
      'Content-Type': 'text/plain; charset=utf-8'
    };
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token.trim()}`;
    }

    const res = await fetch(`${serverUrl}/${encodeURIComponent(cleanTopic)}`, {
      method: 'POST',
      body,
      headers: reqHeaders,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return { success: true, status: res.status };
    } else {
      const errText = await res.text().catch(() => '');
      return { success: false, status: res.status, error: `پاسخ ناموفق سرور ntfy (کد ${res.status}): ${errText}` };
    }
  } catch (err: any) {
    const msg = err.name === 'AbortError' ? 'مهلت زمانی اتصال به سرور ntfy به پایان رسید.' : err.message;
    console.warn(`[ntfy] Notification dispatch notice for order ${order?.id}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Dispatches a test notification from server side
 */
export async function sendTestNtfy(privateSettings: any, customMessage?: string): Promise<NtfyDispatchResult> {
  const rawTopic = privateSettings?.ntfyTopic || 'nama_store_orders_1383';
  const cleanTopic = String(rawTopic).trim().replace(/^https?:\/\/ntfy\.sh\//, '');

  if (!cleanTopic) {
    return { success: false, error: 'نام تاپیک ntfy تنظیم نشده است.' };
  }

  const jalaliDate = new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'Asia/Tehran'
  }).format(new Date());

  const body = customMessage || 
`اتصال سرور فروشگاه محصولات غذایی ناما به تاپیک اختصاصی ntfy با موفقیت برقرار است.
زمان تست: ${jalaliDate}

از این پس تمامی جزئیات سفارش‌ها شامل نام خریدار، شماره تماس، اقلام، مبالغ، آدرس و وضعیت پرداخت به صورت لحظه‌ای به این تاپیک ارسال خواهد شد.`;

  try {
    const serverUrl = (privateSettings?.ntfyServerUrl || process.env.NTFY_SERVER_URL || 'https://ntfy.sh').replace(/\/+$/, '');
    const token = privateSettings?.ntfyToken || process.env.NTFY_TOKEN;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const reqHeaders: Record<string, string> = {
      'Title': encodeURIComponent('🌿 تست اتصال موفق اعلان‌های فروشگاه ناما'),
      'Priority': '4',
      'Tags': 'bell,tada,white_check_mark',
      'Content-Type': 'text/plain; charset=utf-8'
    };
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token.trim()}`;
    }

    const res = await fetch(`${serverUrl}/${encodeURIComponent(cleanTopic)}`, {
      method: 'POST',
      body,
      headers: reqHeaders,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return { success: true, status: res.status };
    } else {
      const errText = await res.text().catch(() => '');
      return { success: false, status: res.status, error: `کد خطای سرور ntfy (${res.status}): ${errText}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'خطا در برقراری ارتباط با سرور ntfy' };
  }
}
