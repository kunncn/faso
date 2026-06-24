/* =====================================================================
 * FASO — PASTRY POS SYSTEM
 * ---------------------------------------------------------------------
 * Single-file app. Organized into labeled sections:
 *
 *   1. CONFIG        → tunable constants (edit here to adjust the app)
 *   2. STATE         → mutable runtime data
 *   3. UTILITIES     → pure helpers (money math, dates)
 *   4. DATABASE      → IndexedDB open / save / read
 *   5. DATA LOADING  → fetch inventory.json + addons.json
 *   6. RENDERING     → DOM builders
 *   7. CART ACTIONS  → add / remove / confirm
 *   8. FILTERS       → price / category / search
 *   9. SALES         → checkout, summary, PDF export
 *  10. MODALS & UI   → open/close/toggle dialogs
 *  11. INIT          → bootstrap + event wiring
 *
 * NOTE: functions are declared (hoisted + globally callable) because
 * index.html calls many of them via inline onclick/onchange handlers,
 * and several are referenced from JS-generated HTML strings.
 * ===================================================================== */

/* =====================================================================
 * 1. CONFIG — tune the app from here
 * ===================================================================== */
const CONFIG = {
  currency: "RM",

  // IndexedDB
  db: {
    name: "faso_db",
    version: 1,
    store: "sales",
    dateIndex: "dateKey",
  },

  // JSON data sources
  files: {
    inventory: "./inventory.json",
    addons: "./addons.json",
  },

  // Product ids >= this are treated as drinks (open the customize modal)
  drinkIdThreshold: 101,

  // Mirror the price buttons in index.html (#price-categories)
  priceCategories: [10, 14, 15, 16, 18, 20, 30],

  // Mirror the drink buttons in index.html (#drink-categories)
  drinkCategories: ["coffee", "tea", "soda", "matcha", "chocolate"],

  // Payment methods available in the checkout <select>
  paymentMethods: ["cash", "card", "qr"],

  // Discount tiers mirrored by the discount <select>
  discounts: [
    { rate: 0, label: "No Discount" },
    { rate: 0.2, label: "20% OFF" },
    { rate: 0.1, label: "10% OFF" },
  ],

  // Order types
  orderTypes: { dinein: "Dine In", takeaway: "Take Away" },

  // Emoji shown on each product card by category
  categoryEmoji: {
    pastry: "🥐",
    savory: "🥪",
    coffee: "☕",
    tea: "🍵",
    soda: "🥤",
    matcha: "🍵",
    chocolate: "🍫",
  },
};

/* =====================================================================
 * 2. STATE
 * ===================================================================== */
let db; // IndexedDB connection
let inventory = []; // full product catalog (from inventory.json)
let addons = []; // drink customization options (from addons.json)
let cart = []; // current order being built
let selectedProduct = null; // product shown in the addon modal
let selectedTemp = null; // "hot" | "ice" | null (drink temperature)
let selectedOrderType = "dinein"; // global default for new cart lines

/* =====================================================================
 * 3. UTILITIES — pure helpers (the single source of truth for money math)
 * ===================================================================== */

// Format a number as a currency string, e.g. 12 -> "RM12.00"
function money(n) {
  return `${CONFIG.currency}${Number(n).toFixed(2)}`;
}

// Sum of an item's selected add-ons (0 when none)
function addonTotal(item) {
  return item.addons ? item.addons.reduce((sum, a) => sum + a.price, 0) : 0;
}

// Price × qty for one cart line, including its add-ons
function lineTotal(item) {
  return (item.price + addonTotal(item)) * item.qty;
}

// Sum of every line in the cart (before discount)
function cartSubtotal(items) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

// Apply a discount rate to a subtotal → { discountAmt, total }
function computeFinal(subtotal, rate) {
  const discountAmt = subtotal * rate;
  return { discountAmt, total: subtotal - discountAmt };
}

