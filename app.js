// =====================
// DATA STATE
// =====================
let addons = [];
let selectedProduct = null;
let selectedTemp = null; // "hot" | "ice" | null
let db;
let selectedOrderType = "dinein";

let inventory = [];
let cart = [];
const priceCategories = [10, 14, 15, 16, 18, 20, 30];
const categoryEmoji = {
  pastry: "🥐",
  savory: "🥪",
  coffee: "☕",
  tea: "🍵",
  soda: "🥤",
  matcha: "🍵",
  chocolate: "🍫",
};

function showCategoryScreen() {
  document.getElementById("product-grid").innerHTML =
    `<div class="text-gray-400 text-center col-span-full">
      Select a category to start
    </div>`;
}

function filterDrink(category) {
  renderProducts(inventory.filter((item) => item.category === category));
}

function filterByPrice(price) {
  const filtered = inventory.filter((item) => item.price === price);
  renderProducts(filtered);
}

function filterByDrink(type) {
  const filtered = inventory.filter((item) => item.drinkType === type);
  renderProducts(filtered);
}

function confirmAddToCart() {
  const hasHot = selectedProduct.price > 0;
  const hasIce = selectedProduct.priceIce > 0;

  // If both exist, user must pick
  if (hasHot && hasIce && !selectedTemp) {
    alert("Please select Hot or Ice.");
    return;
  }

  const selected = [
    ...document.querySelectorAll("#addon-list input:checked"),
  ].map((cb) => addons.find((a) => a.id == cb.value));

  // Determine final price
  const finalPrice =
    selectedTemp === "ice" ? selectedProduct.priceIce : selectedProduct.price;

  cart.push({
    ...selectedProduct,
    price: finalPrice,
    temp: selectedTemp, // "hot" | "ice" | null
    qty: 1,
    orderType: selectedOrderType,
    addons: selected,
  });

  renderCart();
  closeAddonModal();
}

function closeAddonModal() {
  document.getElementById("addon-modal").classList.add("hidden");
}

// =====================
// OPEN INDEXEDDB
// =====================

function openAddonModal(id) {
  selectedProduct = inventory.find((i) => i.id === id);
  selectedTemp = null;

  const hasHot = selectedProduct.price > 0;
  const hasIce = selectedProduct.priceIce > 0;

  // Ice only — no choice needed, auto set
  if (!hasHot && hasIce) {
    selectedTemp = "ice";
  }

  document.getElementById("addon-title").innerText = selectedProduct.name;
  renderAddonList();
  document.getElementById("addon-modal").classList.remove("hidden");
}

function renderAddonList() {
  const container = document.getElementById("addon-list");
  const hasHot = selectedProduct.price > 0;
  const hasIce = selectedProduct.priceIce > 0;

  // Hot/Ice toggle — only show when BOTH exist
  let tempHTML = "";
  if (hasHot && hasIce) {
    tempHTML = `
      <div class="flex gap-2 mb-3">
        <button id="btn-hot" onclick="selectTemp('hot')"
          class="flex-1 py-2 rounded-xl border-2 font-bold text-sm transition-all
            ${selectedTemp === "hot" ? "border-rose-500 bg-rose-50 text-rose-600" : "border-gray-200 text-gray-400"}">
          🔥 Hot — RM${selectedProduct.price.toFixed(2)}
        </button>
        <button id="btn-ice" onclick="selectTemp('ice')"
          class="flex-1 py-2 rounded-xl border-2 font-bold text-sm transition-all
            ${selectedTemp === "ice" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"}">
          🧊 Ice — RM${selectedProduct.priceIce.toFixed(2)}
        </button>
      </div>
    `;
  } else if (!hasHot && hasIce) {
    tempHTML = `
      <div class="mb-3 py-2 px-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-600 font-semibold">
        🧊 Ice only — RM${selectedProduct.priceIce.toFixed(2)}
      </div>
    `;
  }

  const addonsHTML = addons
    .map(
      (a) => `
    <label class="flex justify-between p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
      <div>
        <input type="checkbox" value="${a.id}" />
        <span class="ml-2">${a.name}</span>
      </div>
      <span class="text-rose-500">RM${a.price.toFixed(2)}</span>
    </label>
  `,
    )
    .join("");

  container.innerHTML = tempHTML + addonsHTML;
}

