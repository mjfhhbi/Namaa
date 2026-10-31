import React, { useState, useEffect, useRef } from 'react';
import { 
  Product, 
  Order, 
  StoreSettings, 
  CartItem, 
  ProductCategory, 
  OrderStatus 
} from './types';
import { 
  fetchProducts, 
  fetchOrders, 
  fetchStoreSettings, 
  createOrder, 
  updateOrderStatus, 
  deleteOrder,
  clearAllOrders,
  saveProduct, 
  deleteProduct, 
  clearAllProducts, 
  resetSampleProducts, 
  updateStoreSettings,
  subscribeToProducts,
  subscribeToOrders,
  subscribeToSettings
} from './services/storeService';
import { testFirestoreConnection, auth, onAuthStateChanged, signOut } from './firebase';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { CategoryShowcase } from './components/CategoryShowcase';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { AdminModal } from './components/AdminModal';
import { AdminLoginDialog } from './components/AdminLoginDialog';
import { Footer } from './components/Footer';
import { WhatsAppButton } from './components/WhatsAppButton';
import { IntroSplash } from './components/IntroSplash';
import { DEFAULT_STORE_SETTINGS, AUTHENTIC_DEFAULT_PRODUCTS } from './types';
import { 
  SlidersHorizontal, 
  Sparkles, 
  Leaf, 
  Filter, 
  Plus, 
  KeyRound,
  CheckCircle2,
  ShoppingBag
} from 'lucide-react';

