// =====================
// DATA STATE
// =====================
let addons = [];
let selectedProduct = null;
let db;
let selectedOrderType = "dinein";

let inventory = [];
let cart = [];

function confirmAddToCart() {
  const selected = [
    ...document.querySelectorAll("#addon-list input:checked"),
  ].map((cb) => addons.find((a) => a.id == cb.value));

  cart.push({
    ...selectedProduct,
    qty: 1,
    orderType: selectedOrderType, // ✅ ADD THIS FIX
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

  document.getElementById("addon-title").innerText = selectedProduct.name;

  renderAddonList();

  document.getElementById("addon-modal").classList.remove("hidden");
}

function renderAddonList() {
  const container = document.getElementById("addon-list");

  container.innerHTML = addons
    .map(
      (a) => `
    <label class="flex justify-between p-2 border rounded-lg">
      <div>
        <input type="checkbox" value="${a.id}" />
        <span class="ml-2">${a.name}</span>
      </div>
      <span class="text-rose-500">$${a.price}</span>
    </label>
  `,
    )
    .join("");
}

fetch("./addons.json")
  .then((res) => res.json())
  .then((data) => {
    addons = data;
  });

function isDrink(id) {
  return id >= 101 && id <= 125;
}

function setOrderType(value) {
  selectedOrderType = value;
}
function openDB() {
  const request = indexedDB.open("faso_db", 1);

  request.onupgradeneeded = function (e) {
    db = e.target.result;

    if (!db.objectStoreNames.contains("sales")) {
      const salesStore = db.createObjectStore("sales", { keyPath: "id" });
      salesStore.createIndex("dateKey", "dateKey", { unique: false });
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
  fetch("./inventory.json")
    .then((res) => res.json())
    .then((data) => {
      inventory = data;

      renderProducts();
      lucide.createIcons();
    })
    .catch((err) => {
      console.error("Error loading inventory JSON:", err);
    });
}

// =====================
// SAVE SALE
// =====================
function saveSale(sale) {
  const tx = db.transaction("sales", "readwrite");
  tx.objectStore("sales").add(sale);
}

// =====================
// PRODUCTS (KEEP STYLE)
// =====================
function renderProducts(list = inventory) {
  const grid = document.getElementById("product-grid");

  const filtered = list.filter((item) => !item.soldOut);

  grid.innerHTML = filtered
    .map(
      (item) => `
    <div onclick="addToCart(${item.id})"
      class="pastry-card ${item.color} bg-white p-5 rounded-2xl shadow-sm border cursor-pointer hover:shadow-md">

      <div class="w-full h-32 bg-gray-50 rounded-xl mb-4 flex items-center justify-center text-4xl">
        🥐
      </div>

      <h3 class="font-bold text-gray-800">${item.name}</h3>
      <p class="text-rose-500 font-bold mt-1">$${item.price.toFixed(2)}</p>

    </div>
  `,
    )
    .join("");
}
// function renderProducts(list = inventory) {
//   const grid = document.getElementById("product-grid");

//   grid.innerHTML = list
//     .map(
//       (item) => `
//     <div onclick="addToCart(${item.id})"
//       class="pastry-card ${item.color} bg-white p-5 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all">

//       <div class="w-full h-32 bg-gray-50 rounded-xl mb-4 flex items-center justify-center text-4xl">
//         🥐
//       </div>

//       <h3 class="font-bold text-gray-800">${item.name}</h3>
//       <p class="text-rose-500 font-bold mt-1">$${item.price.toFixed(2)}</p>

//     </div>
//   `,
//     )
//     .join("");
// }

// =====================
// CART
// =====================
function addToCart(id) {
  const item = inventory.find((i) => i.id === id);

  if (isDrink(id)) {
    openAddonModal(id);
    return;
  }

  cart.push({
    ...item,
    qty: 1,
    orderType: selectedOrderType, // ✅ ALWAYS SAVE HERE
    addons: [],
  });

  renderCart();
}

function renderCart() {
  const container = document.getElementById("cart-items");

  container.innerHTML = cart
    .map((item, idx) => {
      const badge =
        item.orderType === "takeaway"
          ? `<span class="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded">TA</span>`
          : "";

      return `
        <div class="flex justify-between items-start bg-gray-50 p-3 rounded-lg">

          <!-- LEFT SIDE -->
          <div class="min-w-0">

            <div class="flex items-center gap-2">
              <div class="font-bold text-sm truncate">
                ${item.name}
              </div>
              ${badge}
            </div>

            <div class="text-xs text-gray-500">
              $${item.price.toFixed(2)} x ${item.qty}
            </div>

           ${
             item.addons?.length
               ? `
      <div class="text-[11px] text-gray-400 mt-1">
        + ${item.addons.map((a) => a.name).join(", ")}
        <span class="text-rose-500 font-semibold">
          (+$${item.addons.reduce((sum, a) => sum + a.price, 0).toFixed(2)})
        </span>
      </div>
    `
               : ""
           }

          </div>

          <!-- RIGHT SIDE -->
          <div class="flex items-center gap-3 shrink-0">

            <span class="font-bold">
              $${(item.price * item.qty).toFixed(2)}
            </span>

            <button onclick="removeFromCart(${idx})"
              class="text-gray-400 hover:text-red-500">

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

  const finalTotal = sub - sub * discount;

  document.getElementById("total").innerText = `$${finalTotal.toFixed(2)}`;

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

  const total = cart.reduce((a, b) => a + b.price * b.qty, 0);

  const sale = {
    id: Date.now(),
    dateKey: getTodayKey(),
    items: structuredClone(cart),
    payment: paymentMethod,
    orderType, // ✅ ADD THIS
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
// PDF EXPORT (KEEP STYLE SAFE)
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

      doc.text(`Cash: $${cash.toFixed(2)}`, 10, y);
      y += 8;

      doc.text(`Card: $${card.toFixed(2)}`, 10, y);
      y += 8;

      doc.text(`QR: $${qr.toFixed(2)}`, 10, y);
      y += 10;

      doc.text(`TOTAL: $${total.toFixed(2)}`, 10, y);
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
// TAB CONTROL
// =====================

// =====================
// MODAL
// =====================
function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

// =====================
// SEARCH (FIXED)
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
    // Open cart
    cart.classList.remove("translate-y-full");
    cart.classList.add("translate-y-0");
    document.body.style.overflow = "hidden";
  } else {
    // Close cart
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
    renderInventory();
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
              <span class="font-bold">$${sale.total.toFixed(2)}</span>
              <span class="text-xs text-gray-500">${sale.date}</span>
            </div>

            <div class="text-sm">
              ${items}
            </div>

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

function showOrderHistory() {
  getTodaySales((sales) => {
    const history = document.getElementById("history-list");

    history.innerHTML = sales
      .slice()
      .reverse()
      .map(
        (sale) => `
      <div class="border rounded-xl p-3">
        <div class="flex justify-between mb-2">
          <span class="font-bold">${formatTo12Hour(sale.date)}</span>
          <span class="text-green-600 font-bold">
            $${sale.total.toFixed(2)}
          </span>
        </div>

        <div class="text-sm text-gray-500 mb-2">
          ${sale.payment.toUpperCase()}
        </div>

        ${sale.items
          .map(
            (item) => `
          <div class="flex justify-between text-sm">
            <span>
              ${item.name}
              ${item.orderType === "takeaway" ? "(TA)" : ""}
              x${item.qty}
            </span>

            <span>
              $${(item.price * item.qty).toFixed(2)}
            </span>
          </div>
        `,
          )
          .join("")}
      </div>
    `,
      )
      .join("");

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
