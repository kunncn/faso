// =====================
// DATA STATE
// =====================
let addons = [];
let selectedProduct = null;
let selectedTemp = null; // "hot" | "ice" | null
let db;
let selectedOrderType = "dinein";
// const discountAmt = sub * discount;

let inventory = [];
let cart = [];
const priceCategories = [10, 14, 15, 16, 18, 20, 30];
const categoryEmoji = {
  pastry: "🥐",
  savory: "🥪",
  loaf: "🍞",
  coffee: "☕",
  tea: "🍵",
  soda: "🥤",
  matcha: "🍵",
  chocolate: "🍫",
};

// =====================
// STAFF PINS (for bill edit authorization)
// =====================
const STAFF_PINS = {
  3009: "Ko Ko",
  1234: "John",
};

// =====================
// CUSTOMER BIG-SCREEN POPUP
// =====================
let customerPopupMode = "live"; // "live" = current cart, "history" = a past bill

function openCustomerDisplay() {
  customerPopupMode = "live";
  const popup = document.getElementById("customer-popup");
  popup.classList.remove("hidden");
  popup.classList.add("flex");
  renderCustomerPopup();
}

function closeCustomerDisplay() {
  const popup = document.getElementById("customer-popup");
  popup.classList.add("hidden");
  popup.classList.remove("flex");
  customerPopupMode = "live";
}

