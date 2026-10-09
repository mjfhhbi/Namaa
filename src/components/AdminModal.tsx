import React, { useState } from 'react';
import { Order, OrderStatus, Product, StoreSettings } from '../types';
import { 
  X, 
  Lock, 
  Unlock, 
  BarChart3, 
  ShoppingBag, 
  Package, 
  Settings, 
  CheckCircle2, 
  Truck, 
  AlertCircle, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  KeyRound, 
  CreditCard,
  BellRing,
  ExternalLink,
  Check,
  FileText,
  RotateCcw,
  Sparkles,
  Type,
  Image as ImageIcon,
  Printer,
  Upload
} from 'lucide-react';
import { sendNtfyNotification } from '../services/storeService';
import { PRESET_IMAGE_OPTIONS } from '../data/productImages';
import { compressImage } from '../utils/imageCompressor';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  products: Product[];
  settings: StoreSettings;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, extras?: { trackingCode?: string }) => void;
  onDeleteOrder?: (orderId: string) => void;
  onClearAllOrders?: () => void;
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onClearAllProducts: () => void;
  onResetSampleProducts: () => void;
  onUpdateSettings: (settings: StoreSettings) => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  orders,
  products,
  settings,
  onUpdateOrderStatus,
  onDeleteOrder,
  onClearAllOrders,
  onSaveProduct,
  onDeleteProduct,
  onClearAllProducts,
  onResetSampleProducts,
  onUpdateSettings,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'products' | 'cms' | 'settings'>('dashboard');

  // Product Edit/Create State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [isUploadingProductImage, setIsUploadingProductImage] = useState(false);

  // Settings State Form
  const [formSettings, setFormSettings] = useState<StoreSettings>({ ...settings });
  const [ntfyTestStatus, setNtfyTestStatus] = useState<string | null>(null);
  const [isTestingNtfy, setIsTestingNtfy] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(false);

  // Invoice modal
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [receiptLightboxUrl, setReceiptLightboxUrl] = useState<string | null>(null);

  // In-app Confirmation Modal (replaces window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  if (!isOpen) return null;

  // Handle Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim() === settings.adminPassword) {
      setIsAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  // Metrics
  const totalApprovedSales = orders
    .filter(o => o.status !== 'cancelled' && o.status !== 'pending_receipt')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const pendingVerificationCount = orders.filter(o => o.status === 'paid_pending_approval').length;
  const inPreparationCount = orders.filter(o => o.status === 'approved' || o.status === 'packaging').length;
  const shippedCount = orders.filter(o => o.status === 'shipped').length;

  // Test ntfy notification
  const handleTestNtfy = async () => {
    setIsTestingNtfy(true);
    setNtfyTestStatus('در حال ارسال به ntfy...');
    const res = await sendNtfyNotification({
      topic: formSettings.ntfyTopic || 'nama_store_orders_1383',
      title: '🌿 تست اتصال اعلان فروشگاه ناما',
      message: 'سیستم اعلان با موفقیت متصل است! تمامی سفارشات جدید فوراً برای شما ارسال خواهند شد.',
      tags: ['bell', 'tada', 'white_check_mark'],
      priority: 4,
    });
    setIsTestingNtfy(false);
    if (res.success) {
      setNtfyTestStatus('اعلان تستی با موفقیت به ntfy ارسال گردید ✅');
    } else {
      setNtfyTestStatus(`خطا در ارسال: ${res.text}`);
    }
    setTimeout(() => setNtfyTestStatus(null), 6000);
  };

  const handleSaveSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formSettings);
    setSaveSuccessMessage(true);
    setTimeout(() => setSaveSuccessMessage(false), 3000);
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProductFormError(null);
      if (file.size > 8 * 1024 * 1024) {
        setProductFormError('حجم فایل تصویر نباید بیشتر از ۸ مگابایت باشد.');
        return;
      }
      try {
        setIsUploadingProductImage(true);
        const compressed = await compressImage(file, 900, 0.8);
        setEditingProduct(prev => prev ? { ...prev, image: compressed } : { image: compressed });
      } catch (err: any) {
        setProductFormError('خطا در بارگذاری تصویر محصول.');
      } finally {
        setIsUploadingProductImage(false);
      }
    }
  };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProductFormError(null);
    if (!editingProduct?.name || !editingProduct?.price) {
      setProductFormError('نام و قیمت محصول الزامی است');
      return;
    }
    const finalProduct: Product = {
      id: editingProduct.id || `prod-${Date.now()}`,
      name: editingProduct.name,
      category: editingProduct.category || 'honey_medicinal',
      categoryLabel: editingProduct.category === 'honey_medicinal' ? 'عسل‌های درمانی' :
                     editingProduct.category === 'dates_export' ? 'خرماهای صادراتی' :
                     editingProduct.category === 'syrups_traditional' ? 'شیره‌ها و معجون‌ها' :
                     editingProduct.category === 'saffron_gold' ? 'زعفران و طلای سرخ' : 'روغن‌های فرابکر و گیاهی',
      price: Number(editingProduct.price),
      originalPrice: editingProduct.originalPrice ? Number(editingProduct.originalPrice) : undefined,
      weight: editingProduct.weight || '۱ کیلوگرم',
      shortDesc: editingProduct.shortDesc || '',
      description: editingProduct.description || '',
      benefits: Array.isArray(editingProduct.benefits) ? editingProduct.benefits : (typeof editingProduct.benefits === 'string' ? (editingProduct.benefits as string).split('\n').filter(Boolean) : []),
      origin: editingProduct.origin || 'ایران',
      stock: Number(editingProduct.stock ?? 10),
      image: editingProduct.image || 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=800&q=80',
      isPopular: !!editingProduct.isPopular,
      isOrganic: !!editingProduct.isOrganic,
      isFeatured: !!editingProduct.isFeatured,
      isNewArrival: !!editingProduct.isNewArrival,
      badge: editingProduct.badge || undefined,
      rating: editingProduct.rating ? Number(editingProduct.rating) : 5.0,
      createdAt: editingProduct.createdAt || new Date().toISOString(),
    };
    onSaveProduct(finalProduct);
    setEditingProduct(null);
  };

  const filteredProducts = products.filter(p => 
    !productSearch.trim() || 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
    p.categoryLabel.includes(productSearch)
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div 
        className="relative w-full max-w-5xl bg-[#FAF8F3] rounded-3xl shadow-2xl border border-[#E4D7C2] overflow-hidden text-right flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E8DEC9] bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#231709] text-white flex items-center justify-center font-bold">
              <KeyRound className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#231709]">
                پنل مدیریت جامع فروشگاه ناما
              </h3>
              <p className="text-xs text-[#6F7F72]">
                {isAuthenticated ? 'مدیریت کامل متن‌ها، ویترین، محصولات، فیش‌های واریزی و تنظیمات' : 'ورود امن با رمز عبور'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={() => setIsAuthenticated(false)}
                className="text-xs text-red-600 hover:bg-red-50 px-3 py-1 rounded-full border border-red-200 transition-colors"
              >
                خروج
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* LOGIN SCREEN */}
        {!isAuthenticated ? (
          <div className="p-8 sm:p-14 text-center max-w-md mx-auto my-auto space-y-5">
            <div className="w-16 h-16 rounded-full bg-[#FAF3E3] border border-[#E3CE9B] flex items-center justify-center text-[#231709] mx-auto shadow-sm">
              <Lock className="w-8 h-8 text-[#231709]" />
            </div>

            <div>
              <h4 className="text-lg font-black text-[#231709]">ورود به بخش مدیریت فروشگاه</h4>
              <p className="text-xs text-[#6A5A4A] mt-1">
                رمز عبور پیش‌فرض: <strong className="font-mono text-[#231709] bg-amber-100 px-2 py-0.5 rounded">1383</strong> (قابل تغییر در پنل)
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="password"
                dir="ltr"
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="رمز عبور مدیریت..."
                className="w-full bg-white border border-[#D5C6AC] rounded-2xl px-4 py-3 text-center text-sm font-mono text-[#231709] focus:outline-none focus:ring-2 focus:ring-[#D4A340]"
              />

              {loginError && (
                <div className="text-xs text-red-600 font-bold bg-red-50 p-2.5 rounded-xl border border-red-200">
                  رمز عبور وارد شده نادرست است!
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-[#231709] hover:bg-[#150D05] text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Unlock className="w-4 h-4 text-amber-300" />
                <span>ورود به پنل مدیریت</span>
              </button>
            </form>
          </div>
        ) : (
          /* AUTHENTICATED ADMIN PANEL */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Nav Tabs */}
            <div className="bg-[#FAF8F3] border-b border-[#E8DEC9] px-4 flex items-center gap-2 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 ${
                  activeTab === 'dashboard'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>داشبورد و آمار</span>
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 ${
                  activeTab === 'orders'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>مدیریت سفارشات</span>
                {pendingVerificationCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {pendingVerificationCount} جدید
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('products')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 ${
                  activeTab === 'products'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>مدیریت محصولات</span>
                <span className="text-xs text-gray-400">({products.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('cms')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 ${
                  activeTab === 'cms'
                    ? 'border-[#D4A340] text-[#A47922]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Type className="w-4 h-4 text-[#D4A340]" />
                <span className="font-black text-[#A47922]">مدیریت همه متن‌ها (CMS)</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 ${
                  activeTab === 'settings'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>تنظیمات بانکی و ntfy</span>
              </button>
            </div>

            {/* TAB CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              
              {/* TAB 1: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-[#E7DDC9] shadow-xs">
                      <span className="text-xs text-[#718274] block mb-1">فروش کل تایید شده</span>
                      <span className="text-base sm:text-xl font-black text-[#231709]">
                        {totalApprovedSales.toLocaleString('fa-IR')}
                      </span>
                      <span className="text-xs text-gray-500 mr-1">تومان</span>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-red-200 shadow-xs">
                      <span className="text-xs text-red-600 font-bold block mb-1">در انتظار بررسی فیش</span>
                      <span className="text-2xl font-black text-red-600">
                        {pendingVerificationCount}
                      </span>
                      <span className="text-xs text-gray-500 mr-1">سفارش</span>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs">
                      <span className="text-xs text-amber-700 font-bold block mb-1">در حال بسته‌بندی</span>
                      <span className="text-2xl font-black text-amber-700">
                        {inPreparationCount}
                      </span>
                      <span className="text-xs text-gray-500 mr-1">سفارش</span>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs">
                      <span className="text-xs text-emerald-700 font-bold block mb-1">تعداد محصولات کاتالوگ</span>
                      <span className="text-2xl font-black text-emerald-700">
                        {products.length}
                      </span>
                      <span className="text-xs text-gray-500 mr-1">قلم کالا</span>
                    </div>
                  </div>

                  {/* ntfy Integration Banner */}
                  <div className="bg-gradient-to-r from-[#231709] via-[#2F1F0E] to-[#1E2D20] text-white p-4 sm:p-5 rounded-3xl shadow-md flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-amber-300">
                        <BellRing className="w-6 h-6 animate-bounce" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm sm:text-base">سیستم اعلان لحظه‌ای ntfy فعال است</h4>
                        <p className="text-xs text-emerald-200/90 mt-0.5">
                          تاپیک تنظیم شده: <code className="bg-white/15 px-2 py-0.5 rounded text-amber-300 font-mono">{settings.ntfyTopic}</code>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`https://ntfy.sh/${settings.ntfyTopic}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white transition-all flex items-center gap-1.5"
                      >
                        <span>مشاهده وب ntfy</span>
                        <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
                      </a>
                      <button
                        onClick={handleTestNtfy}
                        disabled={isTestingNtfy}
                        className="px-4 py-2 rounded-xl bg-[#D4A340] hover:bg-[#B8860B] text-[#231709] text-xs font-black shadow-sm transition-all"
                      >
                        {isTestingNtfy ? 'در حال ارسال...' : 'تست اعلان ntfy'}
                      </button>
                    </div>
                  </div>

                  {/* Quick Shortcut Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setActiveTab('cms')}
                      className="p-4 rounded-2xl bg-white border border-[#D4A340]/50 hover:bg-[#FAF3E3] transition-all text-right flex items-center justify-between"
                    >
                      <div>
                        <h5 className="font-black text-sm text-[#231709]">مدیریت همه متن‌های سایت (CMS)</h5>
                        <p className="text-xs text-gray-500 mt-0.5">تغییر عنوان‌ها، شعار، بنرها و اطلاعات درباره ما</p>
                      </div>
                      <Type className="w-5 h-5 text-[#A47922]" />
                    </button>

                    <button
                      onClick={() => setActiveTab('products')}
                      className="p-4 rounded-2xl bg-white border border-[#E7DDC9] hover:bg-gray-50 transition-all text-right flex items-center justify-between"
                    >
                      <div>
                        <h5 className="font-black text-sm text-[#231709]">مدیریت یا حذف یکجای محصولات</h5>
                        <p className="text-xs text-gray-500 mt-0.5">افزودن، ویرایش، حذف تکی یا خالی کردن انبار</p>
                      </div>
                      <Package className="w-5 h-5 text-[#231709]" />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: ORDERS MANAGEMENT */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="font-black text-[#231709] text-base">
                      لیست سفارشات فروشگاه ({orders.length})
                    </h4>
                    {orders.length > 0 && onClearAllOrders && (
                      <button
                        onClick={() => {
                          setConfirmModal({
                            title: 'پاکسازی تمامی سفارشات',
                            message: 'آیا از حذف تمامی سفارشات از دیتابیس اطمینان دارید؟ این عمل جهت راه‌اندازی فروشگاه واقعی و حذف سفارشات تستی کاربرد دارد.',
                            confirmLabel: 'بله، همه سفارش‌ها را حذف کن',
                            isDanger: true,
                            onConfirm: () => onClearAllOrders(),
                          });
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>پاکسازی سفارشات (شروع فروشگاه سفید)</span>
                      </button>
                    )}
                  </div>

                  <div className="bg-white rounded-3xl border border-[#E7DDC9] overflow-hidden shadow-xs divide-y divide-[#F0E6D5]">
                    {orders.length === 0 ? (
                      <div className="p-12 text-center text-xs text-gray-500">
                        هنوز سفارشی ثبت نشده است.
                      </div>
                    ) : (
                      orders.map((ord) => (
                        <div key={ord.id} className="p-4 sm:p-5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-mono font-black text-[#231709]">
                                {ord.id}
                              </span>
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                ord.status === 'paid_pending_approval' ? 'bg-red-100 text-red-800' :
                                ord.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                ord.status === 'packaging' ? 'bg-amber-100 text-amber-800' :
                                ord.status === 'shipped' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100'
                              }`}>
                                {ord.status === 'paid_pending_approval' && '⚠️ نیاز به بررسی فیش واریز'}
                                {ord.status === 'approved' && '✓ واریز تایید شد'}
                                {ord.status === 'packaging' && '📦 در حال بسته‌بندی'}
                                {ord.status === 'shipped' && '🚚 ارسال شده به پست'}
                                {ord.status === 'cancelled' && '✕ لغو شده'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setInvoiceOrder(ord)}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg flex items-center gap-1 font-semibold"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>مشاهده فاکتور</span>
                              </button>
                              <span className="text-xs text-gray-400 font-mono">
                                {new Date(ord.createdAt).toLocaleString('fa-IR')}
                              </span>
                            </div>
                          </div>

                          {/* Customer & Address */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-[#FAF8F3] p-3 rounded-2xl border border-[#ECE0CE]">
                            <div>
                              <span className="text-gray-500 block text-[11px]">مشتری:</span>
                              <span className="font-bold text-[#143220]">{ord.customerName}</span>
                              <span className="text-gray-600 block mt-0.5">{ord.customerPhone}</span>
                            </div>

                            <div>
                              <span className="text-gray-500 block text-[11px]">آدرس تحویل:</span>
                              <span className="font-medium text-[#2C4030]">
                                {ord.province}، {ord.city}، {ord.address}
                              </span>
                            </div>

                            <div>
                              <span className="text-gray-500 block text-[11px]">اطلاعات پرداخت کارت به کارت:</span>
                              <div className="text-[#231709] font-medium">
                                {ord.cardLast4 && <span>۴ رقم کارت: <strong className="font-mono">{ord.cardLast4}</strong> | </span>}
                                {ord.paymentReference && <span>ارجاع: <strong className="font-mono">{ord.paymentReference}</strong></span>}
                                {!ord.cardLast4 && !ord.paymentReference && <span className="text-amber-700">رسید ثبت نشده</span>}
                              </div>
                              <span className="font-black text-[#231709] block mt-1 text-sm">
                                {ord.totalAmount.toLocaleString('fa-IR')} تومان
                              </span>
                            </div>
                          </div>

                          {/* Receipt Image Preview if exists */}
                          {ord.receiptImage && (
                            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                              <img 
                                src={ord.receiptImage} 
                                alt="فیش واریزی" 
                                className="w-14 h-14 rounded-lg object-cover border cursor-pointer hover:scale-105 transition-transform"
                                onClick={() => setReceiptLightboxUrl(ord.receiptImage!)}
                                title="کلیک برای مشاهده اندازه اصلی فیش"
                              />
                              <div className="text-xs text-emerald-900">
                                <span className="font-bold block">تصویر فیش واریزی ارسال شده توسط خریدار</span>
                                <button 
                                  type="button"
                                  onClick={() => setReceiptLightboxUrl(ord.receiptImage!)}
                                  className="text-emerald-700 underline text-[11px] mt-0.5 inline-block font-semibold hover:text-emerald-900 cursor-pointer"
                                >
                                  مشاهده و بزرگنمایی تصویر فیش ←
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons for this order */}
                          <div className="flex flex-wrap items-center gap-2 pt-2">
                            {ord.status === 'paid_pending_approval' && (
                              <button
                                onClick={() => onUpdateOrderStatus(ord.id, 'approved')}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>تایید واریزی</span>
                              </button>
                            )}

                            {ord.status === 'approved' && (
                              <button
                                onClick={() => onUpdateOrderStatus(ord.id, 'packaging')}
                                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <Package className="w-3.5 h-3.5" />
                                <span>انتقال به بسته‌بندی</span>
                              </button>
                            )}

                            {/* Shipped & Postal Code Entry */}
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                dir="ltr"
                                placeholder="ثبت کد رهگیری پست..."
                                defaultValue={ord.trackingCode || ''}
                                id={`track-${ord.id}`}
                                className="bg-white border border-[#D5C6AC] rounded-xl px-2.5 py-1 text-xs font-mono w-48"
                              />
                              <button
                                onClick={() => {
                                  const val = (document.getElementById(`track-${ord.id}`) as HTMLInputElement)?.value;
                                  onUpdateOrderStatus(ord.id, 'shipped', { trackingCode: val });
                                }}
                                className="px-3 py-1 rounded-xl bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>علامت‌گذاری به عنوان ارسال شده</span>
                              </button>
                            </div>

                            <button
                              onClick={() => onUpdateOrderStatus(ord.id, 'cancelled')}
                              className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-xl transition-all mr-auto"
                            >
                              لغو سفارش
                            </button>

                            {onDeleteOrder && (
                              <button
                                onClick={() => {
                                  setConfirmModal({
                                    title: 'حذف سفارش',
                                    message: `آیا از حذف دائم سفارش «${ord.id}» اطمینان دارید؟`,
                                    confirmLabel: 'بله، حذف کن',
                                    isDanger: true,
                                    onConfirm: () => onDeleteOrder(ord.id),
                                  });
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="حذف دائمی این سفارش"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: PRODUCTS MANAGEMENT WITH BULK ACTIONS */}
              {activeTab === 'products' && (
                <div className="space-y-4">
                  {/* Top action bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-[#E7DDC9]">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="جستجو در محصولات..."
                        className="bg-[#FAF8F3] border rounded-xl px-3 py-1.5 text-xs w-48"
                      />
                      <span className="text-xs text-gray-500 font-bold">
                        ({products.length} محصول)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* 1-Click Clear All Products requested by user */}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            title: 'خالی کردن کاتالوگ محصولات',
                            message: '⚠️ آیا از حذف یکجای تمامی محصولات اطمینان دارید؟ تمام محصولات کاتالوگ پاک خواهند شد و می‌توانید محصولات اختصاصی خود را وارد نمایید.',
                            confirmLabel: 'بله، همه محصولات را پاک کن',
                            isDanger: true,
                            onConfirm: () => onClearAllProducts(),
                          });
                        }}
                        className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="خالی کردن کامل کاتالوگ محصولات"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>حذف تمامی محصولات (خالی کردن کاتالوگ)</span>
                      </button>

                      {/* 1-Click Restore Default Demo Products */}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            title: 'بازنشانی محصولات نمونه',
                            message: 'آیا مایلید ۱۲ محصول نمونه پیش‌فرض ناما با عکس‌های باکیفیت و خواص درمانی بازنشانی شوند؟',
                            confirmLabel: 'بله، بازنشانی کن',
                            isDanger: false,
                            onConfirm: () => onResetSampleProducts(),
                          });
                        }}
                        className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="بازنشانی محصولات نمونه"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>بازنشانی محصولات نمونه</span>
                      </button>

                      {/* Add Product */}
                      <button
                        onClick={() => {
                          setIsNewProduct(true);
                          setEditingProduct({
                            name: '',
                            category: 'honey_medicinal',
                            price: 250000,
                            weight: '۱ کیلوگرم',
                            stock: 20,
                            isOrganic: true,
                            isFeatured: true,
                            shortDesc: '',
                            description: '',
                            image: PRESET_IMAGE_OPTIONS[0].url,
                          });
                        }}
                        className="px-4 py-2 rounded-2xl bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4 text-amber-300" />
                        <span>افزودن محصول جدید</span>
                      </button>
                    </div>
                  </div>

                  {/* Product Form Modal / Section */}
                  {editingProduct && (
                    <div className="bg-white p-5 rounded-3xl border-2 border-[#231709] shadow-lg space-y-4 animate-in fade-in">
                      <div className="flex items-center justify-between pb-3 border-b">
                        <h5 className="font-black text-[#231709] text-sm">
                          {isNewProduct ? 'افزودن محصول جدید به کاتالوگ' : `ویرایش محصول: ${editingProduct.name}`}
                        </h5>
                        <button
                          onClick={() => setEditingProduct(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <form onSubmit={handleProductSubmit} className="space-y-4">
                        {productFormError && (
                          <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                            <span>{productFormError}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">نام محصول *</label>
                            <input
                              type="text"
                              value={editingProduct.name || ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                              placeholder="مثلاً: عسل کوهستان سبلان"
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">دسته‌بندی تخصصی</label>
                            <select
                              value={editingProduct.category || 'honey_medicinal'}
                              onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value as any })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            >
                              <option value="honey_medicinal">عسل‌های درمانی و خاص</option>
                              <option value="dates_export">خرماهای صادراتی و لوکس</option>
                              <option value="syrups_traditional">شیره‌ها و معجون‌های سنتی</option>
                              <option value="saffron_gold">زعفران و طلای سرخ</option>
                              <option value="oils_herbal">روغن‌های فرابکر و دمنوش</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">وزن یا حجم</label>
                            <input
                              type="text"
                              value={editingProduct.weight || ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, weight: e.target.value })}
                              placeholder="مثلاً: ۱ کیلوگرم"
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">قیمت فروش (تومان) *</label>
                            <input
                              type="number"
                              value={editingProduct.price || ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">قیمت قبلی / خط خورده (تومان)</label>
                            <input
                              type="number"
                              value={editingProduct.originalPrice || ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, originalPrice: e.target.value ? Number(e.target.value) : undefined })}
                              placeholder="اختیاری جهت تخفیف"
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">موجودی انبار</label>
                            <input
                              type="number"
                              value={editingProduct.stock ?? 10}
                              onChange={(e) => setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                        </div>

                        {/* Image URL with Preset Picker & Direct File Upload */}
                        <div className="space-y-2.5">
                          <label className="block text-xs font-bold text-gray-700">
                            تصویر محصول (آپلود عکس از دستگاه، لینک اینترنتی یا انتخاب از آرشیو عکس‌های باکیفیت)
                          </label>

                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {editingProduct.image && (
                              <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-gray-300 flex-shrink-0 bg-gray-100">
                                <img src={editingProduct.image} alt="پیش‌نمایش" className="w-full h-full object-cover" />
                              </div>
                            )}

                            <label className="flex-1 border border-dashed border-[#D5C6AC] hover:border-[#163826] bg-[#FAF8F3] hover:bg-[#F2ECE0] px-3 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all text-xs font-bold text-[#163826]">
                              <Upload className="w-4 h-4" />
                              <span>{isUploadingProductImage ? 'در حال بهینه‌سازی عکس...' : 'آپلود عکس اختصاصی از گوشی یا کامپیوتر'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                disabled={isUploadingProductImage}
                                onChange={handleProductImageUpload}
                                className="hidden"
                              />
                            </label>

                            <input
                              type="text"
                              dir="ltr"
                              value={editingProduct.image || ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, image: e.target.value })}
                              placeholder="یا وارد کردن آدرس مستقیم عکس..."
                              className="flex-1 bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono"
                            />
                          </div>

                          {/* Clickable Quick Gallery of High-Res Product Photos */}
                          <div className="bg-[#FAF6EE] p-3 rounded-2xl border border-[#E8DEC9]">
                            <span className="text-[11px] font-bold text-[#A47922] block mb-2 flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5" />
                              انتخاب سریع تصویر باکیفیت از آرشیو ناما:
                            </span>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                              {PRESET_IMAGE_OPTIONS.map((img, i) => (
                                <button
                                  type="button"
                                  key={i}
                                  onClick={() => setEditingProduct({ ...editingProduct, image: img.url })}
                                  className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all group ${
                                    editingProduct.image === img.url ? 'border-[#D4A340] ring-2 ring-[#D4A340]' : 'border-gray-200 hover:border-gray-400'
                                  }`}
                                  title={img.name}
                                >
                                  <img src={img.url} alt={img.name} className="w-full h-full object-cover group-hover:scale-105" />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] truncate px-1 text-center">
                                    {img.name.split(' ')[0]}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">برچسب ویژه (Badge)</label>
                            <input
                              type="text"
                              value={editingProduct.badge || ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, badge: e.target.value })}
                              placeholder="مثلاً: عسل درمانی خاص، صادراتی لوکس..."
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">امتیاز رضایت مشتری (از ۵)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="1"
                              max="5"
                              value={editingProduct.rating || 5.0}
                              onChange={(e) => setEditingProduct({ ...editingProduct, rating: Number(e.target.value) })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">توضیح کوتاه</label>
                          <input
                            type="text"
                            value={editingProduct.shortDesc || ''}
                            onChange={(e) => setEditingProduct({ ...editingProduct, shortDesc: e.target.value })}
                            placeholder="توضیح یک‌خطی جهت نمایش در کارت محصول"
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">توضیحات کامل و خواص</label>
                          <textarea
                            rows={3}
                            value={editingProduct.description || ''}
                            onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                            placeholder="معرفی محصول، اصالت، روش مصرف..."
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-6 text-xs text-gray-700">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!editingProduct.isOrganic}
                              onChange={(e) => setEditingProduct({ ...editingProduct, isOrganic: e.target.checked })}
                              className="rounded text-[#231709]"
                            />
                            <span>۱۰۰٪ ارگانیک و طبیعی</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!editingProduct.isFeatured}
                              onChange={(e) => setEditingProduct({ ...editingProduct, isFeatured: e.target.checked })}
                              className="rounded text-[#231709]"
                            />
                            <span className="font-bold text-[#A4781C]">نمایش در محصولات منتخب ویژه</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!editingProduct.isNewArrival}
                              onChange={(e) => setEditingProduct({ ...editingProduct, isNewArrival: e.target.checked })}
                              className="rounded text-[#231709]"
                            />
                            <span className="font-bold text-[#2F4E34]">نمایش در آخرین محصولات اضافه شده</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!editingProduct.isPopular}
                              onChange={(e) => setEditingProduct({ ...editingProduct, isPopular: e.target.checked })}
                              className="rounded text-[#231709]"
                            />
                            <span>نشان پرفروش</span>
                          </label>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                          <button
                            type="submit"
                            className="px-6 py-2.5 rounded-xl bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                          >
                            <Save className="w-4 h-4 text-amber-300" />
                            <span>ذخیره محصول</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProduct(null)}
                            className="px-4 py-2.5 rounded-xl border text-xs font-semibold hover:bg-gray-100"
                          >
                            انصراف
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Products Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredProducts.map(p => (
                      <div key={p.id} className="bg-white p-3.5 rounded-2xl border border-[#E7DDC9] flex items-center gap-3 shadow-xs">
                        <img src={p.image} alt={p.name} className="w-16 h-16 rounded-xl object-cover border flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-xs text-[#231709] truncate">{p.name}</h5>
                          <span className="text-[11px] text-gray-500 block">{p.weight}</span>
                          <span className="font-black text-[#231709] text-xs">
                            {p.price.toLocaleString('fa-IR')} تومان
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => {
                              setIsNewProduct(false);
                              setEditingProduct({ ...p });
                            }}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                            title="ویرایش"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmModal({
                                title: 'حذف محصول',
                                message: `آیا از حذف محصول «${p.name}» از فروشگاه اطمینان دارید؟`,
                                confirmLabel: 'بله، حذف کن',
                                isDanger: true,
                                onConfirm: () => onDeleteProduct(p.id),
                              });
                            }}
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: CMS / FULL TEXTS MANAGEMENT (تغییر همه متون سایت) */}
              {activeTab === 'cms' && (
                <div className="max-w-4xl space-y-6">
                  {saveSuccessMessage && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>تمام متون سایت با موفقیت در پایگاه داده ذخیره شدند.</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveSettingsSubmit} className="space-y-6">
                    {/* Brand & Slogan */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#D4A340]" />
                        <span>نام برند، شعار و اطلاعیه بالای سایت</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">نام فروشگاه</label>
                          <input
                            type="text"
                            value={formSettings.storeName}
                            onChange={(e) => setFormSettings({ ...formSettings, storeName: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">شعار اصلی برند</label>
                          <input
                            type="text"
                            value={formSettings.slogan}
                            onChange={(e) => setFormSettings({ ...formSettings, slogan: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold text-[#A47922]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">متن نوار اعلامیه متحرک بالای صفحه</label>
                        <input
                          type="text"
                          value={formSettings.announcement}
                          onChange={(e) => setFormSettings({ ...formSettings, announcement: e.target.value })}
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                    </div>

                    {/* Hero Section Texts */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <Type className="w-4 h-4 text-[#231709]" />
                        <span>متون بخش بالایی صفحه اصلی (Hero)</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">برچسب سبز بالای تیتر (Badge)</label>
                          <input
                            type="text"
                            value={formSettings.heroBadge || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, heroBadge: e.target.value })}
                            placeholder="محصولات غذایی ۱۰۰٪ طبیعی، سالم و دستچین ایرانی"
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">تیتر اصلی هیرو (Title)</label>
                          <input
                            type="text"
                            value={formSettings.heroTitle || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, heroTitle: e.target.value })}
                            placeholder="از نام و جان، برای طعمی ماندگار"
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-black"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">متن توضیحات هیرو (Subtitle)</label>
                        <textarea
                          rows={2}
                          value={formSettings.heroSubtitle || ''}
                          onChange={(e) => setFormSettings({ ...formSettings, heroSubtitle: e.target.value })}
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">متن دکمه اصلی هیرو</label>
                        <input
                          type="text"
                          value={formSettings.heroButtonText || ''}
                          onChange={(e) => setFormSettings({ ...formSettings, heroButtonText: e.target.value })}
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">نشان ۱</label>
                          <input
                            type="text"
                            value={formSettings.qualityBadge1 || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, qualityBadge1: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">نشان ۲</label>
                          <input
                            type="text"
                            value={formSettings.qualityBadge2 || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, qualityBadge2: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">نشان ۳</label>
                          <input
                            type="text"
                            value={formSettings.qualityBadge3 || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, qualityBadge3: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">نشان ۴</label>
                          <input
                            type="text"
                            value={formSettings.qualityBadge4 || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, qualityBadge4: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Promo Banner Texts */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#D4A340]" />
                        <span>متون بنر تبلیغاتی ویژه وسط صفحه</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">نشان طلایی بالای بنر</label>
                          <input
                            type="text"
                            value={formSettings.promoBadge || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, promoBadge: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">تیتر بنر ویژه</label>
                          <input
                            type="text"
                            value={formSettings.promoTitle || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, promoTitle: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">توضیحات بنر ویژه</label>
                        <textarea
                          rows={2}
                          value={formSettings.promoSubtitle || ''}
                          onChange={(e) => setFormSettings({ ...formSettings, promoSubtitle: e.target.value })}
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                    </div>

                    {/* About Us & Footer */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-3">
                      <h4 className="font-black text-[#231709] text-sm">متن درباره ما در فوتر</h4>
                      <textarea
                        rows={2}
                        value={formSettings.aboutText || ''}
                        onChange={(e) => setFormSettings({ ...formSettings, aboutText: e.target.value })}
                        className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 rounded-2xl bg-[#D4A340] hover:bg-[#B8860B] text-[#231709] font-black text-sm shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4 text-[#231709]" />
                      <span>ذخیره تمامی تغییرات متون سایت</span>
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 5: BANK & SETTINGS */}
              {activeTab === 'settings' && (
                <div className="max-w-3xl space-y-6">
                  {saveSuccessMessage && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>تنظیمات فروشگاه با موفقیت ذخیره گردید.</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveSettingsSubmit} className="space-y-6">
                    {/* Bank Card Settings Box */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-[#D4A340]" />
                        <span>اطلاعات کارت بانکی فروشگاه (جهت واریز کارت به کارت مشتریان)</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">شماره کارت ۱۶ رقمی</label>
                          <input
                            type="text"
                            dir="ltr"
                            value={formSettings.cardNumber}
                            onChange={(e) => setFormSettings({ ...formSettings, cardNumber: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center font-bold"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">نام صاحب حساب</label>
                          <input
                            type="text"
                            value={formSettings.cardHolder}
                            onChange={(e) => setFormSettings({ ...formSettings, cardHolder: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">نام بانک</label>
                          <input
                            type="text"
                            value={formSettings.bankName}
                            onChange={(e) => setFormSettings({ ...formSettings, bankName: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">شماره شبا (IBAN)</label>
                          <input
                            type="text"
                            dir="ltr"
                            value={formSettings.shabaNumber}
                            onChange={(e) => setFormSettings({ ...formSettings, shabaNumber: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Shipping and Admin Passcode */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <Truck className="w-4 h-4 text-[#2F4E34]" />
                        <span>هزینه‌های پستی و رمز عبور مدیریت</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">هزینه ارسال پیش‌فرض (تومان)</label>
                          <input
                            type="number"
                            value={formSettings.shippingCost}
                            onChange={(e) => setFormSettings({ ...formSettings, shippingCost: Number(e.target.value) })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">حداقل مبلغ خرید برای ارسال رایگان (تومان)</label>
                          <input
                            type="number"
                            value={formSettings.freeShippingThreshold}
                            onChange={(e) => setFormSettings({ ...formSettings, freeShippingThreshold: Number(e.target.value) })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">رمز عبور ورود به پنل ادمین</label>
                          <input
                            type="text"
                            dir="ltr"
                            value={formSettings.adminPassword}
                            onChange={(e) => setFormSettings({ ...formSettings, adminPassword: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center font-black text-[#231709]"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">شماره تماس پشتیبانی مشتریان</label>
                          <input
                            type="text"
                            dir="ltr"
                            value={formSettings.supportPhone}
                            onChange={(e) => setFormSettings({ ...formSettings, supportPhone: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ntfy Notification Topic Settings */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <BellRing className="w-4 h-4 text-[#D4A340]" />
                        <span>تنظیم اعلان لحظه‌ای گوشی با ntfy</span>
                      </h4>

                      <p className="text-xs text-gray-600 leading-relaxed">
                        با نرم‌افزار رایگان <strong>ntfy</strong>، به محض ثبت سفارش جدید یک اعلان فوری روی گوشی شما ظاهر می‌شود.
                      </p>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={formSettings.ntfyTopic}
                          onChange={(e) => setFormSettings({ ...formSettings, ntfyTopic: e.target.value })}
                          placeholder="nama_store_orders_1383"
                          className="flex-1 bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono font-bold"
                          required
                        />
                        <button
                          type="button"
                          onClick={handleTestNtfy}
                          disabled={isTestingNtfy}
                          className="px-4 py-2 bg-[#D4A340] hover:bg-[#B8860B] text-[#231709] rounded-xl text-xs font-black shadow-xs transition-all"
                        >
                          ارسال تست
                        </button>
                      </div>

                      {ntfyTestStatus && (
                        <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                          {ntfyTestStatus}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 rounded-2xl bg-[#231709] hover:bg-[#150D05] text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4 text-amber-300" />
                      <span>ذخیره تمامی تنظیمات</span>
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>
        )}

        {/* INVOICE MODAL / VIEW */}
        {invoiceOrder && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full text-right space-y-4 border border-[#E4D7C2]">
              <div className="flex items-center justify-between pb-3 border-b">
                <div>
                  <h4 className="font-black text-[#231709] text-base">پیش‌فاکتور فروشگاه ناما</h4>
                  <span className="text-xs text-gray-500 font-mono">سفارش: {invoiceOrder.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700"
                    title="پرینت فاکتور"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setInvoiceOrder(null)}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-700 space-y-1 bg-[#FAF8F3] p-3 rounded-2xl border">
                <div><span className="font-bold">خریدار:</span> {invoiceOrder.customerName} ({invoiceOrder.customerPhone})</div>
                <div><span className="font-bold">آدرس تحویل:</span> {invoiceOrder.province}، {invoiceOrder.city}، {invoiceOrder.address}</div>
                {invoiceOrder.postalCode && <div><span className="font-bold">کد پستی:</span> {invoiceOrder.postalCode}</div>}
              </div>

              <div className="divide-y text-xs">
                {invoiceOrder.items.map((item, i) => (
                  <div key={i} className="py-2 flex justify-between">
                    <span>{item.name} ({item.weight}) × {item.quantity}</span>
                    <span className="font-bold">{(item.price * item.quantity).toLocaleString('fa-IR')} تومان</span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t flex justify-between text-sm font-black text-[#231709]">
                <span>مبلغ کل فاکتور:</span>
                <span>{invoiceOrder.totalAmount.toLocaleString('fa-IR')} تومان</span>
              </div>
            </div>
          </div>
        )}

        {/* RECEIPT IMAGE LIGHTBOX VIEWER */}
        {receiptLightboxUrl && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
            <div className="relative max-w-3xl w-full bg-[#181818] rounded-3xl overflow-hidden border border-white/20 shadow-2xl flex flex-col items-center">
              <div className="w-full flex items-center justify-between p-4 bg-black/50 text-white">
                <span className="text-xs sm:text-sm font-bold">تصویر فیش واریزی خریدار (اندازه کامل)</span>
                <button
                  type="button"
                  onClick={() => setReceiptLightboxUrl(null)}
                  className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 max-h-[75vh] overflow-auto flex items-center justify-center w-full">
                <img
                  src={receiptLightboxUrl}
                  alt="تصویر فیش واریز"
                  className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
                />
              </div>
              <div className="p-3 bg-black/40 w-full text-center">
                <button
                  type="button"
                  onClick={() => setReceiptLightboxUrl(null)}
                  className="px-5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all"
                >
                  بستن پیش‌نمایش
                </button>
              </div>
            </div>
          </div>
        )}

        {/* IN-APP CONFIRMATION MODAL (Replaces window.confirm) */}
        {confirmModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full text-right shadow-2xl border border-[#E4D7C2] space-y-4">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${confirmModal.isDanger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                  {confirmModal.isDanger ? <Trash2 className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
                </div>
                <h4 className="font-black text-[#231709] text-base">{confirmModal.title}</h4>
              </div>

              <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-medium">
                {confirmModal.message}
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const fn = confirmModal.onConfirm;
                    setConfirmModal(null);
                    fn();
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold transition-all shadow-md cursor-pointer ${
                    confirmModal.isDanger
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-[#163826] hover:bg-[#0E2619]'
                  }`}
                >
                  {confirmModal.confirmLabel || 'تایید'}
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