// Read the currently selected discount rate from the checkout dropdown
function readDiscountRate() {
  return parseFloat(document.getElementById("discount")?.value || 0);
}

// Does this product id represent a drink (needs the customize modal)?
function isDrink(id) {
  return id >= CONFIG.drinkIdThreshold;
}

// "YYYY-MM-DD" key for grouping sales by day
function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Human-friendly 12-hour timestamp for receipts
function formatTo12Hour(dateString) {
  return new Date(dateString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/* =====================================================================
 * 4. DATABASE — IndexedDB
 * ===================================================================== */

// Open (or create) the database, then kick off inventory + history
function openDB() {
  const request = indexedDB.open(CONFIG.db.name, CONFIG.db.version);

  request.onupgradeneeded = function (e) {
    db = e.target.result;
    if (!db.objectStoreNames.contains(CONFIG.db.store)) {
      const store = db.createObjectStore(CONFIG.db.store, { keyPath: "id" });
      store.createIndex(CONFIG.db.dateIndex, CONFIG.db.dateIndex, {
        unique: false,
      });
    }
  };

  request.onsuccess = function (e) {
    db = e.target.result;
    loadInventory();
    renderOrderHistory();
  };
}

// Persist a completed sale
function saveSale(sale) {
  const tx = db.transaction(CONFIG.db.store, "readwrite");
  tx.objectStore(CONFIG.db.store).add(sale);
}

// Read every sale for today and hand them to the callback
function getTodaySales(callback) {
  const tx = db.transaction(CONFIG.db.store, "readonly");
  const request = tx.objectStore(CONFIG.db.store).getAll();

  request.onsuccess = function () {
    const today = getTodayKey();
    callback(request.result.filter((s) => s.dateKey === today));
  };
}

/* =====================================================================
 * 5. DATA LOADING
 * ===================================================================== */

function loadInventory() {
  fetch(CONFIG.files.inventory)
    .then((res) => res.json())
    .then((data) => {
      inventory = data;
      showCategoryScreen();
      lucide.createIcons();
    })
    .catch((err) => console.error("Error loading inventory JSON:", err));
}

// Add-on catalog is loaded once on startup
fetch(CONFIG.files.addons)
  .then((res) => res.json())
  .then((data) => {
    addons = data;
  });

/* =====================================================================
 * 6. RENDERING
 * ===================================================================== */

// Empty-state prompt shown before any filter is picked
function showCategoryScreen() {
  document.getElementById("product-grid").innerHTML =
    `<div class="text-gray-400 text-center col-span-full">
      Select a category to start
    </div>`;
}

// Price line for a product card, accounting for hot/ice variants
function productPriceLabel(item) {
  const hasHot = item.price > 0;
  const hasIce = (item.priceIce || 0) > 0;

  if (hasHot && hasIce) {
    return `<p class="text-rose-500 font-bold mt-1 text-xs">🔥${money(item.price)} / 🧊${money(item.priceIce)}</p>`;
  }
  if (!hasHot && hasIce) {
    return `<p class="text-blue-500 font-bold mt-1">🧊 ${money(item.priceIce)}</p>`;
  }
  return `<p class="text-rose-500 font-bold mt-1">${money(item.price)}</p>`;
}

// Render a list of products into the grid (sold-out items hidden)
function renderProducts(list = inventory) {
  document.getElementById("product-grid").innerHTML = list
    .filter((item) => !item.soldOut)
    .map(
      (item) => `
      <div onclick="addToCart(${item.id})"
        class="pastry-card ${item.color} bg-white p-5 rounded-2xl shadow-sm border cursor-pointer hover:shadow-md">
        <div class="w-full h-32 bg-gray-50 rounded-xl mb-4 flex items-center justify-center text-4xl">
          ${CONFIG.categoryEmoji[item.category] || "🍽️"}
        </div>
        <h3 class="font-bold text-gray-800">${item.name}</h3>
        ${productPriceLabel(item)}
      </div>
    `,
    )
    .join("");
}

// Temperature badge for a cart line / receipt item
function tempBadge(temp, cls) {
  if (temp === "hot")
    return `<span class="${cls} bg-rose-100 text-rose-600 px-2 py-0.5 rounded">🔥 Hot</span>`;
  if (temp === "ice")
    return `<span class="${cls} bg-blue-100 text-blue-600 px-2 py-0.5 rounded">🧊 Ice</span>`;
  return "";
}

// Render the current cart + recompute the live total
function renderCart() {
  document.getElementById("cart-items").innerHTML = cart
    .map((item, idx) => {
      const addonsLine = item.addons?.length
        ? `<div class="text-[11px] text-gray-400 mt-1">
            + ${item.addons.map((a) => a.name).join(", ")}
            <span class="text-rose-500 font-semibold">(+${money(addonTotal(item))})</span>
          </div>`
        : "";

      const taBadge =
        item.orderType === "takeaway"
          ? `<span class="text-[10px] bg-red-100 text-rose-600 px-2 py-0.5 rounded">TA</span>`
          : "";

      return `
        <div class="flex justify-between items-start bg-gray-50 p-3 rounded-lg">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <div class="font-bold text-sm truncate">${item.name}</div>
              ${tempBadge(item.temp, "text-[10px]")}
              ${taBadge}
            </div>
            <div class="text-xs text-gray-500">${money(item.price)} x ${item.qty}</div>
            ${addonsLine}
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <span class="font-bold">${money(lineTotal(item))}</span>
            <button onclick="removeFromCart(${idx})" class="text-gray-400 hover:text-red-500">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>`;
    })
    .join("");

  const { total } = computeFinal(cartSubtotal(cart), readDiscountRate());
  document.getElementById("total").innerText = money(total);
  lucide.createIcons();
}

// Hot/ice picker + add-on checklist inside the customize modal
function renderAddonList() {
  const p = selectedProduct;
  const hasHot = p.price > 0;
  const hasIce = (p.priceIce || 0) > 0;

  let tempHTML = "";
  if (hasHot && hasIce) {
    tempHTML = `
      <div class="flex gap-2 mb-3">
        <button id="btn-hot" onclick="selectTemp('hot')"
          class="flex-1 py-2 rounded-xl border-2 font-bold text-sm transition-all
            ${selectedTemp === "hot" ? "border-rose-500 bg-rose-50 text-rose-600" : "border-gray-200 text-gray-400"}">
          🔥 Hot — ${money(p.price)}
        </button>
        <button id="btn-ice" onclick="selectTemp('ice')"
          class="flex-1 py-2 rounded-xl border-2 font-bold text-sm transition-all
            ${selectedTemp === "ice" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"}">
          🧊 Ice — ${money(p.priceIce)}
        </button>
      </div>`;
  } else if (!hasHot && hasIce) {
    tempHTML = `
      <div class="mb-3 py-2 px-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-600 font-semibold">
        🧊 Ice only — ${money(p.priceIce)}
      </div>`;
  }

  const addonsHTML = addons
    .map(
      (a) => `
    <label class="flex justify-between p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
      <div>
        <input type="checkbox" value="${a.id}" />
        <span class="ml-2">${a.name}</span>
      </div>
      <span class="text-rose-500">${money(a.price)}</span>
    </label>`,
    )
    .join("");

  document.getElementById("addon-list").innerHTML = tempHTML + addonsHTML;
}

// Sidebar order history (rendered into #order-history if present)
function renderOrderHistory() {
  getTodaySales((sales) => {
    const container = document.getElementById("order-history");
    if (!container) return;

    if (sales.length === 0) {
      container.innerHTML =
        '<p class="text-sm text-gray-400">No orders today</p>';
      return;
    }

    container.innerHTML = sales
      .slice()
      .reverse()
      .map((sale) => {
        const items = sale.items.map((i) => `${i.name} x${i.qty}`).join("<br>");
        return `
          <div class="border rounded-xl p-3 bg-white">
            <div class="flex justify-between mb-2">
              <span class="font-bold">${money(sale.total)}</span>
              <span class="text-xs text-gray-500">${sale.date}</span>
            </div>
            <div class="text-sm">${items}</div>
            ${
              sale.orderType === "takeaway"
                ? '<span class="inline-block mt-2 text-xs bg-red-100 text-rose-600 px-2 py-1 rounded">TA</span>'
                : ""
            }
          </div>`;
      })
      .join("");
  });
}

/* =====================================================================
 * 7. CART ACTIONS
 * ===================================================================== */

// Add a product to the cart. Drinks open the customize modal first.
function addToCart(id) {
  const item = inventory.find((i) => i.id === id);

  if (isDrink(id)) {
    openAddonModal(id);
    return;
  }

  // Merge into an identical existing line (same item, same order type, no add-ons)
  const existing = cart.find(
    (c) =>
      c.id === item.id &&
      c.orderType === selectedOrderType &&
      (!c.addons || c.addons.length === 0),
  );

  if (existing) {
    existing.qty++;
  } else {
    cart.push({ ...item, qty: 1, orderType: selectedOrderType, addons: [] });
  }

  renderCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

// Choose Hot / Ice in the customize modal
function selectTemp(temp) {
  selectedTemp = temp;
  renderAddonList(); // re-render to update button styles
}

// Confirm the customized drink and push it to the cart
function confirmAddToCart() {
  const hasHot = selectedProduct.price > 0;
  const hasIce = (selectedProduct.priceIce || 0) > 0;

  // If both variants exist, the user must pick one
  if (hasHot && hasIce && !selectedTemp) {
    alert("Please select Hot or Ice.");
    return;
  }

  const selected = [
    ...document.querySelectorAll("#addon-list input:checked"),
  ].map((cb) => addons.find((a) => a.id == cb.value));

  const finalPrice =
    selectedTemp === "ice" ? selectedProduct.priceIce : selectedProduct.price;

  cart.push({
    ...selectedProduct,
    price: finalPrice,
    temp: selectedTemp,
    qty: 1,
    orderType: selectedOrderType,
    addons: selected,
  });

  renderCart();
  closeAddonModal();
}

/* =====================================================================
 * 8. FILTERS
 * ===================================================================== */

function filterByPrice(price) {
  renderProducts(inventory.filter((item) => item.price === price));
}

function filterDrink(category) {
  renderProducts(inventory.filter((item) => item.category === category));
}

// Filter by an explicit drink type field (currently unused by the UI)
function filterByDrink(type) {
  renderProducts(inventory.filter((item) => item.drinkType === type));
}

/* =====================================================================
 * 9. SALES
 * ===================================================================== */

// Complete the current order: validate, total, persist, reset
function processSale() {
  if (cart.length === 0) return alert("Cart is empty!");

  const paymentMethod = document.getElementById("paymentMethod").value;
  const orderType = document.getElementById("orderType").value;
  const discountRate = readDiscountRate();
  const subtotal = cartSubtotal(cart);
  const { discountAmt, total } = computeFinal(subtotal, discountRate);

  const sale = {
    id: Date.now(),
    dateKey: getTodayKey(),
    items: structuredClone(cart).map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      qty: item.qty,
      orderType: item.orderType,
      category: item.category,
      addons: item.addons || [],
      addonTotal: addonTotal(item),
      lineTotal: lineTotal(item),
    })),
    payment: paymentMethod,
    orderType,
    subtotal,
    discountRate,
    discountAmt,
    total,
    date: new Date().toLocaleString(),
  };

  saveSale(sale);
  renderOrderHistory();

  cart = [];
  renderCart();

  if (window.innerWidth < 768) {
    document.getElementById("cart-panel").classList.add("translate-y-full");
  }

  document.getElementById("modal").classList.remove("hidden");
}