function renderCustomerPopup() {
  const popup = document.getElementById("customer-popup");
  const body = document.getElementById("customer-popup-body");
  if (!popup || !body) return;
  if (customerPopupMode !== "live") return; // a past bill is showing, don't overwrite it
  // Only render if popup is currently open (saves work while hidden)
  if (popup.classList.contains("hidden")) return;

  if (cart.length === 0) {
    body.innerHTML = `
      <h2 class="text-2xl md:text-3xl font-semibold text-gray-700">Welcome</h2>
      <p class="text-gray-400 mt-2 text-base md:text-lg">Please place your order at the counter</p>
    `;
    return;
  }

  const discount = parseFloat(document.getElementById("discount")?.value || 0);
  const includeDrinks =
    document.getElementById("discountDrinks")?.checked || false;
  const drinkCats = ["coffee", "tea", "matcha", "soda", "chocolate"];

  let sub = 0;
  let discountAmt = 0;

  // scale row text size down a little as the order grows, so it still
  // fits on one screen without scrolling
  const count = cart.length;
  let rowText = "text-lg md:text-xl";
  let rowPad = "py-3";
  if (count > 8 && count <= 14) {
    rowText = "text-base md:text-lg";
    rowPad = "py-2";
  } else if (count > 14) {
    rowText = "text-sm md:text-base";
    rowPad = "py-1.5";
  }

  const rowsHTML = cart
    .map((item) => {
      const addonTotal = item.addons
        ? item.addons.reduce((s, a) => s + a.price, 0)
        : 0;
      const lineTotal = (item.price + addonTotal) * item.qty;
      sub += lineTotal;
      if (
        item.category !== "loaf" &&
        !(drinkCats.includes(item.category) && !includeDrinks)
      ) {
        discountAmt += lineTotal * discount;
      }

      const tempLabel =
        item.temp === "hot" ? " (Hot)" : item.temp === "ice" ? " (Ice)" : "";
      const addonsText = item.addons?.length
        ? `<div class="text-xs md:text-sm text-gray-400">+ ${item.addons.map((a) => a.name).join(", ")}</div>`
        : "";

      return `
        <tr class="border-b border-gray-200">
          <td class="${rowPad} pr-3 text-left ${rowText} text-gray-800 font-medium">
            ${item.name}${tempLabel}
            ${addonsText}
          </td>
          <td class="${rowPad} px-3 text-center ${rowText} text-gray-500">${item.qty}</td>
          <td class="${rowPad} pl-3 text-right ${rowText} text-gray-800 font-semibold">RM${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  const finalTotal = sub - discountAmt;

  const discountLine =
    discount > 0 && discountAmt > 0
      ? `
      <div class="flex justify-between text-gray-500 text-base md:text-lg py-1">
        <span>Subtotal</span><span>RM${sub.toFixed(2)}</span>
      </div>
      <div class="flex justify-between text-gray-500 text-base md:text-lg py-1">
        <span>Discount (${(discount * 100).toFixed(0)}%)</span><span>-RM${discountAmt.toFixed(2)}</span>
      </div>
    `
      : "";

  body.innerHTML = `
    <div class="w-full max-w-3xl">
      <div class="flex justify-between items-baseline border-b border-gray-300 pb-3 mb-1">
        <h2 class="text-xl md:text-2xl font-semibold text-gray-800">Your Order</h2>
        <span class="text-sm text-gray-400">${cart.reduce((t, i) => t + i.qty, 0)} item${cart.reduce((t, i) => t + i.qty, 0) > 1 ? "s" : ""}</span>
      </div>

      <table class="w-full border-collapse">
        <thead>
          <tr class="text-xs md:text-sm text-gray-400 uppercase tracking-wide">
            <th class="text-left font-medium py-2">Item</th>
            <th class="text-center font-medium py-2 w-16">Qty</th>
            <th class="text-right font-medium py-2 w-28">Price</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>

      <div class="border-t border-gray-300 mt-2 pt-3">
        ${discountLine}
        <div class="flex justify-between items-center pt-2 border-t border-gray-200 mt-1">
          <span class="text-lg md:text-xl font-semibold text-gray-700">Total</span>
          <span class="text-3xl md:text-4xl font-bold text-gray-900">RM${finalTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  `;
}

// show a completed bill (from History) in the same full-screen popup
function openBillFullScreen(saleId) {
  getSaleById(saleId, (sale) => {
    if (!sale) return;
    customerPopupMode = "history";
    renderBillPopup(sale);
    const popup = document.getElementById("customer-popup");
    popup.classList.remove("hidden");
    popup.classList.add("flex");
  });
}

function renderBillPopup(sale) {
  const body = document.getElementById("customer-popup-body");

  const rowsHTML = sale.items
    .map((item) => {
      const tempLabel =
        item.temp === "hot" ? " (Hot)" : item.temp === "ice" ? " (Ice)" : "";
      const addonsText = item.addons?.length
        ? `<div class="text-xs md:text-sm text-gray-400">+ ${item.addons.map((a) => a.name).join(", ")}</div>`
        : "";

      return `
        <tr class="border-b border-gray-200">
          <td class="py-3 pr-3 text-left text-lg md:text-xl text-gray-800 font-medium">
            ${item.name}${tempLabel}
            ${addonsText}
          </td>
          <td class="py-3 px-3 text-center text-lg md:text-xl text-gray-500">${item.qty}</td>
          <td class="py-3 pl-3 text-right text-lg md:text-xl text-gray-800 font-semibold">RM${item.lineTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  const discountLine =
    sale.discountAmt > 0
      ? `
      <div class="flex justify-between text-gray-500 text-base md:text-lg py-1">
        <span>Subtotal</span><span>RM${sale.subtotal.toFixed(2)}</span>
      </div>
      <div class="flex justify-between text-gray-500 text-base md:text-lg py-1">
        <span>Discount (${(sale.discountRate * 100).toFixed(0)}%)</span><span>-RM${sale.discountAmt.toFixed(2)}</span>
      </div>
    `
      : "";

  const deletedBanner = sale.deleted
    ? `
      <div class="bg-red-50 border border-red-200 text-red-600 text-sm md:text-base rounded-xl px-4 py-3 mb-3 font-semibold">
        This order was deleted by ${sale.deletedBy} · ${sale.deletedAt}
      </div>
    `
    : "";

  body.innerHTML = `
    <div class="w-full max-w-3xl">
      ${deletedBanner}
      <div class="flex justify-between items-baseline border-b border-gray-300 pb-3 mb-1">
        <h2 class="text-xl md:text-2xl font-semibold text-gray-800">Order Receipt</h2>
        <span class="text-sm text-gray-400">${formatTo12Hour(sale.date)}</span>
      </div>

      <table class="w-full border-collapse">
        <thead>
          <tr class="text-xs md:text-sm text-gray-400 uppercase tracking-wide">
            <th class="text-left font-medium py-2">Item</th>
            <th class="text-center font-medium py-2 w-16">Qty</th>
            <th class="text-right font-medium py-2 w-28">Price</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>

      <div class="border-t border-gray-300 mt-2 pt-3">
        ${discountLine}
        <div class="flex justify-between items-center pt-2 border-t border-gray-200 mt-1">
          <span class="text-lg md:text-xl font-semibold text-gray-700">Total</span>
          <span class="text-3xl md:text-4xl font-bold text-gray-900">RM${sale.total.toFixed(2)}</span>
        </div>
        <div class="text-sm text-gray-400 mt-2 text-right uppercase">${sale.payment}</div>
      </div>
    </div>
  `;
}

function showThankYouPopup(total) {
  const popup = document.getElementById("customer-popup");
  if (!popup || popup.classList.contains("hidden")) return; // only if open

  const body = document.getElementById("customer-popup-body");
  body.innerHTML = `
    <h2 class="text-2xl md:text-3xl font-semibold text-gray-800">Thank You</h2>
    <p class="text-gray-500 mt-2 text-base md:text-lg">Total Paid: <span class="font-semibold text-gray-900">RM${total.toFixed(2)}</span></p>
  `;

  setTimeout(() => renderCustomerPopup(), 4000);
}

function resetDB() {
  if (!confirm("Reset all inventory data?")) return;
  const tx = db.transaction("inventory", "readwrite");
  tx.objectStore("inventory").clear();
  tx.oncomplete = () => {
    alert("Done! Reloading...");
    location.reload();
  };
}

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
          class="flex-1 py-2 rounded-xl border-2 font-bold text-sm ${selectedTemp === "hot" ? "border-[#008697] bg-[#e6f2f3] text-[#00707f]" : "border-gray-200 text-gray-400"}">
          🔥 Hot — RM${selectedProduct.price.toFixed(2)}
        </button>
        <button id="btn-ice" onclick="selectTemp('ice')"
          class="flex-1 py-2 rounded-xl border-2 font-bold text-sm ${selectedTemp === "ice" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"}">
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
    <label class="flex justify-between p-2 border rounded-lg cursor-pointer">
      <div>
        <input type="checkbox" value="${a.id}" />
        <span class="ml-2">${a.name}</span>
      </div>
      <span class="text-[#008697]">RM${a.price.toFixed(2)}</span>
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
  const item = inventory.find((i) => i.id === id);
  return (
    item &&
    ["coffee", "tea", "matcha", "soda", "chocolate"].includes(item.category)
  );
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
    cleanupOldSales();
  };
}

// keep only the last 3 months of sales; older records are removed
function cleanupOldSales() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  const tx = db.transaction("sales", "readwrite");
  const store = tx.objectStore("sales");
  const req = store.getAll();
  req.onsuccess = function () {
    req.result.forEach((sale) => {
      if (sale.dateKey < cutoffKey) store.delete(sale.id);
    });
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

// Get a single sale by id
function getSaleById(id, callback) {
  const tx = db.transaction("sales", "readonly");
  const req = tx.objectStore("sales").get(id);
  req.onsuccess = function () {
    callback(req.result);
  };
}

// Update an existing sale (used for bill edit)
function updateSaleInDB(sale, callback) {
  const tx = db.transaction("sales", "readwrite");
  tx.objectStore("sales").put(sale);
  tx.oncomplete = function () {
    if (callback) callback();
  };
}

// Get every sale ever stored (used by the report, which spans months)
function getAllSales(callback) {
  const tx = db.transaction("sales", "readonly");
  const req = tx.objectStore("sales").getAll();
  req.onsuccess = function () {
    callback(req.result);
  };
}

// =====================
// SALES REPORT (weekly/daily comparison + charts + Excel export)
// =====================
let currentReportData = null;
let reportChartWeek = null;
let reportChartDay = null;
const REPORT_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REPORT_COLORS = [
  "#008697",
  "#C0504D",
  "#9BBB59",
  "#8064A2",
  "#4BACC6",
  "#F79646",
  "#264478",
];

function openSalesReport() {
  const monthInput = document.getElementById("report-month");
  if (!monthInput.value) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  document.getElementById("report-modal").classList.remove("hidden");
  generateSalesReport();
}

function closeSalesReport() {
  document.getElementById("report-modal").classList.add("hidden");
}

function generateSalesReport() {
  const monthVal = document.getElementById("report-month").value; // "YYYY-MM"
  if (!monthVal) return;
  const [year, month] = monthVal.split("-").map(Number); // month is 1-12

  getAllSales((allSales) => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const numWeeks = Math.ceil(daysInMonth / 7);
    // matrix[dayIdx 0=Mon..6=Sun][weekIdx 0-based] = total sales
    const matrix = REPORT_DAY_NAMES.map(() => Array(numWeeks).fill(0));

    allSales.forEach((sale) => {
      if (sale.deleted) return;
      const d = new Date(sale.dateKey + "T00:00:00");
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return;
      const dayOfMonth = d.getDate();
      const weekIdx = Math.ceil(dayOfMonth / 7) - 1;
      const jsDay = d.getDay(); // 0=Sun..6=Sat
      const dayIdx = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0..Sun=6
      matrix[dayIdx][weekIdx] += sale.total;
    });

    currentReportData = { year, month, numWeeks, matrix };
    renderSalesReport();
  });
}

function renderSalesReport() {
  if (!currentReportData) return;
  const { year, month, numWeeks, matrix } = currentReportData;

  let totalSales = 0;
  let daysWithSales = 0;
  matrix.forEach((row) =>
    row.forEach((v) => {
      if (v > 0) {
        totalSales += v;
        daysWithSales++;
      }
    }),
  );
  const avgPerDay = daysWithSales > 0 ? totalSales / daysWithSales : 0;

  // highlight the best-selling day in each week column
  const maxPerWeek = [];
  for (let w = 0; w < numWeeks; w++) {
    let max = 0;
    for (let i = 0; i < 7; i++) if (matrix[i][w] > max) max = matrix[i][w];
    maxPerWeek.push(max);
  }

  let theadWeeks = "";
  for (let w = 1; w <= numWeeks; w++)
    theadWeeks += `<th class="border px-3 py-2 text-sm">Week ${w}</th>`;

  let rows = "";
  REPORT_DAY_NAMES.forEach((day, i) => {
    let cells = "";
    for (let w = 0; w < numWeeks; w++) {
      const v = matrix[i][w];
      const isMax = v > 0 && v === maxPerWeek[w];
      cells += `<td class="border px-3 py-2 text-sm text-right ${isMax ? "bg-yellow-200 font-bold" : ""}">${v > 0 ? v.toFixed(2) : ""}</td>`;
    }
    rows += `<tr><td class="border px-3 py-2 text-sm font-semibold bg-gray-50">${day}</td>${cells}</tr>`;
  });

  if (totalSales === 0) {
    document.getElementById("report-body").innerHTML = `
      <p class="text-gray-400 text-center py-10">No sales data for this month.</p>
    `;
    return;
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  document.getElementById("report-body").innerHTML = `
    <h3 class="font-bold text-gray-700 mb-3">Sales Comparison - ${monthLabel}</h3>
    <div class="overflow-x-auto">
      <table class="border-collapse w-full mb-2 min-w-[500px]">
        <thead><tr class="bg-gray-100"><th class="border px-3 py-2 text-sm text-left">Day</th>${theadWeeks}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="flex gap-3 justify-end text-sm mb-6 flex-wrap">
      <div class="bg-[#e6f2f3] px-4 py-2 rounded-lg"><strong>Total Sales:</strong> RM${totalSales.toFixed(2)}</div>
      <div class="bg-[#e6f2f3] px-4 py-2 rounded-lg"><strong>Average per day:</strong> RM${avgPerDay.toFixed(2)}</div>
    </div>
    <div class="border rounded-xl p-3 mb-6">
      <canvas id="chart-by-week" height="220"></canvas>
    </div>
    <div class="border rounded-xl p-3">
      <canvas id="chart-by-day" height="220"></canvas>
    </div>
  `;

  drawReportCharts();
}

function drawReportCharts() {
  const { numWeeks, matrix } = currentReportData;
  const weekLabels = Array.from(
    { length: numWeeks },
    (_, i) => `Week ${i + 1}`,
  );

  const byWeekDatasets = REPORT_DAY_NAMES.map((day, i) => ({
    label: day,
    data: matrix[i],
    backgroundColor: REPORT_COLORS[i % REPORT_COLORS.length],
  }));

  if (reportChartWeek) reportChartWeek.destroy();
  reportChartWeek = new Chart(document.getElementById("chart-by-week"), {
    type: "bar",
    data: { labels: weekLabels, datasets: byWeekDatasets },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: "Comparison by Week" } },
    },
  });

  const byDayDatasets = weekLabels.map((wk, wIdx) => ({
    label: wk,
    data: REPORT_DAY_NAMES.map((_, dIdx) => matrix[dIdx][wIdx]),
    backgroundColor: REPORT_COLORS[wIdx % REPORT_COLORS.length],
  }));

  if (reportChartDay) reportChartDay.destroy();
  reportChartDay = new Chart(document.getElementById("chart-by-day"), {
    type: "bar",
    data: { labels: REPORT_DAY_NAMES, datasets: byDayDatasets },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: "Comparison by Day" } },
    },
  });
}

