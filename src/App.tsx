import React, { useState, useEffect } from 'react';
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
  saveProduct, 
  deleteProduct, 
  clearAllProducts,
  resetSampleProducts,
  updateStoreSettings 
} from './services/storeService';
import { testFirestoreConnection } from './firebase';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { CategoryShowcase } from './components/CategoryShowcase';
import { PromoBanners } from './components/PromoBanners';
import { FeaturedCollections } from './components/FeaturedCollections';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { AdminModal } from './components/AdminModal';
import { Footer } from './components/Footer';
import { DEFAULT_SETTINGS, DEFAULT_PRODUCTS } from './data/defaultProducts';
import { 
  SlidersHorizontal, 
  Sparkles, 
  Leaf,
  Filter,
  Plus
} from 'lucide-react';

export default function App() {
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
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
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

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

  // Initial load from Firestore and test connection
  useEffect(() => {
    async function loadData() {
      await testFirestoreConnection();
      const [fetchedSettings, fetchedProducts, fetchedOrders] = await Promise.all([
        fetchStoreSettings(),
        fetchProducts(),
        fetchOrders(),
      ]);
      setSettings(fetchedSettings);
      setProducts(fetchedProducts);
      setOrders(fetchedOrders);
    }
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Cart operations
  const handleAddToCart = (product: Product, quantity: number = 1) => {
    setCart(prev => {
      const index = prev.findIndex(item => item.product.id === product.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          quantity: updated[index].quantity + quantity,
        };
        return updated;
      } else {
        return [...prev, { product, quantity }];
      }
    });
    showToast(`«${product.name}» به سبد خرید اضافه شد.`);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setCart(prev => 
      prev.map(item => item.product.id === productId ? { ...item, quantity } : item)
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
    await updateOrderStatus(orderId, status, extras);
    setOrders(prev => 
      prev.map(o => o.id === orderId ? { ...o, status, ...extras, updatedAt: new Date().toISOString() } : o)
    );
    showToast('وضعیت سفارش بروزرسانی شد.');
  };

  // Admin save/edit product
  const handleSaveProduct = async (product: Product) => {
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
  };

  // Admin delete product
  const handleDeleteProduct = async (productId: string) => {
    await deleteProduct(productId);
    setProducts(prev => prev.filter(p => p.id !== productId));
    showToast('محصول از کاتالوگ حذف گردید.');
  };

  // Admin 1-click Clear all products (wipe demo catalog)
  const handleClearAllProducts = async () => {
    await clearAllProducts();
    setProducts([]);
    showToast('تمامی محصولات از کاتالوگ حذف شدند.');
  };

  // Admin 1-click Reset Sample products
  const handleResetSampleProducts = async () => {
    const samples = await resetSampleProducts();
    setProducts(samples);
    showToast('محصولات نمونه با موفقیت بازنشانی شدند.');
  };

  // Admin update store settings (all texts & bank info)
  const handleUpdateSettings = async (newSettings: StoreSettings) => {
    await updateStoreSettings(newSettings);
    setSettings(newSettings);
    showToast('تنظیمات و متون سایت ذخیره گردید.');
  };

  // Filtered & Sorted Products
  const filteredProducts = products.filter(p => {
    const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = !query || 
      p.name.toLowerCase().includes(query) || 
      p.shortDesc.toLowerCase().includes(query) || 
      p.description.toLowerCase().includes(query) ||
      p.origin.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  }).sort((a, b) => {
    if (sortBy === 'price_asc') return a.price - b.price;
    if (sortBy === 'price_desc') return b.price - a.price;
    if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] text-[#231709]">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#231709] text-[#FAF7F0] px-4 py-3 rounded-2xl shadow-xl border border-[#D4A340]/60 flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-in fade-in slide-in-from-bottom-4 duration-200">
          <Sparkles className="w-4 h-4 text-[#D4A340]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <Header
        settings={settings}
        cartCount={cartTotalItemsCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracking={() => setIsTrackingOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Hero Section */}
      <Hero
        settings={settings}
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
        onScrollToCatalog={scrollToCatalog}
      />

      {/* 1. Category Showcase Cards (دسته‌بندی‌های پرطرفدار) */}
      <CategoryShowcase
        products={products}
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
      />

      {/* 2. Visual Promo Banners with High-Quality Images & Slogan "از نام و جان برای طعمی ماندگار" */}
      <PromoBanners
        settings={settings}
        onSelectCategory={handleSelectCategory}
      />

      {/* 3. Featured Products & New Arrivals (محصولات منتخب عسل‌های خاص و خرماهای لوکس / آخرین محصولات اضافه شده) */}
      {products.length > 0 && (
        <FeaturedCollections
          products={products}
          onAddToCart={(p) => handleAddToCart(p, 1)}
          onOpenDetails={(p) => setSelectedProduct(p)}
        />
      )}

      {/* 4. Complete Catalog Section */}
      <main id="catalog-section" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white/90 p-4 rounded-3xl border border-[#E8DEC9] shadow-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#A47922]" />
            <span className="text-xs sm:text-sm font-black text-[#231709]">
              {activeCategory === 'all' && 'تمامی محصولات اصیل ناما'}
              {activeCategory === 'honey_medicinal' && 'عسل‌های درمانی و خاص'}
              {activeCategory === 'dates_export' && 'خرماهای صادراتی و لوکس'}
              {activeCategory === 'syrups_traditional' && 'شیره‌ها و معجون‌های سنتی'}
              {activeCategory === 'saffron_gold' && 'زعفران و طلای سرخ قائنات'}
              {activeCategory === 'oils_herbal' && 'روغن‌های فرابکر و دمنوش‌ها'}
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
          <div className="py-20 text-center bg-white rounded-3xl border border-[#E7DDC9] p-8 shadow-xs">
            <div className="w-16 h-16 rounded-full bg-[#FAF3E3] flex items-center justify-center text-[#A47922] mx-auto mb-3">
              <Leaf className="w-8 h-8 text-[#A47922]" />
            </div>
            <h3 className="text-base font-bold text-[#231709] mb-1">
              {products.length === 0 ? 'کاتالوگ محصولات در حال حاضر خالی است' : 'محصولی با این فیلتر یافت نشد'}
            </h3>
            <p className="text-xs text-[#6B5A4B] max-w-sm mx-auto mb-5 leading-relaxed">
              {products.length === 0 
                ? 'شما محصولات را حذف کرده‌اید. می‌توانید از طریق پنل مدیریت محصولات دلخواه خود را اضافه کنید یا محصولات نمونه را با ۱ کلیک بازگردانید.'
                : 'می‌توانید عبارت دیگری را جستجو کرده یا فیلتر دسته‌بندی را به «همه محصولات» تغییر دهید.'
              }
            </p>
            <div className="flex items-center justify-center gap-3">
              {products.length === 0 ? (
                <>
                  <button
                    onClick={handleResetSampleProducts}
                    className="px-5 py-2.5 rounded-full bg-[#D4A340] hover:bg-[#B8860B] text-[#231709] text-xs font-black shadow-md transition-all"
                  >
                    بازگردانی محصولات نمونه با عکس
                  </button>
                  <button
                    onClick={() => setIsAdminOpen(true)}
                    className="px-5 py-2.5 rounded-full bg-[#231709] hover:bg-[#150D05] text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 text-amber-300" />
                    <span>افزودن محصول جدید در پنل</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setActiveCategory('all');
                    setSearchQuery('');
                  }}
                  className="px-5 py-2.5 rounded-full bg-[#231709] text-white text-xs font-bold shadow-md hover:bg-[#150D05] transition-all"
                >
                  مشاهده تمامی محصولات
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer
        settings={settings}
        onOpenTracking={() => setIsTrackingOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
      />

      {/* MODALS */}
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
        onOrderUpdated={(upd) => {
          setOrders(prev => prev.map(o => o.id === upd.id ? upd : o));
        }}
      />

      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        orders={orders}
        products={products}
        settings={settings}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        onSaveProduct={handleSaveProduct}
        onDeleteProduct={handleDeleteProduct}
        onClearAllProducts={handleClearAllProducts}
        onResetSampleProducts={handleResetSampleProducts}
        onUpdateSettings={handleUpdateSettings}
      />
    </div>
  );
}