// Aggregate today's sales by payment method + item counts
function getTodaySummary(callback) {
  getTodaySales((sales) => {
    const totals = { cash: 0, card: 0, qr: 0 };
    const items = {};

    sales.forEach((s) => {
      totals[s.payment] = (totals[s.payment] || 0) + s.total;
      s.items.forEach((i) => {
        items[i.name] = (items[i.name] || 0) + i.qty;
      });
    });

    callback({ ...totals, items });
  });
}

// Export today's sales as a PDF report
function exportPDF() {
  getTodaySales((sales) => {
    if (sales.length === 0) {
      alert("No sales found for today.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    getTodaySummary(({ cash, card, qr, items }) => {
      const total = cash + card + qr;
      let y = 10;

      doc.text("FASO DAILY REPORT", 10, y);
      y += 10;
      doc.text(`${CONFIG.currency}${cash.toFixed(2)}  Cash`, 10, y);
      y += 8;
      doc.text(`${CONFIG.currency}${card.toFixed(2)}  Card`, 10, y);
      y += 8;
      doc.text(`${CONFIG.currency}${qr.toFixed(2)}  QR`, 10, y);
      y += 10;
      doc.text(`TOTAL: ${money(total)}`, 10, y);
      y += 12;
      doc.text("ITEMS SOLD:", 10, y);
      y += 10;

      Object.keys(items).forEach((name) => {
        doc.text(`${name}: ${items[name]}`, 10, y);
        y += 8;
      });

      doc.save("today-sale-report.pdf");
    });
  });
}