function exportSalesReport() {
  if (!currentReportData) return;
  const { year, month, numWeeks, matrix } = currentReportData;

  let totalSales = 0;
  let daysWithSales = 0;
  matrix.forEach((row) =>
    row.forEach((v) => {
      if (v > 0) {
        totalSales += v;
        daysWithSales++;
      }
    }),
  );
  const avgPerDay = daysWithSales > 0 ? totalSales / daysWithSales : 0;

  const weekHeaders = Array.from(
    { length: numWeeks },
    (_, i) => `Week ${i + 1}`,
  );
  const rows = [["Day", ...weekHeaders, "", "Total Sales", "Average per day"]];

  REPORT_DAY_NAMES.forEach((day, i) => {
    const rowVals = matrix[i].map((v) => (v > 0 ? Number(v.toFixed(2)) : ""));
    const extra =
      i === 0
        ? ["", Number(totalSales.toFixed(2)), Number(avgPerDay.toFixed(2))]
        : ["", "", ""];
    rows.push([day, ...rowVals, ...extra]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 8 },
    ...weekHeaders.map(() => ({ wch: 10 })),
    { wch: 2 },
    { wch: 14 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
  XLSX.writeFile(
    wb,
    `faso-sales-report-${year}-${String(month).padStart(2, "0")}.xlsx`,
  );
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
        priceLabel = `<p class="text-[#008697] font-bold mt-1 text-xs">🔥RM${item.price.toFixed(2)} / 🧊RM${item.priceIce.toFixed(2)}</p>`;
      } else if (!hasHot && hasIce) {
        priceLabel = `<p class="text-blue-500 font-bold mt-1">🧊 RM${item.priceIce.toFixed(2)}</p>`;
      } else {
        priceLabel = `<p class="text-[#008697] font-bold mt-1">RM${item.price.toFixed(2)}</p>`;
      }

      return `
        <div onclick="addToCart(${item.id})"
          class="pastry-card ${item.color} bg-white p-5 rounded-2xl border cursor-pointer">
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
          ? `<span class="text-[10px] bg-[#cce6e9] text-[#00707f] px-2 py-0.5 rounded">🔥 Hot</span>`
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
                    <span class="text-[#008697] font-semibold">(+RM${addonTotal.toFixed(2)})</span>
                   </div>`
                : ""
            }
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <span class="font-bold">RM${lineTotal.toFixed(2)}</span>
            <button onclick="removeFromCart(${idx})" class="text-gray-400">
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

  // const discountAmt = sub * discount;
  const includeDrinks =
    document.getElementById("discountDrinks")?.checked || false;
  const drinkCats = ["coffee", "tea", "matcha", "soda", "chocolate"];
  const discountAmt = cart.reduce((total, item) => {
    if (item.category === "loaf") return total;
    if (drinkCats.includes(item.category) && !includeDrinks) return total;
    const addonTotal = item.addons
      ? item.addons.reduce((s, a) => s + a.price, 0)
      : 0;
    return total + (item.price + addonTotal) * item.qty * discount;
  }, 0);

  const finalTotal = sub - discountAmt;

  document.getElementById("total").innerText = `RM${finalTotal.toFixed(2)}`;

  lucide.createIcons();
  document.getElementById("order-count").innerText = cart.reduce(
    (total, item) => total + item.qty,
    0,
  );

  // keep the customer big-screen popup in sync (only does work if open)
  renderCustomerPopup();
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

  if (editingSaleId !== null) {
    openEditBillModal();
    return;
  }

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

  const includeDrinks =
    document.getElementById("discountDrinks")?.checked || false;
  const drinkCats = ["coffee", "tea", "matcha", "soda", "chocolate"];
  const discountAmt = cart.reduce((total, item) => {
    if (item.category === "loaf") return total;
    if (drinkCats.includes(item.category) && !includeDrinks) return total;
    const addonTotal = item.addons
      ? item.addons.reduce((s, a) => s + a.price, 0)
      : 0;
    return total + (item.price + addonTotal) * item.qty * discountRate;
  }, 0);
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
      temp: item.temp || null,
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
    editedBy: null,
    editedAt: null,
  };

  saveSale(sale);
  renderOrderHistory();

  // show thank-you on customer big-screen popup (if open)
  showThankYouPopup(finalTotal);

  cart = [];
  renderCart();
  // Reset form to default values
  document.getElementById("orderType").value = "dinein";
  selectedOrderType = "dinein";

  document.getElementById("discount").value = "0";

  document.getElementById("discountDrinks").checked = false;

  document.getElementById("paymentMethod").value = "cash";

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

// same as getTodaySales but for any chosen date (used by the History date picker)
function getSalesByDate(dateKey, callback) {
  const tx = db.transaction("sales", "readonly");
  const store = tx.objectStore("sales");
  const request = store.getAll();

  request.onsuccess = function () {
    const all = request.result;
    const filtered = all.filter((s) => s.dateKey === dateKey);
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
      if (s.deleted) return;
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
function showOrderHistory(dateKey) {
  const targetDate = dateKey || getTodayKey();

  // keep the date picker in sync with what's being shown
  const dateInput = document.getElementById("history-date");
  if (dateInput) dateInput.value = targetDate;

  getSalesByDate(targetDate, (sales) => {
    const history = document.getElementById("history-list");

    if (sales.length === 0) {
      history.innerHTML = `<p class="text-gray-400 text-center py-6">No orders found for ${targetDate}</p>`;
      document.getElementById("history-modal").classList.remove("hidden");
      return;
    }

    // Summary totals (deleted orders don't count)
    const activeSales = sales.filter((s) => !s.deleted);
    const totalRevenue = activeSales.reduce((s, sale) => s + sale.total, 0);
    const totalOrders = activeSales.length;
    const cashTotal = activeSales
      .filter((s) => s.payment === "cash")
      .reduce((s, sale) => s + sale.total, 0);
    const cardTotal = activeSales
      .filter((s) => s.payment === "card")
      .reduce((s, sale) => s + sale.total, 0);
    const qrTotal = activeSales
      .filter((s) => s.payment === "qr")
      .reduce((s, sale) => s + sale.total, 0);

    const summaryHTML = `
      <div class="bg-[#e6f2f3] border border-[#99cdd3] rounded-xl p-4 mb-4">
        <h3 class="font-bold text-[#00707f] mb-2">${targetDate === getTodayKey() ? "Today Summary" : `Summary — ${targetDate}`}</h3>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div>Total Orders: <strong>${totalOrders}</strong></div>
          <div>Revenue: <strong class="text-[#00707f]">RM${totalRevenue.toFixed(2)}</strong></div>
          <div>Cash: <strong>RM${cashTotal.toFixed(2)}</strong></div>
          <div>Card: <strong>RM${cardTotal.toFixed(2)}</strong></div>
          <div>QR: <strong>RM${qrTotal.toFixed(2)}</strong></div>
        </div>
      </div>
    `;

    const allCount = sales.length;

    const ordersHTML = sales
      .slice()
      .reverse()
      .map((sale, idx) => {
        // deleted orders render as a compact red line instead of a full card
        if (sale.deleted) {
          return `
            <div class="text-xs text-gray-400 py-1">
              #${allCount - idx} ·
              <button onclick="openBillFullScreen(${sale.id})"
                class="text-red-500 underline font-semibold">
                Deleted Order · RM${sale.total.toFixed(2)} · ${formatTo12Hour(sale.date)}
              </button>
            </div>
          `;
        }

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
                <span class="text-[#008697]">(+RM${item.addonTotal.toFixed(2)})</span>
               </div>`
              : "";

            const itemTA =
              item.orderType === "takeaway"
                ? `<span class="text-[10px] bg-red-100 text-red-500 px-1 rounded">TA</span>`
                : "";

            const itemTemp =
              item.temp === "hot"
                ? `<span class="text-[10px] bg-[#cce6e9] text-[#008697] px-1 rounded">🔥 Hot</span>`
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

        const editedBadge = sale.editedBy
          ? `<div class="text-[11px] text-gray-400 mt-1">✎ Edited by <strong>${sale.editedBy}</strong> · ${sale.editedAt}</div>`
          : "";

        return `
          <div class="border rounded-xl overflow-hidden mb-3">
            <!-- Header -->
            <div class="flex justify-between items-center p-3 bg-gray-50 border-b">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">#${allCount - idx}</span>
                ${taLabel}
                ${discountLabel}
                <span class="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded uppercase">${sale.payment}</span>
              </div>
              <span class="text-xs text-gray-400">${formatTo12Hour(sale.date)}</span>
            </div>

            <!-- Items -->
            <div class="px-3 pt-2 pb-1">${itemsHTML}</div>

            <!-- Totals -->
            <div class="px-3 pb-2 pt-1 space-y-1 text-sm">
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
              <div class="flex justify-between font-bold text-[#00707f] border-t pt-1">
                <span>Total</span>
                <span>RM${sale.total.toFixed(2)}</span>
              </div>
            </div>

            <!-- Edit bill row -->
            <div class="px-3 pb-3 flex items-center justify-between gap-2 flex-wrap">
              ${editedBadge || "<span></span>"}
              <div class="flex gap-2">
                <button onclick="openBillFullScreen(${sale.id})"
                  title="Full Screen"
                  class="bg-[#008697] text-white p-2 rounded-lg">
                  <i data-lucide="maximize-2" class="w-4 h-4"></i>
                </button>
                <button onclick="editBillInCart(${sale.id})"
                  title="Edit Order"
                  class="bg-gray-800 text-white p-2 rounded-lg">
                  <i data-lucide="pencil" class="w-4 h-4"></i>
                </button>
                <button onclick="openDeleteConfirmModal(${sale.id})"
                  title="Delete"
                  class="bg-red-600 text-white p-2 rounded-lg">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    history.innerHTML = summaryHTML + ordersHTML;
    document.getElementById("history-modal").classList.remove("hidden");
    lucide.createIcons();
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
// EDIT BILL (change payment + record who edited)
// =====================
let editBillSaleId = null; // kept for backward compat, not used by new flow
let editingSaleId = null; // id of the sale currently loaded into Current Order for editing
let editingSaleOriginal = null;

// pull a completed bill's items into the Current Order cart so staff can edit it
function editBillInCart(saleId) {
  getSaleById(saleId, (sale) => {
    if (!sale) return;

    cart = sale.items.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      category: item.category,
      qty: item.qty,
      orderType: item.orderType,
      temp: item.temp || null,
      addons: item.addons || [],
    }));

    editingSaleId = sale.id;
    editingSaleOriginal = sale;

    document.getElementById("discount").value = sale.discountRate || "0";
    document.getElementById("discountDrinks").checked = false;
    document.getElementById("paymentMethod").value = sale.payment;
    document.getElementById("orderType").value = sale.orderType;
    selectedOrderType = sale.orderType;

    closeHistory();
    renderCart();

    const banner = document.getElementById("edit-banner");
    banner.classList.remove("hidden");
    document.getElementById("edit-banner-text").innerText =
      `Editing Order · ${formatTo12Hour(sale.date)}`;
    document.getElementById("processSaleBtn").innerText = "SAVE EDIT";

    if (window.innerWidth < 768) {
      document
        .getElementById("cart-panel")
        .classList.remove("translate-y-full");
      document.getElementById("cart-panel").classList.add("translate-y-0");
    }
  });
}

// clears the cart and returns the order form to normal "new sale" mode
function resetOrderForm() {
  editingSaleId = null;
  editingSaleOriginal = null;
  cart = [];
  renderCart();
  document.getElementById("edit-banner").classList.add("hidden");
  document.getElementById("processSaleBtn").innerText = "COMPLETE SALE";
  document.getElementById("orderType").value = "dinein";
  selectedOrderType = "dinein";
  document.getElementById("discount").value = "0";
  document.getElementById("discountDrinks").checked = false;
  document.getElementById("paymentMethod").value = "cash";
}

function cancelEditBill() {
  resetOrderForm();
}

// opens the PIN-confirm modal (used both for a fresh sale is not needed here,
// only for confirming an edit to an existing bill)
function openEditBillModal() {
  document.getElementById("edit-staff-pin").value = "";
  document.getElementById("edit-bill-error").classList.add("hidden");
  document.getElementById("edit-bill-modal").classList.remove("hidden");
}

function closeEditBillModal() {
  document.getElementById("edit-bill-modal").classList.add("hidden");
}

function saveEditBill() {
  const pin = document.getElementById("edit-staff-pin").value.trim();
  const staffName = STAFF_PINS[pin];
  const errorEl = document.getElementById("edit-bill-error");

  if (!staffName) {
    errorEl.innerText = "Wrong PIN. Try again.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (cart.length === 0) {
    errorEl.innerText = "Order is empty.";
    errorEl.classList.remove("hidden");
    return;
  }

  const paymentMethod = document.getElementById("paymentMethod").value;
  const orderType = document.getElementById("orderType").value;
  const discountRate = parseFloat(
    document.getElementById("discount")?.value || 0,
  );
  const includeDrinks =
    document.getElementById("discountDrinks")?.checked || false;
  const drinkCats = ["coffee", "tea", "matcha", "soda", "chocolate"];

  const sub = cart.reduce((total, item) => {
    const addonTotal = item.addons
      ? item.addons.reduce((s, a) => s + a.price, 0)
      : 0;
    return total + (item.price + addonTotal) * item.qty;
  }, 0);

  const discountAmt = cart.reduce((total, item) => {
    if (item.category === "loaf") return total;
    if (drinkCats.includes(item.category) && !includeDrinks) return total;
    const addonTotal = item.addons
      ? item.addons.reduce((s, a) => s + a.price, 0)
      : 0;
    return total + (item.price + addonTotal) * item.qty * discountRate;
  }, 0);

  const finalTotal = sub - discountAmt;

  getSaleById(editingSaleId, (sale) => {
    if (!sale) return;

    sale.items = structuredClone(cart).map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      qty: item.qty,
      orderType: item.orderType,
      category: item.category,
      temp: item.temp || null,
      addons: item.addons || [],
      addonTotal: item.addons
        ? item.addons.reduce((s, a) => s + a.price, 0)
        : 0,
      lineTotal:
        (item.price +
          (item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0)) *
        item.qty,
    }));
    sale.payment = paymentMethod;
    sale.orderType = orderType;
    sale.subtotal = sub;
    sale.discountRate = discountRate;
    sale.discountAmt = discountAmt;
    sale.total = finalTotal;
    sale.editedBy = staffName;
    sale.editedAt = new Date().toLocaleString();

    updateSaleInDB(sale, () => {
      closeEditBillModal();
      resetOrderForm();
      renderOrderHistory();
      showOrderHistory(sale.dateKey); // reopen history on the same date so the "Edited by" badge is visible right away
    });
  });
}

// =====================
// DELETE ORDER (soft delete — keeps the record for audit, just flags it)
// =====================
let deleteBillSaleId = null;

function openDeleteConfirmModal(saleId) {
  deleteBillSaleId = saleId;
  document.getElementById("delete-staff-pin").value = "";
  document.getElementById("delete-bill-error").classList.add("hidden");
  document.getElementById("delete-confirm-modal").classList.remove("hidden");
}

function closeDeleteConfirmModal() {
  document.getElementById("delete-confirm-modal").classList.add("hidden");
  deleteBillSaleId = null;
}

function confirmDeleteBill() {
  const pin = document.getElementById("delete-staff-pin").value.trim();
  const staffName = STAFF_PINS[pin];
  const errorEl = document.getElementById("delete-bill-error");

  if (!staffName) {
    errorEl.innerText = "Wrong PIN. Try again.";
    errorEl.classList.remove("hidden");
    return;
  }

  getSaleById(deleteBillSaleId, (sale) => {
    if (!sale) return;
    sale.deleted = true;
    sale.deletedBy = staffName;
    sale.deletedAt = new Date().toLocaleString();

    updateSaleInDB(sale, () => {
      closeDeleteConfirmModal();
      renderOrderHistory();
      showOrderHistory(sale.dateKey);
    });
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
      <div class="flex items-center gap-3 p-3 border rounded-xl bg-white">
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
            class="p-2 rounded-lg bg-blue-50 text-blue-600">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteItem(${item.id})"
            class="p-2 rounded-lg bg-red-50 text-red-500">
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