function selectTemp(temp) {
  selectedTemp = temp;
  renderAddonList(); // re-render to update button styles
}

fetch("./addons.json")
  .then((res) => res.json())
  .then((data) => {
    addons = data;
  });

function isDrink(id) {
  return id >= 101;
}

function setOrderType(value) {
  selectedOrderType = value;
}

function openDB() {
  const request = indexedDB.open("faso_db", 2); // v2 adds inventory store

  request.onupgradeneeded = function (e) {
    db = e.target.result;
    if (!db.objectStoreNames.contains("sales")) {
      const salesStore = db.createObjectStore("sales", { keyPath: "id" });
      salesStore.createIndex("dateKey", "dateKey", { unique: false });
    }
    if (!db.objectStoreNames.contains("inventory")) {
      db.createObjectStore("inventory", { keyPath: "id" });
    }
  };

  request.onsuccess = function (e) {
    db = e.target.result;
    loadInventory();
    renderOrderHistory();
  };
}

openDB();

// =====================
// DATE KEY
// =====================
function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// =====================
// LOAD INVENTORY
// =====================
function loadInventory() {
  // 1. Try IndexedDB first
  const tx = db.transaction("inventory", "readonly");
  const store = tx.objectStore("inventory");
  const req = store.getAll();

  req.onsuccess = function () {
    if (req.result && req.result.length > 0) {
      // IndexedDB has data — use it
      inventory = req.result;
      showCategoryScreen();
      lucide.createIcons();
    } else {
      // IndexedDB empty — load from JSON then save to DB
      fetch("./inventory.json")
        .then((res) => res.json())
        .then((data) => {
          inventory = data;
          saveAllInventoryToDB(data);
          showCategoryScreen();
          lucide.createIcons();
        })
        .catch((err) => {
          console.error("Error loading inventory JSON:", err);
        });
    }
  };

  req.onerror = function () {
    // Fallback to JSON
    fetch("./inventory.json")
      .then((res) => res.json())
      .then((data) => {
        inventory = data;
        showCategoryScreen();
        lucide.createIcons();
      });
  };
}

// Save entire inventory array to IndexedDB
function saveAllInventoryToDB(items) {
  const tx = db.transaction("inventory", "readwrite");
  const store = tx.objectStore("inventory");
  store.clear();
  items.forEach((item) => store.put(item));
}

// Save single item (add or update)
function saveItemToDB(item) {
  const tx = db.transaction("inventory", "readwrite");
  tx.objectStore("inventory").put(item);
}

// Delete single item from DB
function deleteItemFromDB(id) {
  const tx = db.transaction("inventory", "readwrite");
  tx.objectStore("inventory").delete(id);
}

// =====================
// SAVE SALE
// =====================
function saveSale(sale) {
  const tx = db.transaction("sales", "readwrite");
  tx.objectStore("sales").add(sale);
}

// =====================
// PRODUCTS
// =====================
function renderProducts(list = inventory) {
  const grid = document.getElementById("product-grid");
  const filtered = list.filter((item) => !item.soldOut);

  grid.innerHTML = filtered
    .map((item) => {
      const hasHot = item.price > 0;
      const hasIce = item.priceIce > 0;

      let priceLabel = "";
      if (hasHot && hasIce) {
        priceLabel = `<p class="text-rose-500 font-bold mt-1 text-xs">🔥RM${item.price.toFixed(2)} / 🧊RM${item.priceIce.toFixed(2)}</p>`;
      } else if (!hasHot && hasIce) {
        priceLabel = `<p class="text-blue-500 font-bold mt-1">🧊 RM${item.priceIce.toFixed(2)}</p>`;
      } else {
        priceLabel = `<p class="text-rose-500 font-bold mt-1">RM${item.price.toFixed(2)}</p>`;
      }

      return `
        <div onclick="addToCart(${item.id})"
          class="pastry-card ${item.color} bg-white p-5 rounded-2xl shadow-sm border cursor-pointer hover:shadow-md">
          <div class="w-full h-32 bg-gray-50 rounded-xl mb-4 flex items-center justify-center text-4xl">
            ${categoryEmoji[item.category] || "🍽️"}
          </div>
          <h3 class="font-bold text-gray-800">${item.name}</h3>
          ${priceLabel}
        </div>
      `;
    })
    .join("");
}

