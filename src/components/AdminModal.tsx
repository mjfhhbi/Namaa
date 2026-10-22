import React, { useState } from 'react';
import { Order, OrderStatus, Product, StoreSettings, DiscountCode } from '../types';
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
  Upload,
  FolderPlus,
  Tag,
  Users,
  Percent,
  Copy,
  Phone,
  MessageCircle,
  Download,
  Globe,
  Search,
  Filter,
  CheckCheck,
  ArrowRight,
  Clock,
  Send,
  Eye,
  Store,
  MapPin,
  RefreshCw,
  Sliders,
  ShieldCheck
} from 'lucide-react';
import { sendNtfyNotification, fetchAdminSettings } from '../services/storeService';
import { DEFAULT_SETTINGS } from '../data/defaultProducts';
import { PRESET_IMAGE_OPTIONS } from '../data/productImages';
import { compressImage } from '../utils/imageCompressor';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from '../firebase';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  products: Product[];
  settings: StoreSettings;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, extras?: { trackingCode?: string }) => Promise<void> | void;
  onDeleteOrder?: (orderId: string) => Promise<void> | void;
  onClearAllOrders?: () => Promise<void> | void;
  onSaveProduct: (product: Product) => Promise<void> | void;
  onDeleteProduct: (productId: string) => Promise<void> | void;
  onClearAllProducts: () => Promise<void> | void;
  onResetSampleProducts?: () => Promise<void> | void;
  onUpdateSettings: (settings: StoreSettings) => Promise<void> | void;
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
  onUpdateSettings,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMethod, setAuthMethod] = useState<'firebase_google' | 'pin' | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);
  const [googleLoginError, setGoogleLoginError] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  // Monitor Firebase Auth state
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (user.email === 'matinjahanbani2024@gmail.com') {
          setCurrentUser(user);
          setIsAuthenticated(true);
          setAuthMethod('firebase_google');
          try {
            const token = await user.getIdToken();
            sessionStorage.setItem('nama_admin_token', token);
          } catch {}
        } else {
          await signOut(auth);
          setIsAuthenticated(false);
          setCurrentUser(null);
          setGoogleLoginError('حساب گوگل وارد شده دسترسی مدیریت فروشگاه ناما را ندارد.');
        }
      }
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingInGoogle(true);
    setGoogleLoginError(null);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        if (res.user.email !== 'matinjahanbani2024@gmail.com') {
          await signOut(auth);
          setIsAuthenticated(false);
          setCurrentUser(null);
          setGoogleLoginError('حساب گوگل وارد شده دسترسی مدیریت ندارد.');
          return;
        }
        setIsAuthenticated(true);
        setCurrentUser(res.user);
        setAuthMethod('firebase_google');
        setFormSettings({ ...settings });
        try {
          const token = await res.user.getIdToken();
          sessionStorage.setItem('nama_admin_token', token);
          await setDoc(doc(db, 'admins', res.user.uid), {
            uid: res.user.uid,
            email: res.user.email,
            displayName: res.user.displayName,
            role: 'admin',
            lastLogin: new Date().toISOString()
          }, { merge: true });
          const fullSettings = await fetchAdminSettings();
          if (fullSettings) {
            setFormSettings(fullSettings);
            onUpdateSettings(fullSettings);
          }
        } catch (e) {
          console.warn('Admin registry notice:', e);
        }
      }
    } catch (err: any) {
      console.warn('Google sign-in error:', err);
      setGoogleLoginError(err?.message || 'خطا در احراز هویت با حساب گوگل');
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleLogout = async () => {
    const token = sessionStorage.getItem('nama_admin_token');
    if (token) {
      fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    try {
      await signOut(auth);
    } catch {}
    sessionStorage.removeItem('nama_admin_token');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setAuthMethod(null);
  };

  // Handle PIN Login fallback via Server API
  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(false);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: passwordInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        sessionStorage.setItem('nama_admin_token', data.token);
        setIsAuthenticated(true);
        setAuthMethod('pin');
        setLoginError(false);
        setFormSettings({ ...settings });
        try {
          const fullSettings = await fetchAdminSettings();
          if (fullSettings) {
            setFormSettings(fullSettings);
            onUpdateSettings(fullSettings);
          }
        } catch {}
      } else {
        setLoginError(true);
      }
    } catch {
      setLoginError(true);
    }
  };

  // Tabs
  type TabType = 'dashboard' | 'orders' | 'products' | 'categories' | 'discounts' | 'customers' | 'cms' | 'settings';
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Orders Management States
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // Product Edit/Create State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('all');
  const [productStockFilter, setProductStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [productSuccessMessage, setProductSuccessMessage] = useState<string | null>(null);
  const [isUploadingProductImage, setIsUploadingProductImage] = useState(false);

  // Category creation & editing states (Full Dynamic Category CRUD)
  const [isAddingNewCatInline, setIsAddingNewCatInline] = useState(false);
  const [inlineNewCatName, setInlineNewCatName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('🍵');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [editingCategoryModal, setEditingCategoryModal] = useState<{ id: string; name: string; icon: string; description?: string } | null>(null);

  // Discount Codes states
  const [newDiscountCode, setNewDiscountCode] = useState('');
  const [newDiscountType, setNewDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [newDiscountAmount, setNewDiscountAmount] = useState<number>(10);
  const [newDiscountMinPurchase, setNewDiscountMinPurchase] = useState<number>(0);
  const [newDiscountMaxCeiling, setNewDiscountMaxCeiling] = useState<number>(100000);

  // Settings State Form
  const [formSettings, setFormSettings] = useState<StoreSettings>({ ...settings });
  const [settingsActiveSubTab, setSettingsActiveSubTab] = useState<'general' | 'banking' | 'zarinpal' | 'shipping' | 'contact' | 'notifications' | 'deployment' | 'security' | 'backup'>('general');
  const [ntfyTestStatus, setNtfyTestStatus] = useState<string | null>(null);
  const [isTestingNtfy, setIsTestingNtfy] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(false);

  // Password change state
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Invoices & Lightbox
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [receiptLightboxUrl, setReceiptLightboxUrl] = useState<string | null>(null);
  const [copiedTrackingOrderId, setCopiedTrackingOrderId] = useState<string | null>(null);
  const [copiedCardStatus, setCopiedCardStatus] = useState(false);
  const [copiedDeploySnippet, setCopiedDeploySnippet] = useState<string | null>(null);

  // In-app Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Metrics
  const approvedOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'pending_receipt');
  const totalApprovedSales = approvedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const pendingVerificationCount = orders.filter(o => o.status === 'paid_pending_approval').length;
  const inPreparationCount = orders.filter(o => o.status === 'approved' || o.status === 'packaging').length;
  const shippedCount = orders.filter(o => o.status === 'shipped').length;
  const avgOrderValue = approvedOrders.length > 0 ? Math.round(totalApprovedSales / approvedOrders.length) : 0;
  const outOfStockProductsCount = products.filter(p => (p.stock ?? 0) <= 0).length;

  // Aggregate Unique Customers
  const customerMap = new Map<string, {
    name: string;
    phone: string;
    city: string;
    province: string;
    address: string;
    ordersCount: number;
    totalSpent: number;
    lastOrderDate: string;
  }>();

  orders.forEach(ord => {
    const cleanPh = ord.customerPhone.replace(/[\s-]/g, '');
    if (!customerMap.has(cleanPh)) {
      customerMap.set(cleanPh, {
        name: ord.customerName,
        phone: ord.customerPhone,
        city: ord.city,
        province: ord.province,
        address: ord.address,
        ordersCount: 1,
        totalSpent: ord.status !== 'cancelled' ? ord.totalAmount : 0,
        lastOrderDate: ord.createdAt,
      });
    } else {
      const existing = customerMap.get(cleanPh)!;
      existing.ordersCount += 1;
      if (ord.status !== 'cancelled') existing.totalSpent += ord.totalAmount;
      if (new Date(ord.createdAt) > new Date(existing.lastOrderDate)) {
        existing.lastOrderDate = ord.createdAt;
      }
    }
  });
  const customersList = Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);

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

  // Save Settings
  const handleSaveSettingsSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onUpdateSettings(formSettings);
    setSaveSuccessMessage(true);
    setTimeout(() => setSaveSuccessMessage(false), 3000);
  };

  // Reset settings to defaults
  const handleResetSettingsToDefault = () => {
    setConfirmModal({
      title: 'بازنشانی تنظیمات به مقادیر اولیه',
      message: 'آیا از بازنشانی کامل تنظیمات فروشگاه، حساب بانکی و متن‌ها به مقادیر پیش‌فرض اطمینان دارید؟',
      confirmLabel: 'بله، بازنشانی کن',
      isDanger: true,
      onConfirm: () => {
        const fresh = { ...DEFAULT_SETTINGS, customCategories: formSettings.customCategories || [] };
        setFormSettings(fresh);
        onUpdateSettings(fresh);
        setSaveSuccessMessage(true);
        setTimeout(() => setSaveSuccessMessage(false), 3000);
      }
    });
  };

  // Password change handler via Server API
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMessage(null);
    if (newPasswordInput.length < 4) {
      setPasswordChangeMessage({ text: 'رمز عبور جدید باید حداقل ۴ رقم/حرف باشد.', isError: true });
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      setPasswordChangeMessage({ text: 'تکرار رمز عبور جدید یکسان نیست.', isError: true });
      return;
    }
    try {
      const token = sessionStorage.getItem('nama_admin_token');
      const res = await fetch('/api/admin/change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          currentPin: oldPasswordInput.trim(),
          newPin: newPasswordInput.trim()
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.token) {
          sessionStorage.setItem('nama_admin_token', data.token);
        }
        setPasswordChangeMessage({ text: 'رمز عبور مدیریت با موفقیت در سرور تغییر یافت ✅', isError: false });
        setOldPasswordInput('');
        setNewPasswordInput('');
        setConfirmNewPasswordInput('');
      } else {
        setPasswordChangeMessage({ text: data.error || 'خطا در تغییر رمز عبور', isError: true });
      }
    } catch {
      setPasswordChangeMessage({ text: 'خطا در برقراری ارتباط با سرور', isError: true });
    }
  };

  // Product Image Upload
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

  // Category management helpers (Full Dynamic Category CRUD)
  const handleAddNewCategory = (catName: string, icon: string = '🍵', desc: string = '') => {
    const trimmed = catName.trim();
    if (!trimmed) return null;
    const catId = `cat_${Date.now()}`;
    const newCatItem = {
      id: catId,
      name: trimmed,
      icon: icon || '🍵',
      description: desc,
    };
    const updatedCats = [...(formSettings.customCategories || []), newCatItem];
    const newSettings = { ...formSettings, customCategories: updatedCats };
    setFormSettings(newSettings);
    onUpdateSettings(newSettings);
    return newCatItem;
  };

  const handleUpdateCategorySave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategoryModal || !editingCategoryModal.name.trim()) return;
    const updatedCats = (formSettings.customCategories || []).map(c => 
      c.id === editingCategoryModal.id 
        ? { ...c, name: editingCategoryModal.name.trim(), icon: editingCategoryModal.icon, description: editingCategoryModal.description?.trim() } 
        : c
    );
    const newSettings = { ...formSettings, customCategories: updatedCats };
    setFormSettings(newSettings);
    onUpdateSettings(newSettings);
    setEditingCategoryModal(null);
  };

  const handleDeleteCategory = (catId: string) => {
    const matchingProds = products.filter(p => p.category === catId);
    const catName = formSettings.customCategories?.find(c => c.id === catId)?.name || 'دسته‌بندی';
    const warning = matchingProds.length > 0 
      ? `توجه: تعداد ${matchingProds.length} محصول در این دسته قرار دارند. آیا از حذف دسته «${catName}» اطمینان دارید؟` 
      : `آیا از حذف دسته‌بندی «${catName}» اطمینان دارید؟`;

    setConfirmModal({
      title: 'حذف دسته‌بندی',
      message: warning,
      confirmLabel: 'بله، حذف کن',
      isDanger: true,
      onConfirm: () => {
        const updatedCats = (formSettings.customCategories || []).filter(c => c.id !== catId);
        const newSettings = { ...formSettings, customCategories: updatedCats };
        setFormSettings(newSettings);
        onUpdateSettings(newSettings);
      }
    });
  };

  // Discount code management
  const handleAddDiscountCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = newDiscountCode.trim().toUpperCase();
    if (!cleanCode) return;
    const newCoupon: DiscountCode = {
      id: `disc_${Date.now()}`,
      code: cleanCode,
      type: newDiscountType,
      amount: Number(newDiscountAmount),
      minPurchase: Number(newDiscountMinPurchase) || 0,
      maxDiscount: newDiscountType === 'percent' ? Number(newDiscountMaxCeiling) : undefined,
      isActive: true,
      usageCount: 0,
    };
    const updatedCodes = [...(formSettings.discountCodes || []), newCoupon];
    const newSettings = { ...formSettings, discountCodes: updatedCodes };
    setFormSettings(newSettings);
    onUpdateSettings(newSettings);
    setNewDiscountCode('');
    setNewDiscountAmount(10);
  };

  const handleDeleteDiscountCode = (id: string) => {
    const updatedCodes = (formSettings.discountCodes || []).filter(c => c.id !== id);
    const newSettings = { ...formSettings, discountCodes: updatedCodes };
    setFormSettings(newSettings);
    onUpdateSettings(newSettings);
  };

  const handleToggleDiscountCode = (id: string) => {
    const updatedCodes = (formSettings.discountCodes || []).map(c => 
      c.id === id ? { ...c, isActive: !c.isActive } : c
    );
    const newSettings = { ...formSettings, discountCodes: updatedCodes };
    setFormSettings(newSettings);
    onUpdateSettings(newSettings);
  };

  // Product Submit
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductFormError(null);
    if (!editingProduct?.name || !editingProduct.name.trim()) {
      setProductFormError('نام محصول الزامی است');
      return;
    }
    const parsedPrice = Number(editingProduct.price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setProductFormError('لطفاً یک قیمت معتبر (بزرگتر از صفر) به تومان وارد فرمایید');
      return;
    }

    let chosenCategory = (editingProduct.category || '').trim();
    if (!chosenCategory) {
      chosenCategory = formSettings.customCategories?.[0]?.id || 'organic';
    }
    const matchingCat = formSettings.customCategories?.find(c => c.id === chosenCategory || c.name === chosenCategory);
    let categoryLabel = matchingCat ? matchingCat.name : (editingProduct.categoryLabel || chosenCategory);

    // If new category, auto-register it to store categories so it appears in navigation
    if (!matchingCat && chosenCategory) {
      const newCat = {
        id: chosenCategory,
        name: editingProduct.categoryLabel || chosenCategory,
        icon: '🌿'
      };
      const updatedCategories = [...(formSettings.customCategories || []), newCat];
      const updatedSettings = { ...formSettings, customCategories: updatedCategories };
      setFormSettings(updatedSettings);
      onUpdateSettings(updatedSettings);
      categoryLabel = newCat.name;
    }

    const finalProduct: Product = {
      id: editingProduct.id || `product_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: editingProduct.name.trim(),
      category: chosenCategory,
      categoryLabel: categoryLabel,
      price: parsedPrice,
      ...(editingProduct.originalPrice && Number(editingProduct.originalPrice) > 0 
          ? { originalPrice: Number(editingProduct.originalPrice) } 
          : {}),
      weight: editingProduct.weight?.trim() || 'بسته استاندارد',
      shortDesc: editingProduct.shortDesc?.trim() || '',
      description: editingProduct.description?.trim() || '',
      benefits: Array.isArray(editingProduct.benefits) 
        ? editingProduct.benefits 
        : (typeof editingProduct.benefits === 'string' ? (editingProduct.benefits as string).split('\n').map(s => s.trim()).filter(Boolean) : []),
      origin: editingProduct.origin?.trim() || 'ایران',
      stock: Number(editingProduct.stock ?? 10),
      image: editingProduct.image || PRESET_IMAGE_OPTIONS[0].url,
      isPopular: !!editingProduct.isPopular,
      isOrganic: !!editingProduct.isOrganic,
      isFeatured: !!editingProduct.isFeatured,
      isNewArrival: !!editingProduct.isNewArrival,
      ...(editingProduct.badge?.trim() ? { badge: editingProduct.badge.trim() } : {}),
      rating: editingProduct.rating ? Number(editingProduct.rating) : 5.0,
      createdAt: editingProduct.createdAt || new Date().toISOString(),
    };
    try {
      await onSaveProduct(finalProduct);
      setEditingProduct(null);
      setProductFormError(null);
      setProductSuccessMessage(`محصول «${finalProduct.name}» با موفقیت در کاتالوگ فروشگاه ذخیره گردید.`);
      setTimeout(() => setProductSuccessMessage(null), 5000);
    } catch (err: any) {
      setProductFormError(err?.message || 'خطا در ذخیره محصول در پایگاه داده.');
    }
  };

  // Duplicate product
  const handleDuplicateProduct = (prod: Product) => {
    const duplicated: Product = {
      ...prod,
      id: `product_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: `${prod.name} (کپی)`,
      createdAt: new Date().toISOString(),
    };
    onSaveProduct(duplicated);
  };

  // JSON Backup & Export
  const handleExportBackup = () => {
    const backupData = {
      exportedAt: new Date().toISOString(),
      storeSettings: formSettings,
      products,
      orders,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nama_store_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.storeSettings) {
          setFormSettings(json.storeSettings);
          onUpdateSettings(json.storeSettings);
        }
        if (Array.isArray(json.products)) {
          json.products.forEach((p: Product) => onSaveProduct(p));
        }
        setSaveSuccessMessage(true);
        setTimeout(() => setSaveSuccessMessage(false), 3000);
      } catch (err) {
        alert('فایل پشتیبان نامعتبر است.');
      }
    };
    reader.readAsText(file);
  };

  // Copy tracking SMS template
  const handleCopyTrackingMessage = (ord: Order) => {
    const trackingCode = ord.trackingCode || '';
    const text = `سلام جناب ${ord.customerName} گرامی،\nسفارش شما در فروشگاه ناما (${ord.id}) با موفقیت ارسال گردید.\nکد رهگیری پستی مرسوله:\n${trackingCode}\nسامانه رهگیری پست: tracking.post.ir\nاز خرید و اعتماد شما سپاسگزاریم 🌿`;
    navigator.clipboard.writeText(text);
    setCopiedTrackingOrderId(ord.id);
    setTimeout(() => setCopiedTrackingOrderId(null), 3000);
  };

  // Filtered Products
  const filteredProducts = products.filter(p => {
    const matchesSearch = !productSearch.trim() || 
      (p.name && p.name.toLowerCase().includes(productSearch.toLowerCase())) || 
      (p.categoryLabel && p.categoryLabel.includes(productSearch)) ||
      (p.category && p.category.includes(productSearch));
    const matchesCat = productCategoryFilter === 'all' || p.category === productCategoryFilter;
    const matchesStock = productStockFilter === 'all' || 
      (productStockFilter === 'in_stock' ? (p.stock ?? 0) > 0 : (p.stock ?? 0) <= 0);
    return matchesSearch && matchesCat && matchesStock;
  });

  // Filtered Orders
  const filteredOrders = orders.filter(ord => {
    const matchesStatus = orderStatusFilter === 'all' || ord.status === orderStatusFilter;
    const q = orderSearchQuery.trim().toLowerCase();
    const matchesQuery = !q || 
      ord.id.toLowerCase().includes(q) ||
      ord.customerName.toLowerCase().includes(q) ||
      ord.customerPhone.includes(q) ||
      (ord.trackingCode && ord.trackingCode.includes(q));
    return matchesStatus && matchesQuery;
  });

  // Helper for Order Status Stepper calculations
  const getOrderProgressInfo = (status: OrderStatus) => {
    switch (status) {
      case 'pending_receipt':
        return { step: 1, percent: 20, label: 'در انتظار پرداخت و فیش', color: 'bg-amber-500' };
      case 'paid_pending_approval':
        return { step: 2, percent: 40, label: 'فیش ثبت شده، نیازمند تایید', color: 'bg-red-500' };
      case 'approved':
        return { step: 3, percent: 60, label: 'واریز تایید شد', color: 'bg-blue-600' };
      case 'packaging':
        return { step: 4, percent: 80, label: 'در حال بسته‌بندی در انبار', color: 'bg-amber-600' };
      case 'shipped':
        return { step: 5, percent: 100, label: 'تحویل پست و ارسال شد', color: 'bg-emerald-600' };
      case 'cancelled':
        return { step: 0, percent: 0, label: 'سفارش لغو شده', color: 'bg-gray-400' };
      default:
        return { step: 1, percent: 20, label: 'در حال بررسی', color: 'bg-amber-500' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div 
        className="relative w-full max-w-6xl bg-[#FAF8F3] rounded-3xl shadow-2xl border border-[#E4D7C2] overflow-hidden text-right flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-[#E8DEC9] bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#231709] text-white flex items-center justify-center shadow-xs">
              <KeyRound className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-[#231709]">
                  داشبورد مدیریت جامع فروشگاه ناما
                </h3>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                  CRUD و رهگیری بصری ۱۰۰٪ کامل
                </span>
              </div>
              <p className="text-[11px] text-[#6F7F72]">
                {isAuthenticated ? 'مدیریت پویا، تنظیمات کامل فروشگاه، پیگیری بصری وضعیت مرسولات و انبارداری' : 'ورود امن مدیریت'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col text-left text-[11px] leading-tight">
                  <span className="font-bold text-gray-800">{currentUser?.email || 'مدیر سیستم'}</span>
                  <span className="text-emerald-700 font-semibold text-[10px]">
                    {authMethod === 'firebase_google' ? '✓ احراز هویت Firebase' : 'دسترسی با رمز عبور'}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-xs text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl border border-red-200 transition-colors font-bold cursor-pointer"
                >
                  خروج
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* LOGIN SCREEN */}
        {!isAuthenticated ? (
          <div className="p-6 sm:p-10 text-center max-w-md mx-auto my-auto space-y-5 animate-in fade-in">
            <div className="w-16 h-16 rounded-3xl bg-[#FAF3E3] border border-[#E3CE9B] flex items-center justify-center text-[#231709] mx-auto shadow-sm">
              <Lock className="w-8 h-8 text-[#231709]" />
            </div>

            <div>
              <h4 className="text-lg font-black text-[#231709]">ورود امن به پنل مدیریت</h4>
              <p className="text-xs text-[#6A5A4A] mt-1">
                دسترسی به اطلاعات سفارشات، تغییر قیمت‌ها و کاتالوگ فروشگاه
              </p>
            </div>

            {/* Google Authentication (Primary / Cryptographic) */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoggingInGoogle}
                className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-gray-50 text-gray-800 font-bold text-xs sm:text-sm shadow-sm border border-gray-300 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
              >
                {/* Official Google 'G' Icon */}
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{isLoggingInGoogle ? 'در حال اتصال به Google...' : 'ورود با حساب گوگل مدیر'}</span>
              </button>

              <div className="text-[11px] text-gray-500 font-medium">
                حساب مجاز مدیر: <span className="font-mono font-bold text-gray-700">matinjahanbani2024@gmail.com</span>
              </div>

              {googleLoginError && (
                <div className="text-xs text-red-600 font-bold bg-red-50 p-2.5 rounded-xl border border-red-200">
                  {googleLoginError}
                </div>
              )}
            </div>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-gray-200 w-full" />
              <span className="bg-[#FAF8F3] px-3 text-[11px] text-gray-400 font-bold whitespace-nowrap">
                یا ورود با رمز عبور
              </span>
            </div>

            {/* PIN Fallback Form */}
            <form onSubmit={handlePinLogin} className="space-y-3">
              <input
                type="password"
                dir="ltr"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="رمز عبور مدیریت..."
                className="w-full bg-white border border-[#D5C6AC] rounded-2xl px-4 py-3 text-center text-base font-mono text-[#231709] focus:outline-none focus:ring-2 focus:ring-[#D4A340]"
              />

              {loginError && (
                <div className="text-xs text-red-600 font-bold bg-red-50 p-2.5 rounded-xl border border-red-200">
                  رمز عبور وارد شده نادرست است!
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-[#231709] hover:bg-[#150D05] text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Unlock className="w-4 h-4 text-amber-300" />
                <span>ورود با رمز</span>
              </button>
            </form>

            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 text-right leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
              <span>
                <strong>امنیت دیتابیس:</strong> تغییرات موجودی، سفارش‌ها و اطلاعات مالی توسط قوانین امنیتی Firestore و سرور مرکزی محافظت می‌شوند.
              </span>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED ADMIN PANEL */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Nav Tabs */}
            <div className="bg-[#FAF8F3] border-b border-[#E8DEC9] px-3 sm:px-4 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-[#D4A340]" />
                <span>داشبورد و آمار</span>
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                  activeTab === 'orders'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <ShoppingBag className="w-4 h-4 text-[#2F4E34]" />
                <span>رهگیری و سفارشات</span>
                {pendingVerificationCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                    {pendingVerificationCount} جدید
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('products')}
                className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                  activeTab === 'products'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Package className="w-4 h-4 text-[#231709]" />
                <span>محصولات</span>
                <span className="text-[11px] text-gray-400">({products.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('categories')}
                className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                  activeTab === 'categories'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <FolderPlus className="w-4 h-4 text-[#D4A340]" />
                <span>مدیریت دسته‌ها (CRUD)</span>
                <span className="text-[11px] text-gray-400">({formSettings.customCategories?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('discounts')}
                className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                  activeTab === 'discounts'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Percent className="w-4 h-4 text-emerald-600" />
                <span>کدهای تخفیف</span>
              </button>

              <button
                onClick={() => setActiveTab('customers')}
                className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                  activeTab === 'customers'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-600" />
                <span>مشتریان ({customersList.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('cms')}
                className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                  activeTab === 'cms'
                    ? 'border-[#D4A340] text-[#A47922]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Type className="w-4 h-4 text-[#D4A340]" />
                <span>متون ویترین (CMS)</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'border-[#231709] text-[#231709]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Settings className="w-4 h-4 text-gray-700" />
                <span>تنظیمات کامل فروشگاه</span>
              </button>
            </div>

            {/* TAB CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              
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
                      <span className="text-xs text-emerald-700 font-bold block mb-1">ارسال شده با پست</span>
                      <span className="text-2xl font-black text-emerald-700">
                        {shippedCount}
                      </span>
                      <span className="text-xs text-gray-500 mr-1">مرسوله</span>
                    </div>
                  </div>

                  {/* Secondary Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-[#FAF3E3] p-3 rounded-2xl border border-[#E8DEC9]">
                      <span className="text-gray-600 block">تعداد محصولات</span>
                      <strong className="text-base font-black text-[#231709] mt-0.5 block">{products.length} قلم</strong>
                    </div>
                    <div className="bg-[#FAF3E3] p-3 rounded-2xl border border-[#E8DEC9]">
                      <span className="text-gray-600 block">دسته‌بندی‌های فعال</span>
                      <strong className="text-base font-black text-[#231709] mt-0.5 block">{formSettings.customCategories?.length || 0} دسته</strong>
                    </div>
                    <div className="bg-[#FAF3E3] p-3 rounded-2xl border border-[#E8DEC9]">
                      <span className="text-gray-600 block">میانگین ارزش سفارش</span>
                      <strong className="text-base font-black text-[#231709] mt-0.5 block">{avgOrderValue.toLocaleString('fa-IR')} تومان</strong>
                    </div>
                    <div className="bg-[#FAF3E3] p-3 rounded-2xl border border-[#E8DEC9]">
                      <span className="text-gray-600 block">وضعیت موجودی انبار</span>
                      <strong className={`text-base font-black mt-0.5 block ${outOfStockProductsCount > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {outOfStockProductsCount > 0 ? `${outOfStockProductsCount} کالای صفر` : 'تمامی کالاها موجود'}
                      </strong>
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
                          تاپیک تنظیم شده: <code className="bg-white/15 px-2 py-0.5 rounded text-amber-300 font-mono">{formSettings.ntfyTopic}</code>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`https://ntfy.sh/${formSettings.ntfyTopic}`}
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
                        className="px-4 py-2 rounded-xl bg-[#D4A340] hover:bg-[#B8860B] text-[#231709] text-xs font-black shadow-sm transition-all cursor-pointer"
                      >
                        {isTestingNtfy ? 'در حال ارسال...' : 'تست اعلان ntfy'}
                      </button>
                    </div>
                  </div>

                  {/* Quick Shortcut Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => setActiveTab('categories')}
                      className="p-4 rounded-2xl bg-white border border-[#E7DDC9] hover:bg-[#FAF3E3] transition-all text-right flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <h5 className="font-black text-sm text-[#231709]">تعریف و مدیریت دسته‌ها</h5>
                        <p className="text-xs text-gray-500 mt-0.5">افزودن و ویرایش دسته چای، دمنوش و...</p>
                      </div>
                      <FolderPlus className="w-5 h-5 text-[#A47922]" />
                    </button>

                    <button
                      onClick={() => {
                        setIsNewProduct(true);
                        const firstCat = formSettings.customCategories?.[0];
                        setEditingProduct({
                          name: '',
                          category: firstCat ? firstCat.id : 'tea',
                          categoryLabel: firstCat ? firstCat.name : 'چای',
                          price: 180000,
                          weight: 'بسته ۲۵۰ گرمی',
                          stock: 20,
                          isOrganic: true,
                          isFeatured: true,
                          image: PRESET_IMAGE_OPTIONS[0].url,
                        });
                        setActiveTab('products');
                      }}
                      className="p-4 rounded-2xl bg-white border border-[#E7DDC9] hover:bg-[#FAF3E3] transition-all text-right flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <h5 className="font-black text-sm text-[#231709]">افزودن محصول جدید</h5>
                        <p className="text-xs text-gray-500 mt-0.5">ثبت چای میوه‌ای، دمنوش، ادویه یا هر محصول دلخواه</p>
                      </div>
                      <Plus className="w-5 h-5 text-[#2F4E34]" />
                    </button>

                    <button
                      onClick={() => setActiveTab('orders')}
                      className="p-4 rounded-2xl bg-white border border-[#E7DDC9] hover:bg-[#FAF3E3] transition-all text-right flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <h5 className="font-black text-sm text-[#231709]">پیگیری بصری سفارشات</h5>
                        <p className="text-xs text-gray-500 mt-0.5">{orders.length} سفارش ثبت شده</p>
                      </div>
                      <Truck className="w-5 h-5 text-emerald-600" />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: ORDERS MANAGEMENT WITH DETAILED TRACKING VISUALIZATION */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  {/* Top order control bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-[#E7DDC9]">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={orderSearchQuery}
                          onChange={(e) => setOrderSearchQuery(e.target.value)}
                          placeholder="جستجو با شناسه، نام، شماره یا کد رهگیری..."
                          className="bg-[#FAF8F3] border rounded-xl pr-8 pl-3 py-1.5 text-xs w-64"
                        />
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                      </div>

                      <select
                        value={orderStatusFilter}
                        onChange={(e) => setOrderStatusFilter(e.target.value as any)}
                        className="bg-[#FAF8F3] border rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#231709]"
                      >
                        <option value="all">همه وضعیت‌ها ({orders.length})</option>
                        <option value="pending_receipt">۱. در انتظار ثبت فیش</option>
                        <option value="paid_pending_approval">۲. ⚠️ نیازمند بررسی فیش</option>
                        <option value="approved">۳. ✓ واریز تایید شده</option>
                        <option value="packaging">۴. 📦 در حال بسته‌بندی</option>
                        <option value="shipped">۵. 🚚 ارسال شده با پست</option>
                        <option value="cancelled">✕ لغو شده</option>
                      </select>
                    </div>

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
                        className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>پاکسازی کل سفارشات</span>
                      </button>
                    )}
                  </div>

                  {/* Orders List with Detailed Interactive Pipeline Visualization */}
                  <div className="space-y-4">
                    {filteredOrders.length === 0 ? (
                      <div className="bg-white rounded-3xl border border-[#E7DDC9] p-12 text-center text-xs text-gray-500">
                        {orders.length === 0 ? 'هنوز سفارشی ثبت نشده است.' : 'سفارشی با این فیلتر یافت نشد.'}
                      </div>
                    ) : (
                      filteredOrders.map((ord) => {
                        const cleanCustomerPhone = ord.customerPhone.replace(/[\s-]/g, '');
                        const progress = getOrderProgressInfo(ord.status);

                        return (
                          <div key={ord.id} className="bg-white rounded-3xl border border-[#E7DDC9] p-4 sm:p-6 space-y-4 shadow-xs">
                            {/* Order Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                              <div className="flex items-center gap-3">
                                <span className="text-lg font-mono font-black text-[#231709] bg-[#FAF8F3] px-3 py-1 rounded-xl border border-[#E8DEC9]">
                                  {ord.id}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                                  ord.status === 'paid_pending_approval' ? 'bg-red-100 text-red-800 border border-red-300' :
                                  ord.status === 'approved' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                                  ord.status === 'packaging' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                  ord.status === 'shipped' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-gray-100'
                                }`}>
                                  <span className={`w-2 h-2 rounded-full ${progress.color} animate-pulse`} />
                                  <span>{progress.label}</span>
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setInvoiceOrder(ord)}
                                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-xl flex items-center gap-1.5 font-bold cursor-pointer transition-all"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>چاپ فاکتور رسمی</span>
                                </button>
                                <span className="text-xs text-gray-400 font-mono">
                                  {new Date(ord.createdAt).toLocaleString('fa-IR')}
                                </span>
                              </div>
                            </div>

                            {/* DETAILED ORDER TRACKING VISUALIZATION PIPELINE */}
                            {ord.status !== 'cancelled' ? (
                              <div className="bg-[#FAF8F3] p-4 rounded-2xl border border-[#E8DEC9] space-y-3">
                                <div className="flex items-center justify-between text-xs font-bold text-[#231709]">
                                  <span className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-[#D4A340]" />
                                    <span>مراحل پردازش و ارسال مرسوله (پیشرفت: {progress.percent}٪)</span>
                                  </span>
                                  <span className="text-[11px] text-gray-500 font-mono">
                                    بروزرسانی: {new Date(ord.updatedAt || ord.createdAt).toLocaleTimeString('fa-IR')}
                                  </span>
                                </div>

                                {/* Progress Bar Track */}
                                <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all duration-500 rounded-full ${progress.color}`}
                                    style={{ width: `${progress.percent}%` }}
                                  />
                                </div>

                                {/* Step Nodes */}
                                <div className="grid grid-cols-5 gap-1 text-center pt-1">
                                  <div className="flex flex-col items-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${progress.step >= 1 ? 'bg-[#231709] text-white' : 'bg-gray-200 text-gray-500'}`}>
                                      ۱
                                    </div>
                                    <span className="text-[10px] mt-1 font-semibold text-gray-700">ثبت اولیه</span>
                                  </div>

                                  <div className="flex flex-col items-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${progress.step >= 2 ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                      ۲
                                    </div>
                                    <span className="text-[10px] mt-1 font-semibold text-gray-700">ارسال فیش</span>
                                  </div>

                                  <div className="flex flex-col items-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${progress.step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                      ۳
                                    </div>
                                    <span className="text-[10px] mt-1 font-semibold text-gray-700">تایید واریز</span>
                                  </div>

                                  <div className="flex flex-col items-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${progress.step >= 4 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                      ۴
                                    </div>
                                    <span className="text-[10px] mt-1 font-semibold text-gray-700">بسته‌بندی</span>
                                  </div>

                                  <div className="flex flex-col items-center">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${progress.step >= 5 ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                      ۵
                                    </div>
                                    <span className="text-[10px] mt-1 font-semibold text-gray-700">تحویل به پست</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-2xl text-xs font-bold flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-600" />
                                <span>این سفارش لغو گردیده است.</span>
                              </div>
                            )}

                            {/* Customer & Address & Contact Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-[#FAF8F3] p-3.5 rounded-2xl border border-[#ECE0CE]">
                              <div>
                                <span className="text-gray-500 block text-[11px]">اطلاعات خریدار:</span>
                                <span className="font-bold text-[#143220] text-sm block mt-0.5">{ord.customerName}</span>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-gray-600 font-mono font-bold" dir="ltr">{ord.customerPhone}</span>
                                  <a
                                    href={`https://wa.me/${cleanCustomerPhone.startsWith('0') ? '98' + cleanCustomerPhone.slice(1) : cleanCustomerPhone}?text=${encodeURIComponent(`سلام جناب ${ord.customerName} عزیز، وضعیت سفارش ${ord.id} شما در فروشگاه ناما: ${progress.label}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors"
                                    title="ارسال پیام واتساپ به مشتری"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </a>
                                  <a
                                    href={`tel:${ord.customerPhone}`}
                                    className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 transition-colors"
                                    title="تماس تلفنی"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>

                              <div>
                                <span className="text-gray-500 block text-[11px]">آدرس گیرنده مرسوله:</span>
                                <span className="font-medium text-[#2C4030] block mt-0.5">
                                  {ord.province}، {ord.city}، {ord.address}
                                </span>
                                {ord.postalCode && (
                                  <span className="block text-gray-600 font-mono mt-1 font-bold">
                                    کد پستی: {ord.postalCode}
                                  </span>
                                )}
                              </div>

                              <div>
                                <span className="text-gray-500 block text-[11px]">اطلاعات تراکنش و کارت:</span>
                                <div className="text-[#231709] font-medium mt-0.5">
                                  {ord.cardLast4 && <span>۴ رقم کارت: <strong className="font-mono">{ord.cardLast4}</strong> | </span>}
                                  {ord.paymentReference && <span>شماره پیگیری: <strong className="font-mono">{ord.paymentReference}</strong></span>}
                                  {!ord.cardLast4 && !ord.paymentReference && <span className="text-amber-700">رسید ثبت نشده</span>}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="font-black text-[#231709] text-sm">
                                    {ord.totalAmount.toLocaleString('fa-IR')} تومان
                                  </span>
                                  {ord.discountAmount ? (
                                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold">
                                      (تخفیف: {ord.discountAmount.toLocaleString('fa-IR')})
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {/* Ordered Items Preview */}
                            <div className="text-xs bg-white p-3 rounded-2xl border border-gray-100 flex flex-wrap gap-2 items-center">
                              <span className="text-gray-500 text-[11px] font-bold">اقلام سفارش:</span>
                              {ord.items.map((item, idx) => (
                                <span key={idx} className="bg-gray-100 px-2.5 py-1 rounded-xl text-gray-800 font-medium">
                                  {item.name} ({item.weight}) × {item.quantity} عدد
                                </span>
                              ))}
                            </div>

                            {/* Receipt Image Preview */}
                            {ord.receiptImage && (
                              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
                                <img 
                                  src={ord.receiptImage} 
                                  alt="فیش واریزی" 
                                  className="w-16 h-16 rounded-xl object-cover border cursor-pointer hover:scale-105 transition-transform"
                                  onClick={() => setReceiptLightboxUrl(ord.receiptImage!)}
                                  title="کلیک برای مشاهده اندازه اصلی فیش"
                                />
                                <div className="text-xs text-emerald-900">
                                  <span className="font-bold block">تصویر فیش واریزی کارت‌به‌کارت خریدار</span>
                                  <button 
                                    type="button"
                                    onClick={() => setReceiptLightboxUrl(ord.receiptImage!)}
                                    className="text-emerald-700 underline text-xs mt-1 inline-block font-bold hover:text-emerald-900 cursor-pointer"
                                  >
                                    مشاهده و بزرگنمایی تصویر فیش ←
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Postal Tracking Code & Advance Controls */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                              {/* Advance Status Pipeline Action Buttons */}
                              <div className="flex flex-wrap items-center gap-2">
                                {ord.status === 'paid_pending_approval' && (
                                  <button
                                    onClick={() => onUpdateOrderStatus(ord.id, 'approved')}
                                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>تایید واریزی فیش (مرحله ۳)</span>
                                  </button>
                                )}

                                {ord.status === 'approved' && (
                                  <button
                                    onClick={() => onUpdateOrderStatus(ord.id, 'packaging')}
                                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                  >
                                    <Package className="w-4 h-4" />
                                    <span>انتقال به بسته‌بندی در انبار (مرحله ۴)</span>
                                  </button>
                                )}

                                {/* Postal Code Entry & Action */}
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    dir="ltr"
                                    placeholder="کد رهگیری پستی (۲۴ رقمی)..."
                                    defaultValue={ord.trackingCode || ''}
                                    id={`track-${ord.id}`}
                                    className="bg-white border border-[#D5C6AC] rounded-xl px-3 py-1.5 text-xs font-mono w-52 text-center"
                                  />
                                  <button
                                    onClick={() => {
                                      const val = (document.getElementById(`track-${ord.id}`) as HTMLInputElement)?.value;
                                      onUpdateOrderStatus(ord.id, 'shipped', { trackingCode: val });
                                    }}
                                    className="px-3.5 py-1.5 rounded-xl bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                  >
                                    <Truck className="w-3.5 h-3.5 text-amber-300" />
                                    <span>ثبت کد و ارسال نهایی</span>
                                  </button>
                                </div>

                                {ord.trackingCode && (
                                  <>
                                    <a
                                      href={`https://tracking.post.ir/?id=${ord.trackingCode}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 transition-all flex items-center gap-1 cursor-pointer"
                                      title="مشاهده مستقیم مرسوله در سامانه رهگیری شرکت پست ایران"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      <span>سامانه رهگیری پست</span>
                                    </a>

                                    <button
                                      onClick={() => handleCopyTrackingMessage(ord)}
                                      className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 transition-all flex items-center gap-1 cursor-pointer"
                                      title="کپی متن پیامک آماده ارسال به خریدار"
                                    >
                                      {copiedTrackingOrderId === ord.id ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                      <span>{copiedTrackingOrderId === ord.id ? 'پیامک کپی شد!' : 'کپی متن پیامک رهگیری'}</span>
                                    </button>
                                  </>
                                )}
                              </div>

                              <div className="flex items-center gap-2 mr-auto">
                                <button
                                  onClick={() => onUpdateOrderStatus(ord.id, 'cancelled')}
                                  className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-xl transition-all font-bold cursor-pointer"
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
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                    title="حذف دائمی این سفارش"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: PRODUCTS MANAGEMENT */}
              {activeTab === 'products' && (
                <div className="space-y-4">
                  {/* Top action bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-[#E7DDC9]">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="جستجو در محصولات..."
                        className="bg-[#FAF8F3] border rounded-xl px-3 py-1.5 text-xs w-44"
                      />

                      <select
                        value={productCategoryFilter}
                        onChange={(e) => setProductCategoryFilter(e.target.value)}
                        className="bg-[#FAF8F3] border rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#231709]"
                      >
                        <option value="all">همه دسته‌ها</option>
                        {(formSettings.customCategories || []).map(c => (
                          <option key={c.id} value={c.id}>{c.icon || '🍵'} {c.name}</option>
                        ))}
                      </select>

                      <select
                        value={productStockFilter}
                        onChange={(e) => setProductStockFilter(e.target.value as any)}
                        className="bg-[#FAF8F3] border rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#231709]"
                      >
                        <option value="all">همه موجودی‌ها</option>
                        <option value="in_stock">فقط موجود در انبار</option>
                        <option value="out_of_stock">کالاهای ناموجود (صفر)</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            title: 'خالی کردن کاتالوگ محصولات',
                            message: '⚠️ آیا از حذف یکجای تمامی محصولات اطمینان دارید؟ تمام محصولات کاتالوگ پاک خواهند شد و کاتالوگ سفید در اختیار شما قرار می‌گیرد.',
                            confirmLabel: 'بله، همه محصولات را پاک کن',
                            isDanger: true,
                            onConfirm: () => onClearAllProducts(),
                          });
                        }}
                        className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="خالی کردن کامل کاتالوگ محصولات"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>خالی کردن کامل کاتالوگ</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsNewProduct(true);
                          const firstCat = formSettings.customCategories?.[0];
                          setEditingProduct({
                            name: '',
                            category: firstCat ? firstCat.id : 'organic',
                            categoryLabel: firstCat ? firstCat.name : 'محصولات ارگانیک و طبیعی',
                            price: 150000,
                            weight: 'بسته استاندارد',
                            stock: 25,
                            isOrganic: true,
                            isFeatured: true,
                            origin: 'ایران',
                            shortDesc: '',
                            description: '',
                            image: PRESET_IMAGE_OPTIONS[0].url,
                          });
                        }}
                        className="px-4 py-2 rounded-2xl bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
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
                          className="text-gray-400 hover:text-gray-600 cursor-pointer"
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
                              placeholder="مثلاً: چای میوه‌ای اعلا"
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                              required
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-bold text-gray-700">دسته‌بندی محصول *</label>
                              <button
                                type="button"
                                onClick={() => setIsAddingNewCatInline(!isAddingNewCatInline)}
                                className="text-[11px] text-[#A47922] hover:text-[#231709] font-bold flex items-center gap-0.5 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>{isAddingNewCatInline ? 'انصراف' : 'تعریف دسته جدید'}</span>
                              </button>
                            </div>

                            {isAddingNewCatInline ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={inlineNewCatName}
                                  onChange={(e) => setInlineNewCatName(e.target.value)}
                                  placeholder="نام دسته (مثلاً: چای)"
                                  className="w-full bg-[#FAF8F3] border-2 border-[#D4A340] rounded-xl px-2.5 py-1.5 text-xs font-bold"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!inlineNewCatName.trim()) return;
                                    const created = handleAddNewCategory(inlineNewCatName, '🍵');
                                    if (created) {
                                      setEditingProduct({
                                        ...editingProduct,
                                        category: created.id,
                                        categoryLabel: created.name
                                      });
                                    }
                                    setInlineNewCatName('');
                                    setIsAddingNewCatInline(false);
                                  }}
                                  className="px-2.5 py-1.5 bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold rounded-xl whitespace-nowrap cursor-pointer"
                                >
                                  ثبت
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <select
                                  value={editingProduct.category || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '__NEW__') {
                                      setIsAddingNewCatInline(true);
                                    } else {
                                      const found = formSettings.customCategories?.find(c => c.id === val);
                                      const fallbackLabels: Record<string, string> = {
                                        organic: 'محصولات ارگانیک و طبیعی',
                                        tea: 'چای و دمنوش‌های گیاهی',
                                        herbal: 'عرقیات سنتی',
                                        spices: 'ادویه و چاشنی ناب',
                                        nuts: 'خشکبار و آجیل اعلا',
                                        oil: 'روغن‌های فرابکر گیاهی',
                                      };
                                      const label = found ? found.name : (fallbackLabels[val] || val);
                                      setEditingProduct({
                                        ...editingProduct,
                                        category: val,
                                        categoryLabel: label
                                      });
                                    }
                                  }}
                                  className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                                >
                                  {formSettings.customCategories && formSettings.customCategories.length > 0 ? (
                                    formSettings.customCategories.map((cat) => (
                                      <option key={cat.id} value={cat.id}>
                                        {cat.icon || '🌿'} {cat.name}
                                      </option>
                                    ))
                                  ) : (
                                    <>
                                      <option value="organic">🌿 محصولات ارگانیک و طبیعی</option>
                                      <option value="tea">🍵 چای و دمنوش‌های گیاهی</option>
                                      <option value="herbal">🌸 عرقیات سنتی</option>
                                      <option value="spices">🧂 ادویه و چاشنی ناب</option>
                                      <option value="nuts">🥜 خشکبار و آجیل اعلا</option>
                                      <option value="oil">🫒 روغن‌های فرابکر گیاهی</option>
                                    </>
                                  )}
                                  <option value="__NEW__">➕ تایپ دسته‌بندی دلخواه جدید...</option>
                                </select>

                                {/* Direct custom category input if user wants something specific */}
                                <input
                                  type="text"
                                  value={editingProduct.categoryLabel || ''}
                                  onChange={(e) => {
                                    const text = e.target.value;
                                    const slug = text.trim().toLowerCase().replace(/\s+/g, '_') || 'cat';
                                    setEditingProduct({
                                      ...editingProduct,
                                      category: slug,
                                      categoryLabel: text
                                    });
                                  }}
                                  placeholder="یا عنوان دسته‌بندی دلخواه خود را بنویسید..."
                                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] text-gray-700"
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">وزن یا نوع بسته‌بندی</label>
                            <input
                              type="text"
                              value={editingProduct.weight || ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, weight: e.target.value })}
                              placeholder="مثلاً: بسته ۲۵۰ گرمی، ۱ کیلوگرم..."
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">قیمت فروش (تومان) *</label>
                            <input
                              type="number"
                              value={editingProduct.price !== undefined && editingProduct.price !== null ? editingProduct.price : ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                              required
                              placeholder="مثلاً: ۱۵۰،۰۰۰"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">قیمت اولیه / خط خورده (تومان)</label>
                            <input
                              type="number"
                              value={editingProduct.originalPrice || ''}
                              onChange={(e) => setEditingProduct({ ...editingProduct, originalPrice: e.target.value ? Number(e.target.value) : undefined })}
                              placeholder="جهت نمایش تخفیف"
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">موجودی انبار (تعداد)</label>
                            <input
                              type="number"
                              value={editingProduct.stock ?? 10}
                              onChange={(e) => setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">محل تولید / برداشت</label>
                            <input
                              type="text"
                              value={editingProduct.origin || 'ایران'}
                              onChange={(e) => setEditingProduct({ ...editingProduct, origin: e.target.value })}
                              placeholder="گیلان، سبلان، شیراز..."
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                        </div>

                        {/* Image picker & Upload */}
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-700">تصویر محصول (آپلود عکس، انتخاب از آرشیو یا آدرس اینترنتی)</label>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {editingProduct.image && (
                              <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-gray-300 flex-shrink-0 bg-gray-100">
                                <img src={editingProduct.image} alt="پیش‌نمایش" className="w-full h-full object-cover" />
                              </div>
                            )}

                            <label className="flex-1 border border-dashed border-[#D5C6AC] hover:border-[#163826] bg-[#FAF8F3] hover:bg-[#F2ECE0] px-3 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all text-xs font-bold text-[#163826]">
                              <Upload className="w-4 h-4" />
                              <span>{isUploadingProductImage ? 'در حال بهینه‌سازی عکس...' : 'آپلود عکس از گوشی یا سیستم'}</span>
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
                              placeholder="یا لینک تصویر اینترنتی..."
                              className="flex-1 bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono"
                            />
                          </div>

                          {/* Quick Preset Gallery */}
                          <div className="bg-[#FAF6EE] p-3 rounded-2xl border border-[#E8DEC9]">
                            <span className="text-[11px] font-bold text-[#A47922] block mb-2 flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5" />
                              انتخاب سریع از آرشیو تصاویر باکیفیت ناما:
                            </span>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                              {PRESET_IMAGE_OPTIONS.map((img, i) => (
                                <button
                                  type="button"
                                  key={i}
                                  onClick={() => setEditingProduct({ ...editingProduct, image: img.url })}
                                  className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer ${
                                    editingProduct.image === img.url ? 'border-[#D4A340] ring-2 ring-[#D4A340]' : 'border-gray-200 hover:border-gray-400'
                                  }`}
                                  title={img.name}
                                >
                                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] truncate px-1 text-center">
                                    {img.name.split(' ')[0]}
                                  </span>
                                </button>
                              ))}
                            </div>
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
                          <label className="block text-xs font-bold text-gray-700 mb-1">توضیحات کامل و خواص محصول</label>
                          <textarea
                            rows={3}
                            value={editingProduct.description || ''}
                            onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                            placeholder="معرفی محصول، اصالت، روش مصرف..."
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-5 text-xs text-gray-700 bg-[#FAF8F3] p-3 rounded-2xl border">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!editingProduct.isOrganic}
                              onChange={(e) => setEditingProduct({ ...editingProduct, isOrganic: e.target.checked })}
                              className="rounded text-[#231709]"
                            />
                            <span className="font-bold text-emerald-800">۱۰۰٪ ارگانیک و طبیعی</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!editingProduct.isFeatured}
                              onChange={(e) => setEditingProduct({ ...editingProduct, isFeatured: e.target.checked })}
                              className="rounded text-[#231709]"
                            />
                            <span className="font-bold text-[#A4781C]">محصول منتخب ویژه</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!editingProduct.isNewArrival}
                              onChange={(e) => setEditingProduct({ ...editingProduct, isNewArrival: e.target.checked })}
                              className="rounded text-[#231709]"
                            />
                            <span className="font-bold text-[#2F4E34]">آخرین محصولات اضافه شده</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer">
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
                            className="px-6 py-2.5 rounded-xl bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Save className="w-4 h-4 text-amber-300" />
                            <span>ذخیره محصول در کاتالوگ</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProduct(null)}
                            className="px-4 py-2.5 rounded-xl border text-xs font-semibold hover:bg-gray-100 cursor-pointer"
                          >
                            انصراف
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {productSuccessMessage && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in shadow-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>{productSuccessMessage}</span>
                    </div>
                  )}

                  {/* Products Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredProducts.map(p => (
                      <div key={p.id} className="bg-white p-3.5 rounded-2xl border border-[#E7DDC9] flex items-center gap-3 shadow-xs">
                        <img src={p.image} alt={p.name} className="w-16 h-16 rounded-xl object-cover border flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h5 className="font-bold text-xs text-[#231709] truncate">{p.name}</h5>
                            <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-medium">
                              {p.categoryLabel}
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-500 block">{p.weight}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-black text-[#231709] text-xs">
                              {p.price.toLocaleString('fa-IR')} تومان
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              (p.stock ?? 0) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              موجودی: {p.stock ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => {
                              setIsNewProduct(false);
                              setEditingProduct({ ...p });
                            }}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer"
                            title="ویرایش محصول"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDuplicateProduct(p)}
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 cursor-pointer"
                            title="تکثیر / کپی محصول"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmModal({
                                title: 'حذف محصول',
                                message: `آیا از حذف محصول «${p.name}» اطمینان دارید؟`,
                                confirmLabel: 'بله، حذف کن',
                                isDanger: true,
                                onConfirm: () => onDeleteProduct(p.id),
                              });
                            }}
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer"
                            title="حذف محصول"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: CATEGORIES MANAGEMENT (DYNAMIC CATEGORY FULL CRUD) */}
              {activeTab === 'categories' && (
                <div className="max-w-4xl space-y-6">
                  {/* Create category box (Create) */}
                  <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] shadow-xs space-y-4">
                    <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                      <FolderPlus className="w-4 h-4 text-[#D4A340]" />
                      <span>تعریف دسته‌بندی جدید (مثلاً: چای، دمنوش، ادویه، خشکبار و...)</span>
                    </h4>
                    <p className="text-xs text-[#6B5A4B] leading-relaxed">
                      ابتدا دسته‌بندی دلخواه خود را ایجاد کرده و سپس محصولات مربوطه را ذیل آن قرار دهید.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">آیکون</label>
                        <select
                          value={newCategoryIcon}
                          onChange={(e) => setNewCategoryIcon(e.target.value)}
                          className="w-full bg-[#FAF8F3] border rounded-xl px-2 py-2 text-sm text-center"
                        >
                          <option value="🍵">🍵 چای</option>
                          <option value="🌿">🌿 دمنوش</option>
                          <option value="🍯">🍯 عسل</option>
                          <option value="🌴">🌴 خرما</option>
                          <option value="🥣">🥣 شیره</option>
                          <option value="✨">✨ زعفران</option>
                          <option value="🫒">🫒 روغن</option>
                          <option value="🌰">🌰 خشکبار</option>
                          <option value="☕">☕ قهوه</option>
                          <option value="🍃">🍃 ارگانیک</option>
                          <option value="🫐">🫐 زرشک</option>
                          <option value="🌾">🌾 غلات</option>
                        </select>
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-xs font-bold text-gray-700 mb-1">نام دسته‌بندی *</label>
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="مثلاً: چای"
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-xs font-bold text-gray-700 mb-1">توضیح کوتاه</label>
                        <input
                          type="text"
                          value={newCategoryDesc}
                          onChange={(e) => setNewCategoryDesc(e.target.value)}
                          placeholder="مثلاً: انواع چای‌های میوه‌ای و سنتی"
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!newCategoryName.trim()) return;
                            handleAddNewCategory(newCategoryName, newCategoryIcon, newCategoryDesc);
                            setNewCategoryName('');
                            setNewCategoryDesc('');
                          }}
                          disabled={!newCategoryName.trim()}
                          className="w-full py-2.5 px-3 bg-[#231709] hover:bg-[#150D05] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-amber-300" />
                          <span>افزودن دسته</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* List of Defined Categories (Read, Update, Delete) */}
                  <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <Tag className="w-4 h-4 text-[#A47922]" />
                        <span>دسته‌بندی‌های فعال فروشگاه ({formSettings.customCategories?.length || 0})</span>
                      </h4>
                      <span className="text-[11px] text-gray-500">
                        امکان ویرایش نام، آیکون و حذف در لحظه
                      </span>
                    </div>

                    {(!formSettings.customCategories || formSettings.customCategories.length === 0) ? (
                      <div className="py-8 text-center text-gray-500 text-xs">
                        هنوز دسته‌بندی‌ای ثبت نشده است. از کادر بالا دسته‌بندی جدید (مثلاً چای) را اضافه نمایید.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {formSettings.customCategories.map((cat) => {
                          const catProductsCount = products.filter(p => p.category === cat.id || p.categoryLabel === cat.name).length;
                          return (
                            <div key={cat.id} className="p-3.5 rounded-2xl bg-[#FAF8F3] border border-[#E7DDC9] flex items-center justify-between gap-3 shadow-xs">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-2xl flex-shrink-0">{cat.icon || '🍵'}</span>
                                <div className="min-w-0">
                                  <h5 className="font-bold text-xs text-[#231709] truncate">{cat.name}</h5>
                                  <span className="text-[10px] text-gray-500 block truncate">
                                    {cat.description || 'بدون توضیح'}
                                  </span>
                                  <span className="text-[10px] text-[#A47922] font-bold">
                                    {catProductsCount} محصول مرتبط
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                {/* Edit Category Button */}
                                  <button
                                    type="button"
                                    onClick={() => setEditingCategoryModal({ id: cat.id, name: cat.name, icon: cat.icon || '🏷️', description: cat.description })}
                                    className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs cursor-pointer"
                                    title="ویرایش دسته‌بندی"
                                  >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                {/* Quick Add Product to this Category */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsNewProduct(true);
                                    setEditingProduct({
                                      name: '',
                                      category: cat.id,
                                      categoryLabel: cat.name,
                                      price: 180000,
                                      weight: 'بسته ۲۵۰ گرمی',
                                      stock: 20,
                                      isOrganic: true,
                                      isFeatured: true,
                                      image: PRESET_IMAGE_OPTIONS[0].url,
                                    });
                                    setActiveTab('products');
                                  }}
                                  className="p-1.5 rounded-lg bg-white hover:bg-gray-100 text-gray-700 border text-xs cursor-pointer"
                                  title="افزودن محصول جدید به این دسته"
                                >
                                  <Plus className="w-3.5 h-3.5 text-[#231709]" />
                                </button>

                                {/* Delete Category */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(cat.id)}
                                  className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer"
                                  title="حذف دسته‌بندی"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: DISCOUNT CODES */}
              {activeTab === 'discounts' && (
                <div className="max-w-4xl space-y-6">
                  {/* Create Discount Code */}
                  <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] shadow-xs space-y-4">
                    <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                      <Percent className="w-4 h-4 text-emerald-600" />
                      <span>ایجاد کد تخفیف جدید</span>
                    </h4>

                    <form onSubmit={handleAddDiscountCode} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-gray-700 mb-1">کد کوپن (انگلیسی) *</label>
                        <input
                          type="text"
                          dir="ltr"
                          value={newDiscountCode}
                          onChange={(e) => setNewDiscountCode(e.target.value.toUpperCase())}
                          placeholder="مثلاً: BAHAR10"
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono font-bold text-center"
                          required
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">نوع تخفیف</label>
                        <select
                          value={newDiscountType}
                          onChange={(e) => setNewDiscountType(e.target.value as any)}
                          className="w-full bg-[#FAF8F3] border rounded-xl px-2 py-2 text-xs font-bold"
                        >
                          <option value="percent">درصدی (%)</option>
                          <option value="fixed">مبلغ ثابت (تومان)</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          {newDiscountType === 'percent' ? 'درصد تخفیف' : 'مبلغ (تومان)'}
                        </label>
                        <input
                          type="number"
                          value={newDiscountAmount}
                          onChange={(e) => setNewDiscountAmount(Number(e.target.value))}
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                          required
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-gray-700 mb-1">حداقل خرید (تومان)</label>
                        <input
                          type="number"
                          value={newDiscountMinPurchase}
                          onChange={(e) => setNewDiscountMinPurchase(Number(e.target.value))}
                          placeholder="۰ یعنی بدون شرط"
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <button
                          type="submit"
                          className="w-full py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>ثبت کد</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Discount Codes Table */}
                  <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] shadow-xs space-y-3">
                    <h4 className="font-black text-[#231709] text-sm">لیست کدهای تخفیف</h4>
                    {(!formSettings.discountCodes || formSettings.discountCodes.length === 0) ? (
                      <div className="text-center py-8 text-xs text-gray-500">
                        هنوز کد تخفیفی تعریف نشده است.
                      </div>
                    ) : (
                      <div className="divide-y text-xs">
                        {formSettings.discountCodes.map((d) => (
                          <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-sm bg-gray-100 px-2.5 py-1 rounded-lg border">
                                {d.code}
                              </span>
                              <span className="font-bold text-[#231709]">
                                {d.type === 'percent' ? `${d.amount}٪ تخفیف` : `${d.amount.toLocaleString('fa-IR')} تومان تخفیف`}
                              </span>
                              {d.minPurchase ? (
                                <span className="text-gray-500 text-[11px]">
                                  (حداقل خرید: {d.minPurchase.toLocaleString('fa-IR')} تومان)
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleDiscountCode(d.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                                  d.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {d.isActive ? 'فعال' : 'غیرفعال'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDiscountCode(d.id)}
                                className="p-1 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: CUSTOMERS CRM */}
              {activeTab === 'customers' && (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-3xl border border-[#E7DDC9] flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-[#231709] text-base">دفترچه تلفن و باشگاه مشتریان ({customersList.length})</h4>
                      <p className="text-xs text-gray-500 mt-0.5">مشتریان استخراج شده از روی سفارشات ثبت شده</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-[#E7DDC9] overflow-hidden shadow-xs divide-y">
                    {customersList.length === 0 ? (
                      <div className="p-12 text-center text-xs text-gray-500">
                        هنوز سفارشی برای استخراج اطلاعات مشتری ثبت نشده است.
                      </div>
                    ) : (
                      customersList.map((cust, i) => {
                        const cleanPh = cust.phone.replace(/[\s-]/g, '');
                        return (
                          <div key={i} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-[#FAF3E3] border border-[#E3CE9B] flex items-center justify-center font-bold text-[#231709]">
                                {cust.name.slice(0, 1)}
                              </div>
                              <div>
                                <span className="font-black text-sm text-[#231709] block">{cust.name}</span>
                                <span className="text-gray-500 font-mono" dir="ltr">{cust.phone}</span>
                                <span className="text-gray-600 block mt-0.5 text-[11px]">{cust.province}، {cust.city}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <span className="text-gray-500 text-[11px] block">{cust.ordersCount} سفارش</span>
                                <span className="font-black text-emerald-800 text-xs">
                                  مجموع خرید: {cust.totalSpent.toLocaleString('fa-IR')} تومان
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`https://wa.me/${cleanPh.startsWith('0') ? '98' + cleanPh.slice(1) : cleanPh}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>واتساپ</span>
                                </a>

                                <a
                                  href={`tel:${cust.phone}`}
                                  className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold flex items-center gap-1"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                  <span>تماس</span>
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 7: CMS / SITE TEXTS */}
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
                        <label className="block text-xs font-bold text-gray-700 mb-1">متن نوار اعلامیه بالای صفحه</label>
                        <input
                          type="text"
                          value={formSettings.announcement}
                          onChange={(e) => setFormSettings({ ...formSettings, announcement: e.target.value })}
                          className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                    </div>

                    {/* Hero Section */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <Type className="w-4 h-4 text-[#231709]" />
                        <span>متون بخش بالایی صفحه اصلی (Hero)</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">برچسب سبز بالای تیتر</label>
                          <input
                            type="text"
                            value={formSettings.heroBadge || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, heroBadge: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">تیتر اصلی هیرو</label>
                          <input
                            type="text"
                            value={formSettings.heroTitle || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, heroTitle: e.target.value })}
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-black"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">متن توضیحات هیرو</label>
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
                    </div>

                    {/* Quality Badges */}
                    <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                      <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#2F4E34]" />
                        <span>نشان‌های چهارگانه ضمانت و کیفیت</span>
                      </h4>

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

                    <button
                      type="submit"
                      className="w-full py-3.5 rounded-2xl bg-[#D4A340] hover:bg-[#B8860B] text-[#231709] font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Save className="w-4 h-4 text-[#231709]" />
                      <span>ذخیره تمامی تغییرات متون سایت</span>
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 8: FULL STORE SETTINGS CRUD */}
              {activeTab === 'settings' && (
                <div className="max-w-4xl space-y-6">
                  {saveSuccessMessage && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>تنظیمات فروشگاه با موفقیت در دیتابیس بروزرسانی شد.</span>
                    </div>
                  )}

                    {/* Settings Sub-navigation Bar */}
                    <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-[#E7DDC9]">
                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('general')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'general' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        عمومی و وضعیت فروشگاه
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('zarinpal')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'zarinpal' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        درگاه زرین‌پال
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('banking')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'banking' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        کارت بانکی و شبا
                      </button>


                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('shipping')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'shipping' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        هزینه‌ها و ارسال پستی
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('contact')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'contact' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        واتساپ و شبکه‌های اجتماعی
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('notifications')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'notifications' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        اعلان‌های ntfy
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('deployment')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'deployment' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        هاست، دامنه و خروجی کد
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('security')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'security' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        تغییر رمز عبور
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsActiveSubTab('backup')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          settingsActiveSubTab === 'backup' ? 'bg-[#231709] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        پشتیبان‌گیری و بازنشانی
                      </button>
                    </div>

                  <form onSubmit={handleSaveSettingsSubmit} className="space-y-6">
                    {/* SUB-TAB 1: GENERAL & STORE STATUS */}
                    {settingsActiveSubTab === 'general' && (
                      <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                        <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                          <Store className="w-4 h-4 text-[#D4A340]" />
                          <span>اطلاعات پایه و وضعیت کاری فروشگاه</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">نام رسمی فروشگاه</label>
                            <input
                              type="text"
                              value={formSettings.storeName}
                              onChange={(e) => setFormSettings({ ...formSettings, storeName: e.target.value })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">شعار برند</label>
                            <input
                              type="text"
                              value={formSettings.slogan}
                              onChange={(e) => setFormSettings({ ...formSettings, slogan: e.target.value })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold text-[#A47922]"
                            />
                          </div>
                        </div>

                        {/* Store Open/Close Toggle */}
                        <div className="bg-[#FAF8F3] p-4 rounded-2xl border border-[#E8DEC9] space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-bold text-xs text-[#231709] block">وضعیت پذیرش سفارشات فروشگاه</span>
                              <span className="text-[11px] text-gray-500">
                                {formSettings.isStoreOpen ? 'فروشگاه باز است و مشتریان می‌توانند سفارش ثبت کنند.' : 'فروشگاه موقتاً بسته است و دکمه پرداخت غیرفعال می‌شود.'}
                              </span>
                            </div>

                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formSettings.isStoreOpen}
                                onChange={(e) => setFormSettings({ ...formSettings, isStoreOpen: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                          </div>

                          {!formSettings.isStoreOpen && (
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">پیام بسته بودن به مشتریان</label>
                              <input
                                type="text"
                                value={formSettings.storeClosedMessage || ''}
                                onChange={(e) => setFormSettings({ ...formSettings, storeClosedMessage: e.target.value })}
                                placeholder="فروشگاه موقتاً به دلیل انبارگردانی بسته است؛ ثبت سفارش از فردا آغاز می‌شود."
                                className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB: ZARINPAL PAYMENT GATEWAY */}
                    {settingsActiveSubTab === 'zarinpal' && (
                      <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-5">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                          <div>
                            <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                              <span className="w-5 h-5 rounded-lg bg-[#D4A340] text-[#231709] flex items-center justify-center font-bold text-xs">ZP</span>
                              <span>تنظیمات درگاه پرداخت اینترنتی زرین‌پال (ZarinPal)</span>
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                              اتصال مستقیم به شبکه شاپرک با پشتیبانی از تمامی کارت‌های عضو شتاب
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formSettings.zarinpalEnabled !== false}
                                onChange={(e) => setFormSettings({ ...formSettings, zarinpalEnabled: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                            <span className="text-xs font-bold text-gray-700">
                              {formSettings.zarinpalEnabled !== false ? 'فعال در تسویه‌حساب' : 'غیرفعال'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                              کد مرچنت زرین‌پال (Merchant ID)
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              value={formSettings.zarinpalMerchantId || ''}
                              onChange={(e) => setFormSettings({ ...formSettings, zarinpalMerchantId: e.target.value.trim() })}
                              placeholder="مثال: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-left"
                            />
                            <p className="text-[11px] text-gray-500 mt-1">
                              کد ۳۶ کاراکتری که پس از ثبت‌نام و فعال‌سازی درگاه در وب‌سایت zarinpal.com دریافت می‌کنید.
                            </p>
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
                            <div>
                              <span className="text-xs font-bold text-gray-700 block">حالت تستی و آزمایشی (سندباکس / Sandbox)</span>
                              <span className="text-[11px] text-gray-500">برای آزمایش کامل تراکنش‌ها قبل از دریافت درگاه رسمی</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formSettings.zarinpalSandbox || false}
                                onChange={(e) => setFormSettings({ ...formSettings, zarinpalSandbox: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                            </label>
                          </div>

                          <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-2">
                            <div className="font-bold flex items-center gap-1.5 text-amber-800">
                              <CheckCircle2 className="w-4 h-4 text-[#D4A340]" />
                              <span>وضعیت درگاه زرین‌پال در سایت:</span>
                            </div>
                            <p className="leading-relaxed text-[11px]">
                              درگاه به طور کامل پیاده‌سازی شده و خریداران می‌توانند هم از طریق زرین‌پال و هم از طریق کارت‌به‌کارت پرداخت را انجام دهند. مبالغ مستقیماً به حساب بانکی متصل به مرچنت شما در زرین‌پال واریز می‌گردد.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 2: BANK & PAYMENT */}
                    {settingsActiveSubTab === 'banking' && (
                      <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                        <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-[#D4A340]" />
                          <span>اطلاعات کارت بانکی فروشگاه (جهت واریز کارت به کارت مشتریان)</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-bold text-gray-700">شماره کارت ۱۶ رقمی *</label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (formSettings.cardNumber) {
                                    navigator.clipboard.writeText(formSettings.cardNumber.replace(/\s|-/g, ''));
                                    setCopiedCardStatus(true);
                                    setTimeout(() => setCopiedCardStatus(false), 2000);
                                  }
                                }}
                                className="text-[11px] text-[#A47922] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                <span>{copiedCardStatus ? 'کپی شد!' : 'کپی شماره'}</span>
                              </button>
                            </div>
                            <input
                              type="text"
                              dir="ltr"
                              value={formSettings.cardNumber || ''}
                              onChange={(e) => setFormSettings({ ...formSettings, cardNumber: e.target.value })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center font-bold"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">نام و نام خانوادگی صاحب حساب *</label>
                            <input
                              type="text"
                              value={formSettings.cardHolder || ''}
                              onChange={(e) => setFormSettings({ ...formSettings, cardHolder: e.target.value })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                              required
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">نام بانک عامل</label>
                            <input
                              type="text"
                              value={formSettings.bankName || ''}
                              onChange={(e) => setFormSettings({ ...formSettings, bankName: e.target.value })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">شماره شبا (IBAN با پیشوند IR)</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={formSettings.shabaNumber || ''}
                              onChange={(e) => setFormSettings({ ...formSettings, shabaNumber: e.target.value })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 3: SHIPPING */}
                    {settingsActiveSubTab === 'shipping' && (
                      <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                        <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                          <Truck className="w-4 h-4 text-[#2F4E34]" />
                          <span>هزینه‌ها و قوانین ارسال پستی</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">هزینه ارسال پیش‌فرض پستی (تومان)</label>
                            <input
                              type="number"
                              value={formSettings.shippingCost}
                              onChange={(e) => setFormSettings({ ...formSettings, shippingCost: Number(e.target.value) })}
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">روش ارسال سراسری</label>
                            <input
                              type="text"
                              disabled
                              value="پست پیشتاز جمهوری اسلامی ایران"
                              className="w-full bg-gray-100 border rounded-xl px-3 py-2 text-xs font-bold text-gray-600"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">توضیحات و زمان‌بندی ارسال مرسوله</label>
                          <input
                            type="text"
                            value={formSettings.shippingNote || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, shippingNote: e.target.value })}
                            placeholder="مثلاً: ارسال به سراسر کشور ظرف ۲ الی ۴ روز کاری با پست پیشتاز در بسته‌بندی ایمن"
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 4: CONTACT & SOCIALS */}
                    {settingsActiveSubTab === 'contact' && (
                      <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                        <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-emerald-600" />
                          <span>اطلاعات تماس، واتساپ و اینستاگرام</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">شماره تماس مستقیم و واتساپ</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={formSettings.supportPhone}
                              onChange={(e) => setFormSettings({ ...formSettings, supportPhone: e.target.value, supportWhatsApp: e.target.value })}
                              placeholder="+98 916 644 9409"
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">شناسه اینستاگرام رسمی (بدون @)</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={formSettings.supportInstagram}
                              onChange={(e) => setFormSettings({ ...formSettings, supportInstagram: e.target.value })}
                              placeholder="namafoods_"
                              className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center font-bold text-pink-700"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">نشانی پستی فروشگاه مرکزی</label>
                          <input
                            type="text"
                            value={formSettings.supportAddress || ''}
                            onChange={(e) => setFormSettings({ ...formSettings, supportAddress: e.target.value })}
                            placeholder="دفتر و فروشگاه مرکزی ناما فود..."
                            className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB: NOTIFICATIONS (100% Free ntfy) */}
                    {settingsActiveSubTab === 'notifications' && (
                      <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                        <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                          <BellRing className="w-4 h-4 text-[#D4A340]" />
                          <span>تنظیم اعلان فوری سفارشات روی گوشی با ntfy</span>
                        </h4>

                        <p className="text-xs text-gray-600 leading-relaxed">
                          با وارد کردن تاپیک دلخواه خود در نرم‌افزار ntfy گوشی، به محض ثبت سفارش توسط مشتری، تلفن همراه شما زنگ خورده و مشخصات سفارش ظاهر می‌گردد.
                        </p>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            dir="ltr"
                            value={formSettings.ntfyTopic}
                            onChange={(e) => setFormSettings({ ...formSettings, ntfyTopic: e.target.value })}
                            className="flex-1 bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono font-bold"
                            required
                          />
                          <button
                            type="button"
                            onClick={handleTestNtfy}
                            disabled={isTestingNtfy}
                            className="px-4 py-2 bg-[#D4A340] hover:bg-[#B8860B] text-[#231709] rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer"
                          >
                            ارسال اعلان تست
                          </button>
                        </div>

                        {ntfyTestStatus && (
                          <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                            {ntfyTestStatus}
                          </div>
                        )}
                      </div>
                    )}

                    {/* SUB-TAB: DEPLOYMENT, HOST, DOMAIN & PROJECT EXPORT */}
                    {settingsActiveSubTab === 'deployment' && (
                      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E7DDC9] space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                          <div>
                            <h4 className="font-black text-[#231709] text-base flex items-center gap-2">
                              <Globe className="w-5 h-5 text-[#2F4E34]" />
                              <span>راهنمای جامع اتصال هاست، دامنه و خروجی گرفتن از کدها</span>
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                              بدون هیچ تغییری در ظاهر یا کدهای سایت، می‌توانید وب‌سایت ناما فود را روی هاست شخصی با دامنه دلخواه خود (مانند namafoods.ir) آنلاین کنید.
                            </p>
                          </div>
                        </div>

                        {/* Step 1: Export & Instant ZIP Downloads */}
                        <div className="bg-[#FAF8F3] p-4 sm:p-5 rounded-2xl border border-[#EADFCB] space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm text-[#231709] flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-[#163826] text-white text-xs flex items-center justify-center font-bold">۱</span>
                              <span>دانلود مستقیم خروجی و سورس‌کد (۱ کلیک - بدون نیاز به کدنویسی)</span>
                            </span>
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-amber-300">
                              فایل‌های فشرده آماده
                            </span>
                          </div>
                          <div className="bg-[#FAF7F0] p-3.5 rounded-2xl border border-[#231709]/10 space-y-2 text-xs text-gray-700">
                            <p className="font-bold text-[#163826] flex items-center gap-1.5">
                              <Download className="w-4 h-4 text-[#D4A340]" />
                              نحوه دریافت مستقیم فایل‌های پروژه:
                            </p>
                            <p className="leading-relaxed">
                              از بالای صفحه محیط AI Studio روی آیکون <strong>Export / Download Code</strong> کلیک کنید تا کل کدهای تر و تمیز بدون فایل‌های اضافه برای شما دانلود شود. همچنین با دستور زیر در کامپیوتر یا سرور خود پوشه خروجی <code>dist</code> را برای استقرار نهایی بسازید:
                            </p>
                          </div>

                          <div className="flex items-center justify-between bg-[#1E1710] text-[#E8C574] p-3 rounded-xl font-mono text-xs" dir="ltr">
                            <code>npm run build</code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText('npm run build');
                                setCopiedDeploySnippet('build');
                                setTimeout(() => setCopiedDeploySnippet(null), 2000);
                              }}
                              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[11px] font-sans flex items-center gap-1 transition-all cursor-pointer text-white"
                            >
                              {copiedDeploySnippet === 'build' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedDeploySnippet === 'build' ? 'کپی شد' : 'کپی دستور'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Step 2: Cloudflare Pages (100% Free Forever - Recommended) */}
                        <div className="bg-[#FFF8F0] p-4 sm:p-5 rounded-2xl border border-amber-300/80 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm text-[#9A4E08] flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-[#E5781E] text-white text-xs flex items-center justify-center font-bold">۲</span>
                              <span>کلودفلر پیجز (Cloudflare Pages) [پیشنهاد شماره ۱ - ۱۰۰٪ رایگان و نامحدود]</span>
                            </span>
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-lg border border-amber-300">
                              بهترین ضدتحریم و بدون فیلتر
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            کلودفلر بدون محدودیت پهنای باند و کاملاً رایگان است و لینک اختصاصی فوری به شما می‌دهد:
                          </p>
                          <ol className="text-xs text-gray-700 space-y-2 list-decimal list-inside pr-1">
                            <li>وارد سایت <a href="https://pages.cloudflare.com" target="_blank" rel="noreferrer" className="text-amber-800 font-bold underline inline-flex items-center gap-1">pages.cloudflare.com <ExternalLink className="w-3 h-3" /></a> شوید و یک اکانت رایگان بسازید.</li>
                            <li>روی گزینه <strong>Create an application</strong> و سپس تب <strong>Pages</strong> کلیک کنید.</li>
                            <li>گزینه <strong>Upload assets</strong> یا <strong>Direct Upload</strong> را بزنید و محتویات پوشه <code>dist</code> را داخل آن بیندازید (Drag & Drop).</li>
                            <li>بلافاصله یک لینک عمومی و همیشگی مانند <code>https://namafoods.pages.dev</code> دریافت می‌کنید که روی تمام گوشی‌ها باز می‌شود!</li>
                          </ol>
                        </div>

                        {/* Step 3: Vercel (100% Free) */}
                        <div className="bg-[#F8F9FA] p-4 sm:p-5 rounded-2xl border border-gray-300 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm text-[#231709] flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center font-bold">۳</span>
                              <span>ورسل (Vercel - vercel.com) [پیشنهاد شماره ۲ - ۱۰۰٪ رایگان]</span>
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            یکی از محبوب‌ترین پلتفرم‌های ابری برای پروژه‌های React در سراسر دنیا:
                          </p>
                          <ol className="text-xs text-gray-700 space-y-2 list-decimal list-inside pr-1">
                            <li>وارد <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-black font-bold underline inline-flex items-center gap-1">vercel.com <ExternalLink className="w-3 h-3" /></a> شوید و با اکانت GitHub رایگان وارد شوید.</li>
                            <li>سورس‌کد پروژه (فایل source.zip) را در مخزن گیت‌هاب قرار داده یا با دستور <code>npx vercel</code> در ترمینال مستقر کنید.</li>
                            <li>یک لینک عمومی رایگان مانند <code>https://namafoods.vercel.app</code> به شما اختصاص می‌یابد.</li>
                          </ol>
                        </div>

                        {/* Step 4: Liara Hosting (Best for .ir domains and Iran ping) */}
                        <div className="bg-[#F0F7F2] p-4 sm:p-5 rounded-2xl border border-emerald-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm text-[#163826] flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs flex items-center justify-center font-bold">۴</span>
                              <span>استقرار روی هاست ابری ایرانی (لیارا - Liara.ir) [برای دامنه .ir و پینگ ایران]</span>
                            </span>
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-emerald-300">
                              سرور داخل کشور
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            اگر می‌خواهید سرورها داخل ایران باشند و دامنه ملی <strong>.ir</strong> متصل کنید:
                          </p>
                          <ol className="text-xs text-gray-700 space-y-2 list-decimal list-inside pr-1">
                            <li>در <a href="https://liara.ir" target="_blank" rel="noreferrer" className="text-emerald-700 font-bold underline inline-flex items-center gap-1">liara.ir <ExternalLink className="w-3 h-3" /></a> ثبت‌نام کنید.</li>
                            <li>یک برنامه از نوع <strong>React</strong> یا <strong>Static Platform</strong> با نام دلخواه بسازید.</li>
                            <li>پوشه پروژه را با نرم‌افزار Liara Desktop یا دستور <code>liara deploy</code> آپلود کنید.</li>
                          </ol>
                        </div>

                        {/* Step 5: Traditional cPanel / DirectAdmin */}
                        <div className="bg-[#FAF8F3] p-4 sm:p-5 rounded-2xl border border-[#EADFCB] space-y-3">
                          <span className="font-black text-sm text-[#231709] flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#A47922] text-white text-xs flex items-center justify-center font-bold">۵</span>
                            <span>استقرار روی هاست معمولی لینوکس (cPanel / DirectAdmin)</span>
                          </span>
                          <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside pr-1">
                            <li>فایل <code>nama-foods-dist.zip</code> را از دکمه بالا دانلود کنید.</li>
                            <li>وارد کنترل‌پنل هاست خود شوید، به بخش <strong>File Manager</strong> و سپس پوشه <strong>public_html</strong> بروید.</li>
                            <li>فایل ZIP را در <code>public_html</code> آپلود و سپس Extract کنید. سایت شما بلافاصله در دامنه اصلی فعال می‌شود.</li>
                          </ol>
                        </div>

                        {/* Step 4: Connecting Custom Domain */}
                        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 space-y-3">
                          <span className="font-black text-sm text-[#231709] flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#231709] text-white text-xs flex items-center justify-center font-bold">۴</span>
                            <span>تنظیم دامنه اختصاصی (مثلاً namafoods.ir یا namafood.com)</span>
                          </span>
                          <ul className="text-xs text-gray-600 space-y-2 pr-1">
                            <li className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                              <span>دامنه خود را از ایرنیک (nic.ir) یا شرکت‌های هاستینگ معتبر (ایران‌سرور، سون‌هاست و...) خریداری کنید.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                              <span>نیم‌سرورهای (DNS NameServers) هاست خریداری‌شده را در پنل دامنه خود ست کنید.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                              <span>گواهی امنیتی SSL رایگان (Let's Encrypt) را در کنترل‌پنل هاست با ۱ کلیک فعال کنید تا آدرس سایت با https باز شود.</span>
                            </li>
                          </ul>
                        </div>

                        {/* Step 5: Cloud Firebase Database Status */}
                        <div className="bg-amber-500/10 p-4 sm:p-5 rounded-2xl border border-amber-500/30 space-y-2">
                          <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                            <Sparkles className="w-4 h-4 text-[#D4A340]" />
                            <span>دیتابیس ابری زنده و بدون نیاز به هاست جداگانه:</span>
                          </div>
                          <p className="text-xs text-amber-950 leading-relaxed">
                            این فروشگاه به دیتابیس ابری بلادرنگ متصل است؛ یعنی هر محصولی که در پنل مدیریت از روی گوشی خود اضافه یا حذف کنید یا هر سفارشی که ثبت شود، به صورت لحظه‌ای و خودکار در دیتابیس ذخیره شده و روی تمام گوشی‌های دیگر در هر کجای دنیا همزمان به‌روزرسانی خواهد شد.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 6: SECURITY / PASSWORDS */}
                    {settingsActiveSubTab === 'security' && (
                      <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] space-y-4">
                        <h4 className="font-black text-[#231709] text-sm flex items-center gap-2">
                          <Lock className="w-4 h-4 text-[#A47922]" />
                          <span>تغییر رمز عبور مدیریت</span>
                        </h4>

                        {passwordChangeMessage && (
                          <div className={`p-2.5 rounded-xl text-xs font-bold border ${
                            passwordChangeMessage.isError ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {passwordChangeMessage.text}
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">رمز عبور فعلی</label>
                              <input
                                type="password"
                                dir="ltr"
                                value={oldPasswordInput}
                                onChange={(e) => setOldPasswordInput(e.target.value)}
                                className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">رمز عبور جدید</label>
                              <input
                                type="password"
                                dir="ltr"
                                value={newPasswordInput}
                                onChange={(e) => setNewPasswordInput(e.target.value)}
                                className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">تکرار رمز عبور جدید</label>
                              <input
                                type="password"
                                dir="ltr"
                                value={confirmNewPasswordInput}
                                onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                                className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-mono text-center"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handlePasswordChange}
                            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                          >
                            بروزرسانی رمز عبور
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 7: BACKUP & FACTORY RESET */}
                    {settingsActiveSubTab === 'backup' && (
                      <div className="space-y-4">
                        <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] flex items-center justify-between">
                          <div>
                            <h4 className="font-black text-sm text-[#231709]">دانلود فایل نسخه پشتیبان (JSON)</h4>
                            <p className="text-xs text-gray-500 mt-0.5">پشتیبان‌گیری کامل از کلیه دسته‌ها، کالاها، سفارشات و تنظیمات</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleExportBackup}
                            className="px-4 py-2.5 bg-[#231709] hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>دانلود فایل پشتیبان</span>
                          </button>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-[#E7DDC9] flex items-center justify-between">
                          <div>
                            <h4 className="font-black text-sm text-[#231709]">بازیابی از فایل پشتیبان (Restore)</h4>
                            <p className="text-xs text-gray-500 mt-0.5">بارگذاری فایل JSON جهت بازگردانی اطلاعات فروشگاه</p>
                          </div>
                          <label className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border">
                            <Upload className="w-3.5 h-3.5" />
                            <span>انتخاب فایل و بازیابی</span>
                            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
                          </label>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-red-200 flex items-center justify-between">
                          <div>
                            <h4 className="font-black text-sm text-red-700">بازنشانی تنظیمات به مقادیر اولیه</h4>
                            <p className="text-xs text-gray-500 mt-0.5">بازگردانی تنظیمات به پیش‌فرض اصلی ناما فود</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleResetSettingsToDefault}
                            className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>بازنشانی پیش‌فرض</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Universal Save Button */}
                    <button
                      type="submit"
                      className="w-full py-3.5 rounded-2xl bg-[#231709] hover:bg-[#150D05] text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Save className="w-4 h-4 text-amber-300" />
                      <span>ذخیره تمامی تنظیمات فروشگاه در دیتابیس</span>
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>
        )}

        {/* EDIT CATEGORY MODAL (Part of Category CRUD) */}
        {editingCategoryModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full text-right shadow-2xl border border-[#E4D7C2] space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h4 className="font-black text-[#231709] text-sm flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-[#A47922]" />
                  <span>ویرایش دسته‌بندی: {editingCategoryModal.name}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setEditingCategoryModal(null)}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateCategorySave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">آیکون / اموجی</label>
                  <select
                    value={editingCategoryModal.icon}
                    onChange={(e) => setEditingCategoryModal({ ...editingCategoryModal, icon: e.target.value })}
                    className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-sm text-center"
                  >
                    <option value="🍵">🍵 چای</option>
                    <option value="🌿">🌿 دمنوش</option>
                    <option value="🍯">🍯 عسل</option>
                    <option value="🌴">🌴 خرما</option>
                    <option value="🥣">🥣 شیره</option>
                    <option value="✨">✨ زعفران</option>
                    <option value="🫒">🫒 روغن</option>
                    <option value="🌰">🌰 خشکبار</option>
                    <option value="☕">☕ قهوه</option>
                    <option value="🍃">🍃 ارگانیک</option>
                    <option value="🫐">🫐 زرشک</option>
                    <option value="🌾">🌾 غلات</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">نام دسته‌بندی *</label>
                  <input
                    type="text"
                    value={editingCategoryModal.name}
                    onChange={(e) => setEditingCategoryModal({ ...editingCategoryModal, name: e.target.value })}
                    className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">توضیح کوتاه</label>
                  <input
                    type="text"
                    value={editingCategoryModal.description || ''}
                    onChange={(e) => setEditingCategoryModal({ ...editingCategoryModal, description: e.target.value })}
                    className="w-full bg-[#FAF8F3] border rounded-xl px-3 py-2 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    ذخیره تغییرات دسته
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCategoryModal(null)}
                    className="py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all cursor-pointer"
                  >
                    انصراف
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* INVOICE MODAL / PRINT */}
        {invoiceOrder && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full text-right space-y-4 border border-[#E4D7C2]">
              <div className="flex items-center justify-between pb-3 border-b">
                <div>
                  <h4 className="font-black text-[#231709] text-base">پیش‌فاکتور رسمی فروشگاه ناما</h4>
                  <span className="text-xs text-gray-500 font-mono">شناسه فاکتور: {invoiceOrder.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer"
                    title="پرینت فاکتور"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setInvoiceOrder(null)}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer"
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

        {/* RECEIPT IMAGE LIGHTBOX */}
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
                  className="px-5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  بستن پیش‌نمایش
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRMATION MODAL */}
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