export default function App() {
  const [products, setProducts] = useState<Product[]>(AUTHENTIC_DEFAULT_PRODUCTS);
  // Local caching in SessionStorage for instantaneous display without UI flickering
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const cached = sessionStorage.getItem('nama_cached_orders_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('SessionStorage cached orders parse error:', e);
    }
    return [];
  });
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem('nama_cart_items_v1');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [activeCategory, setActiveCategory] = useState<ProductCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'price_asc' | 'price_desc'>('popular');

  // Modals
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCartBumping, setIsCartBumping] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState<{ product: Product; quantity: number } | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  // Strict Path-Based Routing: '/' is Public Storefront, '/admin' is Admin Area
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname.toLowerCase();
    }
    return '/';
  });

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminUserEmail, setAdminUserEmail] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Sync route on popstate (browser back/forward)
  useEffect(() => {
    const handleLocationChange = () => {
      if (typeof window !== 'undefined') {
        setCurrentPath(window.location.pathname.toLowerCase());
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path.toLowerCase());
      window.scrollTo(0, 0);
    }
  };

  // Monitor Admin Login State via secure Session Token (Pure PIN/Password, no Google popups)
  useEffect(() => {
    const checkToken = () => {
      const token = sessionStorage.getItem('nama_admin_token');
      if (token) {
        setIsAdminLoggedIn(true);
        setAdminUserEmail('مدیر سیستم');
      } else {
        setIsAdminLoggedIn(false);
        setAdminUserEmail(null);
      }
    };
    checkToken();
    window.addEventListener('storage', checkToken);
    return () => window.removeEventListener('storage', checkToken);
  }, []);

  const handleAdminLoginSuccess = (_token: string) => {
    setIsAdminLoggedIn(true);
    setAdminUserEmail('مدیر سیستم');
    showToast('ورود به پنل مدیریت با موفقیت انجام شد.');
  };

  // Tracking Modal State
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Save cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('nama_cart_items_v1', JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart]);

  // Keep SessionStorage cache in sync whenever orders are updated locally
  useEffect(() => {
    try {
      if (orders && orders.length > 0) {
        sessionStorage.setItem('nama_cached_orders_v1', JSON.stringify(orders));
      }
    } catch (e) {
      console.warn('SessionStorage orders sync error:', e);
    }
  }, [orders]);

  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const isInitialOrdersLoadedRef = useRef(false);

  // Initial load and live real-time sync across all devices & phones
  useEffect(() => {
    let unsubProducts: (() => void) | undefined;
    let unsubOrders: (() => void) | undefined;
    let unsubSettings: (() => void) | undefined;

    // Register any cached orders right away to prevent replay alerts on load
    if (orders.length > 0) {
      orders.forEach(o => knownOrderIdsRef.current.add(o.id));
    }

    async function loadData() {
      testFirestoreConnection().catch(() => {});
      const [fetchedSettings, fetchedProducts, fetchedOrders] = await Promise.all([
        fetchStoreSettings(),
        fetchProducts(),
        fetchOrders(),
      ]);
      setSettings(fetchedSettings);
      setProducts(fetchedProducts || []);
      setOrders(fetchedOrders);
      try {
        sessionStorage.setItem('nama_cached_orders_v1', JSON.stringify(fetchedOrders));
      } catch (e) {
        console.warn('SessionStorage cache write notice:', e);
      }

      fetchedOrders.forEach(o => knownOrderIdsRef.current.add(o.id));
      isInitialOrdersLoadedRef.current = true;

      // Start live real-time listeners for instant synchronization across all phones
      unsubProducts = subscribeToProducts((liveProducts) => {
        setProducts(liveProducts);
      });
      unsubOrders = subscribeToOrders((liveOrders) => {
        if (isInitialOrdersLoadedRef.current) {
          const incomingNew = liveOrders.filter(o => !knownOrderIdsRef.current.has(o.id));
          if (incomingNew.length > 0) {
            const latest = incomingNew[0];
            showToast(`🔔 سفارش جدید ثبت شد! (${latest.customerName} - ${latest.totalAmount.toLocaleString('fa-IR')} تومان)`);
            incomingNew.forEach(o => knownOrderIdsRef.current.add(o.id));
          }
        } else {
          liveOrders.forEach(o => knownOrderIdsRef.current.add(o.id));
        }
        setOrders(liveOrders);
        try {
          sessionStorage.setItem('nama_cached_orders_v1', JSON.stringify(liveOrders));
        } catch (e) {
          console.warn('SessionStorage live cache write notice:', e);
        }
      });
      unsubSettings = subscribeToSettings((liveSettings) => {
        setSettings(liveSettings);
      });
    }

    loadData();

    return () => {
      if (unsubProducts) unsubProducts();
      if (unsubOrders) unsubOrders();
      if (unsubSettings) unsubSettings();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Cart operations with strict stock enforcement
  const handleAddToCart = (product: Product, quantity: number = 1) => {
    // Check authoritative product stock from products state
    const currentProd = products.find(p => p.id === product.id) || product;
    const currentStock = Math.max(0, Number(currentProd.stock ?? 0));

    if (currentStock <= 0) {
      showToast(`محصول «${product.name}» در حال حاضر ناموجود است.`);
      return;
    }

    let reachedMax = false;
    let actualAdded = 0;

    setCart(prev => {
      const index = prev.findIndex(item => item.product.id === product.id);
      if (index >= 0) {
        const currentInCart = prev[index].quantity;
        const remainingStock = Math.max(0, currentStock - currentInCart);
        if (remainingStock <= 0) {
          reachedMax = true;
          return prev;
        }
        const qtyToAdd = Math.min(quantity, remainingStock);
        actualAdded = qtyToAdd;
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          product: { ...currentProd, stock: currentStock },
          quantity: currentInCart + qtyToAdd,
        };
        return updated;
      } else {
        const qtyToAdd = Math.min(quantity, currentStock);
        actualAdded = qtyToAdd;
        return [...prev, { product: { ...currentProd, stock: currentStock }, quantity: qtyToAdd }];
      }
    });

    if (reachedMax) {
      showToast(`حداکثر موجودی این محصول در انبار (${currentStock} عدد) به سبد خرید اضافه شده است.`);
      return;
    }

    setIsCartBumping(true);
    setTimeout(() => {
      setIsCartBumping(false);
    }, 900);

    // Subtle, elegant visual feedback animation
    setAddedFeedback({ product: currentProd, quantity: actualAdded });
    setTimeout(() => {
      setAddedFeedback(null);
    }, 3800);

    // Asynchronous real-time database stock sync
    fetchProducts().then(freshProducts => {
      if (freshProducts && freshProducts.length > 0) {
        setProducts(freshProducts);
        const liveProd = freshProducts.find(p => p.id === product.id);
        if (liveProd && liveProd.stock !== currentProd.stock) {
          setCart(prev => prev.map(item => item.product.id === product.id 
            ? { ...item, product: liveProd, quantity: Math.min(item.quantity, Math.max(0, liveProd.stock)) } 
            : item
          ));
        }
      }
    }).catch(() => {});

    showToast(`«${product.name}» (${actualAdded} عدد) به سبد خرید اضافه شد.`);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    const currentProd = products.find(p => p.id === productId);
    const currentStock = currentProd ? Math.max(0, Number(currentProd.stock ?? 0)) : 999;

    if (quantity > currentStock) {
      showToast(`حداکثر موجودی این محصول در انبار (${currentStock} عدد) است.`);
    }

    const safeQty = Math.min(quantity, currentStock);
    if (safeQty <= 0) {
      handleRemoveFromCart(productId);
      showToast('محصول به دلیل اتمام موجودی از سبد خرید حذف شد.');
      return;
    }

    setCart(prev => 
      prev.map(item => item.product.id === productId 
        ? { ...item, quantity: safeQty, product: currentProd ? { ...item.product, stock: currentStock } : item.product } 
        : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  // Checkout completed
  const handleOrderCompleted = async (newOrder: Order) => {
    await createOrder(newOrder, settings);
    setOrders(prev => [newOrder, ...prev]);
    setCart([]); // Clear cart
  };

  // Admin order status update
  const handleUpdateOrderStatus = async (
    orderId: string, 
    status: OrderStatus, 
    extras?: { trackingCode?: string }
  ) => {
    try {
      await updateOrderStatus(orderId, status, extras);
      setOrders(prev => 
        prev.map(o => o.id === orderId ? { ...o, status, ...extras, updatedAt: new Date().toISOString() } : o)
      );
      showToast('وضعیت سفارش بروزرسانی شد.');
    } catch (err: any) {
      showToast('خطا در بروزرسانی وضعیت سفارش: ' + (err?.message || 'مشکل در پایگاه داده'));
      throw err;
    }
  };

  // Admin delete single order
  const handleDeleteOrder = async (orderId: string) => {
    try {
      await deleteOrder(orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      showToast('سفارش مورد نظر حذف گردید.');
    } catch (err: any) {
      showToast('خطا در حذف سفارش: ' + (err?.message || 'مشکل در پایگاه داده'));
      throw err;
    }
  };

  // Admin clear all orders (clean store start)
  const handleClearAllOrders = async () => {
    try {
      await clearAllOrders();
      setOrders([]);
      showToast('تمامی سفارشات حذف شدند.');
    } catch (err: any) {
      showToast('خطا در پاکسازی سفارشات: ' + (err?.message || 'مشکل در پایگاه داده'));
      throw err;
    }
  };

  // Admin save/edit product
  const handleSaveProduct = async (product: Product) => {
    try {
      await saveProduct(product);
      setProducts(prev => {
        const index = prev.findIndex(p => p.id === product.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = product;
          return updated;
        } else {
          return [product, ...prev];
        }
      });
      showToast('محصول با موفقیت ذخیره شد.');
    } catch (err: any) {
      showToast('خطا در ذخیره محصول: ' + (err?.message || 'مشکل در پایگاه داده'));
      throw err;
    }
  };

  // Admin delete product
  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteProduct(productId);
      setProducts(prev => prev.filter(p => p.id !== productId));
      showToast('محصول از کاتالوگ حذف گردید.');
    } catch (err: any) {
      showToast('خطا در حذف محصول: ' + (err?.message || 'مشکل در پایگاه داده'));
      throw err;
    }
  };

  // Admin 1-click Clear all products (wipe demo catalog)
  const handleClearAllProducts = async () => {
    try {
      await clearAllProducts();
      setProducts([]);
      showToast('تمامی محصولات از کاتالوگ حذف شدند.');
    } catch (err: any) {
      showToast('خطا در حذف محصولات: ' + (err?.message || 'مشکل در پایگاه داده'));
      throw err;
    }
  };

  // Admin 1-click Reset Sample products
  const handleResetSampleProducts = async () => {
    try {
      const samples = await resetSampleProducts();
      setProducts(samples);
      showToast('محصولات نمونه با موفقیت بازنشانی شدند.');
    } catch (err: any) {
      showToast('خطا در بازنشانی محصولات نمونه: ' + (err?.message || 'مشکل در پایگاه داده'));
      throw err;
    }
  };

  // Admin update store settings (all texts & bank info)
  const handleUpdateSettings = async (newSettings: StoreSettings) => {
    try {
      await updateStoreSettings(newSettings);
      setSettings(newSettings);
      showToast('تنظیمات و متون سایت ذخیره گردید.');
    } catch (err: any) {
      showToast('خطا در ذخیره تنظیمات: ' + (err?.message || 'مشکل در پایگاه داده'));
      throw err;
    }
  };

  // Filtered & Sorted Products
  const filteredProducts = products.filter(p => {
    const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = !query || 
      (p.name && p.name.toLowerCase().includes(query)) || 
      (p.shortDesc && p.shortDesc.toLowerCase().includes(query)) || 
      (p.description && p.description.toLowerCase().includes(query)) ||
      (p.origin && p.origin.toLowerCase().includes(query)) ||
      (p.categoryLabel && p.categoryLabel.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  }).sort((a, b) => {
    if (sortBy === 'price_asc') return (a.price || 0) - (b.price || 0);
    if (sortBy === 'price_desc') return (b.price || 0) - (a.price || 0);
    if (sortBy === 'newest') {
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      return timeB - timeA;
    }
    // Default: popular
    if (a.isPopular && !b.isPopular) return -1;
    if (!a.isPopular && b.isPopular) return 1;
    return 0;
  });

  const cartTotalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const scrollToCatalog = () => {
    const el = document.getElementById('catalog-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectCategory = (cat: ProductCategory) => {
    setActiveCategory(cat);
    scrollToCatalog();
  };

  const isAdminRoute = currentPath === '/admin' || currentPath.startsWith('/admin/');

  // 1. DEDICATED ADMIN ROUTE (/admin)
  if (isAdminRoute) {
    if (!isAdminLoggedIn) {
      return (
        <div className="min-h-screen bg-[#FAF7F0] text-[#231709] flex flex-col items-center justify-center p-4">
          {toastMessage && (
            <div className="fixed top-6 right-6 z-50 bg-[#231709] text-[#FAF7F0] px-4 py-3 rounded-2xl shadow-xl border border-[#D4A340]/60 flex items-center gap-2.5 text-xs sm:text-sm font-bold">
              <Sparkles className="w-4 h-4 text-[#D4A340]" />
              <span>{toastMessage}</span>
            </div>
          )}
          <AdminLoginDialog
            isOpen={true}
            mode="page"
            onClose={() => navigateTo('/')}
            onReturnToStore={() => navigateTo('/')}
            onSuccess={handleAdminLoginSuccess}
          />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#FAF7F0] text-[#231709]">
        {toastMessage && (
          <div className="fixed top-6 right-6 z-50 bg-[#231709] text-[#FAF7F0] px-4 py-3 rounded-2xl shadow-xl border border-[#D4A340]/60 flex items-center gap-2.5 text-xs sm:text-sm font-bold">
            <Sparkles className="w-4 h-4 text-[#D4A340]" />
            <span>{toastMessage}</span>
          </div>
        )}
        <AdminModal
          isOpen={true}
          onClose={() => navigateTo('/')}
          orders={orders}
          products={products}
          settings={settings}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          onDeleteOrder={handleDeleteOrder}
          onClearAllOrders={handleClearAllOrders}
          onSaveProduct={handleSaveProduct}
          onDeleteProduct={handleDeleteProduct}
          onClearAllProducts={handleClearAllProducts}
          onResetSampleProducts={handleResetSampleProducts}
          onUpdateSettings={handleUpdateSettings}
          onAuthChange={(isAuth, email) => {
            setIsAdminLoggedIn(isAuth);
            setAdminUserEmail(email || null);
            if (!isAuth) {
              navigateTo('/');
            }
          }}
        />
      </div>
    );
  }

  // 2. PUBLIC STOREFRONT ROUTE (/)
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] text-[#231709] w-full max-w-full overflow-x-hidden relative">

      {/* Intro Splash Animation (plays once per session, dynamic CMS texts) */}
      <IntroSplash settings={settings} />

      {/* Elegant Visual Toast & Cart-Added Feedback Bar */}
      {addedFeedback && (
        <div 
          onClick={() => { setIsCartOpen(true); setAddedFeedback(null); }}
          className="fixed bottom-5 right-4 left-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-[#163826] text-white p-3.5 rounded-2xl shadow-2xl border border-[#D4A340]/60 flex items-center justify-between gap-3 cursor-pointer animate-in fade-in slide-in-from-bottom-5 duration-300 hover:scale-[1.02] transition-transform"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-[#D4A340]/40 shrink-0 bg-white">
              <img src={addedFeedback.product.image} alt={addedFeedback.product.name} className="w-full h-full object-cover" />
              <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-bl flex items-center justify-center">
                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div className="min-w-0 text-right">
              <span className="text-[11px] text-[#E8C574] font-bold block truncate">
                به سبد خرید اضافه شد ({addedFeedback.quantity} عدد)
              </span>
              <h5 className="text-xs font-black text-white truncate">
                {addedFeedback.product.name}
              </h5>
            </div>
          </div>
          <button 
            type="button" 
            className="px-3 py-1.5 rounded-xl bg-[#D4A340] hover:bg-[#B8860B] text-[#163826] text-xs font-black shrink-0 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>مشاهده سبد</span>
          </button>
        </div>
      )}

      {/* Standard Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-20 sm:bottom-6 right-6 z-40 bg-[#231709] text-[#FAF7F0] px-4 py-3 rounded-2xl shadow-xl border border-[#D4A340]/60 flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-in fade-in slide-in-from-bottom-4 duration-200">
          <Sparkles className="w-4 h-4 text-[#D4A340]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <Header
        settings={settings}
        cartCount={cartTotalItemsCount}
        isCartBumping={isCartBumping}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracking={() => setIsTrackingOpen(true)}
        onOpenAdmin={() => navigateTo('/admin')}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isAdminLoggedIn={isAdminLoggedIn}
      />

      {/* Hero Section */}
      <Hero
        settings={settings}
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
        onScrollToCatalog={scrollToCatalog}
      />

      {/* 1. Category Showcase Cards (Only rendered if multiple categories exist) */}
      <CategoryShowcase
        products={products}
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
      />

      {/* 2. Authentic Catalog Section */}
      <main id="catalog-section" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white/90 p-4 rounded-3xl border border-[#E8DEC9] shadow-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#A47922]" />
            <span className="text-xs sm:text-sm font-black text-[#231709]">
              {activeCategory === 'all' 
                ? 'تمامی محصولات اصیل ناما' 
                : (settings.customCategories?.find(c => c.id === activeCategory)?.name || 
                   products.find(p => p.category === activeCategory)?.categoryLabel || 
                   activeCategory)
              }
            </span>
            <span className="text-xs text-[#5C4B3C] bg-[#FAF3E3] px-2.5 py-0.5 rounded-full font-bold border border-[#E8DEC9]">
              {filteredProducts.length} محصول
            </span>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#645344] hidden sm:inline flex items-center gap-1 font-semibold">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              مرتب‌سازی:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#FAF7F0] border border-[#D5C6AC] rounded-xl px-3 py-1.5 text-xs text-[#231709] font-bold focus:outline-none focus:ring-1 focus:ring-[#D4A340]"
            >
              <option value="popular">محبوب‌ترین‌ها و پیشنهادی</option>
              <option value="newest">تازه‌ترین محصولات</option>
              <option value="price_asc">ارزان‌ترین قیمت</option>
              <option value="price_desc">گران‌ترین قیمت</option>
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={(p) => handleAddToCart(p, 1)}
                onOpenDetails={(p) => setSelectedProduct(p)}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center bg-white rounded-3xl border border-[#E7DDC9] p-8 shadow-xs">
            <div className="w-16 h-16 rounded-full bg-[#FAF3E3] flex items-center justify-center text-[#A47922] mx-auto mb-3">
              <Leaf className="w-8 h-8 text-[#A47922]" />
            </div>
            <h3 className="text-base font-black text-[#231709] mb-1">
              {products.length === 0 ? 'کاتالوگ محصولات در حال حاضر خالی است' : 'محصولی با این فیلتر یافت نشد'}
            </h3>
            <p className="text-xs text-[#6B5A4B] max-w-md mx-auto mb-5 leading-relaxed">
              {products.length === 0 
                ? 'فروشگاه ناما آماده ثبت محصولات اختصاصی شماست. از طریق پنل مدیریت می‌توانید دسته‌بندی جدید (مانند چای، دمنوش یا هر دسته دلخواه) تعریف کنید و محصولات خود را با تعداد و توضیحات ثبت نمایید.'
                : 'می‌توانید عبارت دیگری را جستجو کرده یا فیلتر دسته‌بندی را به «همه محصولات» تغییر دهید.'
              }
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={async () => {
                  setActiveCategory('all');
                  setSearchQuery('');
                  const fresh = await fetchProducts();
                  if (fresh && fresh.length > 0) setProducts(fresh);
                }}
                className="px-6 py-2.5 rounded-full bg-[#231709] text-white text-xs font-bold shadow-md hover:bg-[#150D05] transition-all cursor-pointer"
              >
                مشاهده تمامی محصولات
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <Footer
        settings={settings}
        onOpenTracking={() => setIsTrackingOpen(true)}
        onOpenAdmin={() => navigateTo('/admin')}
      />

      {/* Floating WhatsApp Quick Support Button */}
      <WhatsAppButton phone={settings.supportPhone || '+98 916 644 9409'} />

      {/* MODALS (Customer Only) */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onProceedToCheckout={() => setIsCheckoutOpen(true)}
        settings={settings}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cart}
        settings={settings}
        onOrderCompleted={handleOrderCompleted}
      />

      <OrderTrackingModal
        isOpen={isTrackingOpen}
        onClose={() => setIsTrackingOpen(false)}
        settings={settings}
        onOrderUpdated={(upd) => {
          setOrders(prev => prev.map(o => o.id === upd.id ? upd : o));
        }}
      />
    </div>
  );
}