function addToCart(id) {
  const item = inventory.find((i) => i.id === id);

  if (isDrink(id)) {
    openAddonModal(id);
    return;
  }

  const existing = cart.find(
    (c) =>
      c.id === item.id &&
      c.orderType === selectedOrderType &&
      (!c.addons || c.addons.length === 0),
  );

  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      ...item,
      qty: 1,
      orderType: selectedOrderType,
      addons: [],
    });
  }

  renderCart();
}

function renderCart() {
  const container = document.getElementById("cart-items");

  container.innerHTML = cart
    .map((item, idx) => {
      const addonTotal = item.addons
        ? item.addons.reduce((s, a) => s + a.price, 0)
        : 0;
      const lineTotal = (item.price + addonTotal) * item.qty;

      const tempBadge =
        item.temp === "hot"
          ? `<span class="text-[10px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded">🔥 Hot</span>`
          : item.temp === "ice"
            ? `<span class="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded">🧊 Ice</span>`
            : "";

      const badge =
        item.orderType === "takeaway"
          ? `<span class="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded">TA</span>`
          : "";

      return `
        <div class="flex justify-between items-start bg-gray-50 p-3 rounded-lg">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <div class="font-bold text-sm truncate">${item.name}</div>
              ${tempBadge}
              ${badge}
            </div>
            <div class="text-xs text-gray-500">
              RM${item.price.toFixed(2)} x ${item.qty}
            </div>
            ${
              item.addons?.length
                ? `<div class="text-[11px] text-gray-400 mt-1">
                    + ${item.addons.map((a) => a.name).join(", ")}
                    <span class="text-rose-500 font-semibold">(+RM${addonTotal.toFixed(2)})</span>
                   </div>`
                : ""
            }
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <span class="font-bold">RM${lineTotal.toFixed(2)}</span>
            <button onclick="removeFromCart(${idx})" class="text-gray-400 hover:text-red-500">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  const discount = parseFloat(document.getElementById("discount")?.value || 0);

  const sub = cart.reduce((total, item) => {
    const addonTotal = item.addons
      ? item.addons.reduce((sum, a) => sum + a.price, 0)
      : 0;
    return total + (item.price + addonTotal) * item.qty;
  }, 0);

  const discountAmt = sub * discount;
  const finalTotal = sub - discountAmt;

  document.getElementById("total").innerText = `RM${finalTotal.toFixed(2)}`;

  lucide.createIcons();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

// =====================
// PROCESS SALE
// =====================
function processSale() {
  if (cart.length === 0) return alert("Cart is empty!");

  const paymentMethod = document.getElementById("paymentMethod").value;
  const orderType = document.getElementById("orderType").value;
  const discountRate = parseFloat(
    document.getElementById("discount")?.value || 0,
  );

  const sub = cart.reduce((total, item) => {
    const addonTotal = item.addons
      ? item.addons.reduce((sum, a) => sum + a.price, 0)
      : 0;
    return total + (item.price + addonTotal) * item.qty;
  }, 0);

  const discountAmt = sub * discountRate;
  const finalTotal = sub - discountAmt;

  // Full detail saved to IndexedDB
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
      addonTotal: item.addons
        ? item.addons.reduce((s, a) => s + a.price, 0)
        : 0,
      lineTotal:
        (item.price +
          (item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0)) *
        item.qty,
    })),
    payment: paymentMethod,
    orderType,
    subtotal: sub,
    discountRate,
    discountAmt,
    total: finalTotal,
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

// =====================
// GET TODAY SALES
// =====================
function getTodaySales(callback) {
  const tx = db.transaction("sales", "readonly");
  const store = tx.objectStore("sales");
  const request = store.getAll();

  request.onsuccess = function () {
    const all = request.result;
    const today = getTodayKey();
    const filtered = all.filter((s) => s.dateKey === today);
    callback(filtered);
  };
}

// =====================
// SUMMARY
// =====================
function getTodaySummary(callback) {
  getTodaySales((sales) => {
    let cash = 0,
      card = 0,
      qr = 0;
    let items = {};

    sales.forEach((s) => {
      if (s.payment === "cash") cash += s.total;
      if (s.payment === "card") card += s.total;
      if (s.payment === "qr") qr += s.total;

      s.items.forEach((i) => {
        items[i.name] = (items[i.name] || 0) + i.qty;
      });
    });

    callback({ cash, card, qr, items });
  });
}

// =====================
// PDF EXPORT
// =====================
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
      doc.text(`Cash: RM${cash.toFixed(2)}`, 10, y);
      y += 8;
      doc.text(`Card: RM${card.toFixed(2)}`, 10, y);
      y += 8;
      doc.text(`QR: RM${qr.toFixed(2)}`, 10, y);
      y += 10;
      doc.text(`TOTAL: RM${total.toFixed(2)}`, 10, y);
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

// =====================
// MODAL
// =====================
function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

// =====================
// SEARCH
// =====================
document.getElementById("searchInput").addEventListener("input", (e) => {
  const value = e.target.value.toLowerCase().trim();
  const filtered = inventory.filter((item) =>
    item.name.toLowerCase().includes(value),
  );
  renderProducts(filtered);
});

function toggleCart() {
  const cart = document.getElementById("cart-panel");
  if (cart.classList.contains("translate-y-full")) {
    cart.classList.remove("translate-y-full");
    cart.classList.add("translate-y-0");
    document.body.style.overflow = "hidden";
  } else {
    cart.classList.remove("translate-y-0");
    cart.classList.add("translate-y-full");
    document.body.style.overflow = "";
  }
}

function toggleSoldOut(id) {
  const item = inventory.find((i) => i.id === id);
  if (item) {
    item.soldOut = !item.soldOut;
    renderProducts();
  }
}

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
              <span class="font-bold">RM${sale.total.toFixed(2)}</span>
              <span class="text-xs text-gray-500">${sale.date}</span>
            </div>
            <div class="text-sm">${items}</div>
            ${
              sale.orderType === "takeaway"
                ? '<span class="inline-block mt-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded">TA</span>'
                : ""
            }
          </div>
        `;
      })
      .join("");
  });
}