/* =====================================================================
 * 10. MODALS & UI
 * ===================================================================== */

// Slide the cart panel in/out on mobile (no-op on desktop)
function toggleCart() {
  const cartPanel = document.getElementById("cart-panel");
  if (cartPanel.classList.contains("translate-y-full")) {
    cartPanel.classList.remove("translate-y-full");
    cartPanel.classList.add("translate-y-0");
    document.body.style.overflow = "hidden";
  } else {
    cartPanel.classList.remove("translate-y-0");
    cartPanel.classList.add("translate-y-full");
    document.body.style.overflow = "";
  }
}

function setOrderType(value) {
  selectedOrderType = value;
}

// Open the drink customize modal for a product
function openAddonModal(id) {
  selectedProduct = inventory.find((i) => i.id === id);
  selectedTemp = null;

  const hasHot = selectedProduct.price > 0;
  const hasIce = (selectedProduct.priceIce || 0) > 0;

  // Ice-only — no choice needed, preselect it
  if (!hasHot && hasIce) {
    selectedTemp = "ice";
  }

  document.getElementById("addon-title").innerText = selectedProduct.name;
  renderAddonList();
  document.getElementById("addon-modal").classList.remove("hidden");
}

function closeAddonModal() {
  document.getElementById("addon-modal").classList.add("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

// Full-detail "Today's Orders" modal with a summary header
function showOrderHistory() {
  getTodaySales((sales) => {
    const history = document.getElementById("history-list");

    if (sales.length === 0) {
      history.innerHTML =
        '<p class="text-gray-400 text-center py-6">No orders today</p>';
      document.getElementById("history-modal").classList.remove("hidden");
      return;
    }

    const totalRevenue = sales.reduce((s, sale) => s + sale.total, 0);
    const totalOrders = sales.length;
    const byPayment = (method) =>
      sales
        .filter((s) => s.payment === method)
        .reduce((s, sale) => s + sale.total, 0);

    const summaryHTML = `
      <div class="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4">
        <h3 class="font-bold text-rose-600 mb-2">Today Summary</h3>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div>Total Orders: <strong>${totalOrders}</strong></div>
          <div>Revenue: <strong class="text-rose-600">${money(totalRevenue)}</strong></div>
          <div>Cash: <strong>${money(byPayment("cash"))}</strong></div>
          <div>Card: <strong>${money(byPayment("card"))}</strong></div>
          <div>QR: <strong>${money(byPayment("qr"))}</strong></div>
        </div>
      </div>`;

    const ordersHTML = sales
      .slice()
      .reverse()
      .map((sale, idx) => {
        const discountLabel =
          sale.discountRate > 0
            ? `<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">${(sale.discountRate * 100).toFixed(0)}% OFF</span>`
            : "";

        const taLabel =
          sale.orderType === "takeaway"
            ? `<span class="text-xs bg-red-100 text-rose-600 px-2 py-0.5 rounded">TA</span>`
            : `<span class="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">Dine In</span>`;

        const itemsHTML = sale.items
          .map((item) => {
            const addonsText = item.addons?.length
              ? `<div class="text-[11px] text-gray-400 pl-2">
                  + ${item.addons.map((a) => a.name).join(", ")}
                  <span class="text-rose-500">(+${money(item.addonTotal)})</span>
                </div>`
              : "";

            const itemTA =
              item.orderType === "takeaway"
                ? `<span class="text-[10px] bg-red-100 text-rose-500 px-1 rounded">TA</span>`
                : "";

            const itemTemp =
              item.temp === "hot"
                ? `<span class="text-[10px] bg-rose-100 text-rose-500 px-1 rounded">🔥 Hot</span>`
                : item.temp === "ice"
                  ? `<span class="text-[10px] bg-blue-100 text-blue-500 px-1 rounded">🧊 Ice</span>`
                  : "";

            return `
              <div class="py-1 border-b last:border-0">
                <div class="flex justify-between text-sm">
                  <span>${item.name} ${itemTemp} ${itemTA} x${item.qty}</span>
                  <span class="font-semibold">${money(item.lineTotal)}</span>
                </div>
                ${addonsText}
              </div>`;
          })
          .join("");

        return `
          <div class="border rounded-xl overflow-hidden mb-3">
            <div class="flex justify-between items-center p-3 bg-gray-50 border-b">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">#${totalOrders - idx}</span>
                ${taLabel}
                ${discountLabel}
                <span class="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded uppercase">${sale.payment}</span>
              </div>
              <span class="text-xs text-gray-400">${formatTo12Hour(sale.date)}</span>
            </div>
            <div class="px-3 pt-2 pb-1">${itemsHTML}</div>
            <div class="px-3 pb-3 pt-1 space-y-1 text-sm">
              <div class="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>${money(sale.subtotal)}</span>
              </div>
              ${
                sale.discountAmt > 0
                  ? `<div class="flex justify-between text-yellow-600">
                    <span>Discount (${(sale.discountRate * 100).toFixed(0)}%)</span>
                    <span>-${money(sale.discountAmt)}</span>
                  </div>`
                  : ""
              }
              <div class="flex justify-between font-bold text-rose-600 border-t pt-1">
                <span>Total</span>
                <span>${money(sale.total)}</span>
              </div>
            </div>
          </div>`;
      })
      .join("");

    history.innerHTML = summaryHTML + ordersHTML;
    document.getElementById("history-modal").classList.remove("hidden");
  });
}

function closeHistory() {
  document.getElementById("history-modal").classList.add("hidden");
}

// Toggle an item's sold-out flag (used from product cards if wired up)
function toggleSoldOut(id) {
  const item = inventory.find((i) => i.id === id);
  if (item) {
    item.soldOut = !item.soldOut;
    renderProducts();
  }
}

/* =====================================================================
 * 11. INIT
 * ===================================================================== */

// Live search across the catalog by name
document.getElementById("searchInput").addEventListener("input", (e) => {
  const value = e.target.value.toLowerCase().trim();
  renderProducts(
    inventory.filter((item) => item.name.toLowerCase().includes(value)),
  );
});

// Start the app
openDB();