// =====================
// HISTORY MODAL — FULL DETAIL
// =====================
function showOrderHistory() {
  getTodaySales((sales) => {
    const history = document.getElementById("history-list");

    if (sales.length === 0) {
      history.innerHTML =
        '<p class="text-gray-400 text-center py-6">No orders today</p>';
      document.getElementById("history-modal").classList.remove("hidden");
      return;
    }

    // Summary totals
    const totalRevenue = sales.reduce((s, sale) => s + sale.total, 0);
    const totalOrders = sales.length;
    const cashTotal = sales
      .filter((s) => s.payment === "cash")
      .reduce((s, sale) => s + sale.total, 0);
    const cardTotal = sales
      .filter((s) => s.payment === "card")
      .reduce((s, sale) => s + sale.total, 0);
    const qrTotal = sales
      .filter((s) => s.payment === "qr")
      .reduce((s, sale) => s + sale.total, 0);

    const summaryHTML = `
      <div class="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4">
        <h3 class="font-bold text-rose-600 mb-2">Today Summary</h3>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div>Total Orders: <strong>${totalOrders}</strong></div>
          <div>Revenue: <strong class="text-rose-600">RM${totalRevenue.toFixed(2)}</strong></div>
          <div>Cash: <strong>RM${cashTotal.toFixed(2)}</strong></div>
          <div>Card: <strong>RM${cardTotal.toFixed(2)}</strong></div>
          <div>QR: <strong>RM${qrTotal.toFixed(2)}</strong></div>
        </div>
      </div>
    `;

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
            ? `<span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">TA</span>`
            : `<span class="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">Dine In</span>`;

        const itemsHTML = sale.items
          .map((item) => {
            const addonsText = item.addons?.length
              ? `<div class="text-[11px] text-gray-400 pl-2">
                + ${item.addons.map((a) => a.name).join(", ")}
                <span class="text-rose-500">(+RM${item.addonTotal.toFixed(2)})</span>
               </div>`
              : "";

            const itemTA =
              item.orderType === "takeaway"
                ? `<span class="text-[10px] bg-red-100 text-red-500 px-1 rounded">TA</span>`
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
                <span class="font-semibold">RM${item.lineTotal.toFixed(2)}</span>
              </div>
              ${addonsText}
            </div>
          `;
          })
          .join("");

        return `
          <div class="border rounded-xl overflow-hidden mb-3">
            <!-- Header -->
            <div class="flex justify-between items-center p-3 bg-gray-50 border-b">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">#${totalOrders - idx}</span>
                ${taLabel}
                ${discountLabel}
                <span class="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded uppercase">${sale.payment}</span>
              </div>
              <span class="text-xs text-gray-400">${formatTo12Hour(sale.date)}</span>
            </div>

            <!-- Items -->
            <div class="px-3 pt-2 pb-1">${itemsHTML}</div>

            <!-- Totals -->
            <div class="px-3 pb-3 pt-1 space-y-1 text-sm">
              <div class="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>RM${sale.subtotal.toFixed(2)}</span>
              </div>
              ${
                sale.discountAmt > 0
                  ? `<div class="flex justify-between text-yellow-600">
                    <span>Discount (${(sale.discountRate * 100).toFixed(0)}%)</span>
                    <span>-RM${sale.discountAmt.toFixed(2)}</span>
                   </div>`
                  : ""
              }
              <div class="flex justify-between font-bold text-rose-600 border-t pt-1">
                <span>Total</span>
                <span>RM${sale.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    history.innerHTML = summaryHTML + ordersHTML;
    document.getElementById("history-modal").classList.remove("hidden");
  });
}

function closeHistory() {
  document.getElementById("history-modal").classList.add("hidden");
}

function formatTo12Hour(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// =====================
// INVENTORY CRUD
// =====================
let inventoryEditId = null; // null = add new, number = edit existing
let inventorySearchTerm = "";

function openInventoryManager() {
  inventoryEditId = null;
  inventorySearchTerm = "";
  renderInventoryList();
  document.getElementById("inventory-modal").classList.remove("hidden");
}

function closeInventoryManager() {
  document.getElementById("inventory-modal").classList.add("hidden");
  closeItemForm();
}

function renderInventoryList() {
  const container = document.getElementById("inventory-list");
  const searchInput = document.getElementById("inv-search");
  const term = inventorySearchTerm.toLowerCase();

  const filtered = inventory.filter((item) =>
    item.name.toLowerCase().includes(term),
  );

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-gray-400 text-center py-6">No items found</p>`;
    return;
  }

  container.innerHTML = filtered
    .map((item) => {
      const hasHot = item.price > 0;
      const hasIce = item.priceIce > 0;

      let priceText = "";
      if (hasHot && hasIce) {
        priceText = `🔥RM${item.price.toFixed(2)} / 🧊RM${item.priceIce.toFixed(2)}`;
      } else if (!hasHot && hasIce) {
        priceText = `🧊RM${item.priceIce.toFixed(2)}`;
      } else {
        priceText = `RM${item.price.toFixed(2)}`;
      }

      const soldOutBadge = item.soldOut
        ? `<span class="text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded font-bold">SOLD OUT</span>`
        : `<span class="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded font-bold">ACTIVE</span>`;

      const emoji = categoryEmoji[item.category] || "🍽️";

      return `
      <div class="flex items-center gap-3 p-3 border rounded-xl bg-white hover:bg-gray-50">
        <div class="text-2xl shrink-0">${emoji}</div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm truncate">${item.name}</div>
          <div class="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
            <span>${priceText}</span>
            <span class="text-gray-300">|</span>
            <span class="capitalize">${item.category}</span>
            ${soldOutBadge}
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button onclick="openItemForm(${item.id})"
            class="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteItem(${item.id})"
            class="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  // Update footer count
  const footer = document.querySelector(
    "#inventory-modal .border-t.bg-gray-50",
  );
  if (footer)
    footer.innerHTML = `<span class="text-xs text-gray-400">Total items: <strong>${inventory.length}</strong> — Saved to this device</span>`;

  lucide.createIcons();
}

function openItemForm(id = null) {
  inventoryEditId = id;
  const form = document.getElementById("item-form-panel");
  const title = document.getElementById("item-form-title");

  if (id !== null) {
    // Edit mode — fill form
    const item = inventory.find((i) => i.id === id);
    title.innerText = "Edit Item";
    document.getElementById("item-name").value = item.name;
    document.getElementById("item-price").value = item.price || "";
    document.getElementById("item-price-ice").value = item.priceIce || "";
    document.getElementById("item-category").value = item.category || "pastry";
    document.getElementById("item-soldout").checked = item.soldOut;
  } else {
    // Add mode — clear form
    title.innerText = "Add New Item";
    document.getElementById("item-name").value = "";
    document.getElementById("item-price").value = "";
    document.getElementById("item-price-ice").value = "";
    document.getElementById("item-category").value = "pastry";
    document.getElementById("item-soldout").checked = false;
  }

  form.classList.remove("hidden");
}

function closeItemForm() {
  document.getElementById("item-form-panel").classList.add("hidden");
  inventoryEditId = null;
}

function saveItem() {
  const name = document.getElementById("item-name").value.trim();
  const price = parseFloat(document.getElementById("item-price").value) || 0;
  const priceIce =
    parseFloat(document.getElementById("item-price-ice").value) || 0;
  const category = document.getElementById("item-category").value;
  const soldOut = document.getElementById("item-soldout").checked;

  if (!name) {
    alert("Item name is required.");
    return;
  }
  if (price === 0 && priceIce === 0) {
    alert("At least one price (Hot or Ice) is required.");
    return;
  }

  if (inventoryEditId !== null) {
    // Update existing
    const item = inventory.find((i) => i.id === inventoryEditId);
    item.name = name;
    item.price = price;
    item.priceIce = priceIce;
    item.category = category;
    item.soldOut = soldOut;
    saveItemToDB(item); // persist to IndexedDB
  } else {
    // Add new — generate next id
    const maxId = inventory.reduce((max, i) => Math.max(max, i.id), 0);
    const newItem = {
      id: maxId + 1,
      name,
      price,
      priceIce,
      category,
      soldOut,
    };
    inventory.push(newItem);
    saveItemToDB(newItem); // persist to IndexedDB
  }

  closeItemForm();
  renderInventoryList();
  showCategoryScreen();
}

function deleteItem(id) {
  if (!confirm("Delete this item?")) return;
  inventory = inventory.filter((i) => i.id !== id);
  deleteItemFromDB(id); // remove from IndexedDB
  renderInventoryList();
  showCategoryScreen();
}

function toggleSoldOutFromList(id) {
  const item = inventory.find((i) => i.id === id);
  if (item) {
    item.soldOut = !item.soldOut;
    saveItemToDB(item); // persist soldOut change
    renderInventoryList();
  }
}
