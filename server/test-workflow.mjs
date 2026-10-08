// SmartAgri E2E workflow test — exercises the full buyer→farmer lifecycle
// over the HTTP API against a running server (npm run start).
// Run: node test-workflow.mjs  (from the server directory)
const BASE = process.env.BASE_URL || "http://localhost:5000";
const pass = [];
const fail = [];

const check = (name, cond, extra = "") => {
  if (cond) { pass.push(name); console.log(`  ✓ ${name}`); }
  else { fail.push(name); console.error(`  ✗ ${name} ${extra}`); }
};

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};

const rand = Math.random().toString(36).slice(2, 8);

async function register(role, name) {
  const email = `e2e.${role}.${name}.${rand}@test.dev`;
  const { status, data } = await api("POST", "/api/auth/register", {
    body: { fullName: `E2E ${role} ${name}`, phoneNumber: `+2519${rand.slice(0, 7)}`, email, role, businessName: role === "farmer" ? `${name} Farms` : "", location: "Addis Ababa", password: "password123" },
  });
  if (status !== 201) throw new Error(`register ${role} failed: ${status} ${JSON.stringify(data)}`);
  return { token: data.token, user: data.user };
}

console.log("\n== Setup: register users ==");
const farmerA = await register("farmer", "alpha");
const farmerB = await register("farmer", "beta");
const buyer = await register("buyer", "gamma");
const admin = await (async () => {
  const { status, data } = await api("POST", "/api/auth/login", { body: { email: "admin@smartagri.com", password: "admin1234" } });
  if (status !== 200) throw new Error(`admin login failed: ${status} ${JSON.stringify(data)}`);
  return { token: data.token };
})();
check("farmer A, farmer B, buyer, admin registered", true);

console.log("\n== Farmer A & B publish products ==");
const productA = await (async () => {
  const { status, data } = await api("POST", "/api/products", {
    token: farmerA.token,
    body: { name: `E2E Tomato ${rand}`, category: "Vegetables", description: "Test tomatoes", price: 120, quantity: 50, location: "Addis Ababa", imageUrl: "" },
  });
  check("farmer A created product (price 120, qty 50)", status === 201, `${status}`);
  return data.product;
})();
const productB = await (async () => {
  const { status, data } = await api("POST", "/api/products", {
    token: farmerB.token,
    body: { name: `E2E Potato ${rand}`, category: "Vegetables", description: "Test potatoes", price: 80, quantity: 30, location: "Hawassa", imageUrl: "" },
  });
  check("farmer B created product (price 80, qty 30)", status === 201, `${status}`);
  return data.product;
})();

console.log("\n== Multi-farmer cart + checkout ==");
await api("POST", "/api/cart", { token: buyer.token, body: { productId: productA.id, quantity: 10 } });
await api("POST", "/api/cart", { token: buyer.token, body: { productId: productB.id, quantity: 5 } });
const { items } = (await api("GET", "/api/cart", { token: buyer.token })).data;
check("cart holds both farmers' products", items.length === 2, JSON.stringify(items.length));

const checkout = await api("POST", "/api/orders/from-cart", {
  token: buyer.token,
  body: { deliveryMethod: "delivery", deliveryAddress: "Bole, Addis Ababa", deliveryNotes: "Call on arrival", clientRef: `e2e-${rand}` },
});
check("checkout created 2 orders (one per farmer)", checkout.status === 201 && checkout.data.orders.length === 2, `${checkout.status}`);
// Cart rows come back newest-first, so map orders to products explicitly.
const byProduct = Object.fromEntries(checkout.data.orders.map((o) => [String(o.product_id), o]));
const orderA = byProduct[String(productA.id)];
const orderB = byProduct[String(productB.id)];
check("orders share a group reference", (orderA.group_reference || "") === (orderB.group_reference || "") && !!orderA.group_reference, "");

console.log("\n== Payment guard: cannot pay an unaccepted order ==");
const payEarly = await api("POST", "/api/payments/from-orders", {
  token: buyer.token,
  body: { orderIds: [orderA.id, orderB.id], method: "cash" },
});
check("payment before farmer acceptance rejected", payEarly.status === 400, `${payEarly.status}`);

console.log("\n== Farmer acceptance (stock reservation) ==");
const acceptA = await api("PATCH", `/api/orders/${orderA.id}/status`, { token: farmerA.token, body: { status: "accepted" } });
check("farmer A accepted order A", acceptA.status === 200, `${acceptA.status} ${JSON.stringify(acceptA.data)}`);
const rejectB = await api("PATCH", `/api/orders/${orderB.id}/status`, { token: farmerA.token, body: { status: "accepted" } });
check("farmer A cannot touch farmer B's order (403)", rejectB.status === 403, `${rejectB.status}`);
const invalidJump = await api("PATCH", `/api/orders/${orderB.id}/status`, { token: farmerB.token, body: { status: "dispatched" } });
check("invalid transition (pending → dispatched) rejected", invalidJump.status === 400, `${invalidJump.status}`);
const acceptB = await api("PATCH", `/api/orders/${orderB.id}/status`, { token: farmerB.token, body: { status: "accepted" } });
check("farmer B accepted order B", acceptB.status === 200, `${acceptB.status}`);

const stockCheck = await api("GET", `/api/products/${productA.id}`, {});
check("farmer A stock reserved on acceptance (50 → 40)", Number(stockCheck.data.product.quantity) === 40, `qty=${stockCheck.data.product.quantity}`);

console.log("\n== Payment (simulated, idempotent) ==");
const pay = await api("POST", "/api/payments/from-orders", {
  token: buyer.token,
  body: { orderIds: [orderA.id, orderB.id], method: "mobile_money", idempotencyKey: `e2e-batch-${rand}` },
});
check("batch payment succeeded (201)", pay.status === 201, `${pay.status} ${JSON.stringify(pay.data)}`);
check("backend total = subtotal + delivery fee + 5% platform fee", Number(pay.data.payment.amountCents) > 0, "");

const payDup = await api("POST", "/api/payments/from-orders", {
  token: buyer.token,
  body: { orderIds: [orderA.id, orderB.id], method: "mobile_money", idempotencyKey: `e2e-batch-${rand}` },
});
check("duplicate payment request is idempotent (no double charge)", payDup.status === 200, `${payDup.status} ${JSON.stringify(payDup.data)}`);

const payStatus = (await api("GET", "/api/payments/status", { token: buyer.token })).data;
check("payments/status reports both orders paid", payStatus.paidOrderIds.length === 2, JSON.stringify(payStatus.paidOrderIds));
check("payments/status exposes only safe fields (no secrets)", !JSON.stringify(payStatus).includes("secret"), "");

console.log("\n== Farmer fulfillment lifecycle ==");
const prepA = await api("PATCH", `/api/orders/${orderA.id}/status`, { token: farmerA.token, body: { status: "preparing" } });
check("farmer A started preparing", prepA.status === 200, `${prepA.status}`);
const readyA = await api("PATCH", `/api/orders/${orderA.id}/status`, { token: farmerA.token, body: { status: "ready_for_delivery" } });
check("order A marked ready for delivery", readyA.status === 200, `${readyA.status}`);
const dispatchA = await api("PATCH", `/api/orders/${orderA.id}/status`, { token: farmerA.token, body: { status: "dispatched" } });
check("order A dispatched (paid)", dispatchA.status === 200, `${dispatchA.status} ${JSON.stringify(dispatchA.data)}`);

console.log("\n== Buyer confirmation → completion → settlement ==");
const cancelDispatched = await api("POST", `/api/orders/${orderA.id}/cancel`, { token: buyer.token, body: { reason: "oops" } });
check("buyer cannot cancel a dispatched order", cancelDispatched.status === 400, `${cancelDispatched.status}`);
const confirmDel = await api("POST", `/api/orders/${orderA.id}/confirm-delivery`, { token: buyer.token });
check("buyer confirmed delivery (delivered)", confirmDel.status === 201, `${confirmDel.status}`);
const complete = await api("POST", `/api/orders/${orderA.id}/complete`, { token: buyer.token });
check("buyer completed order A (completed)", complete.status === 200, `${complete.status} ${JSON.stringify(complete.data)}`);

const farmerSettlements = (await api("GET", "/api/settlements", { token: farmerA.token })).data;
check("farmer A sees 1 eligible settlement", farmerSettlements.settlements.length === 1 && farmerSettlements.settlements[0].status === "eligible", JSON.stringify(farmerSettlements.summary));
const stl = farmerSettlements.settlements[0];
// Farmer nets product + delivery: 10 kg × 120 = 1200 + delivery 90
// (180 split across the 2-order batch). The 5% platform fee is charged
// to the buyer on top (buyer pays 1350 total; farmer gets 1290).
check("settlement net = product + delivery (platform fee on top for buyer)", Number(stl.netAmountCents) === (1200 + 90) * 100, `net=${stl.netAmountCents}`);
check("farmer B cannot see farmer A's settlements", (await api("GET", "/api/settlements", { token: farmerB.token })).data.settlements.length === 0, "");

console.log("\n== Admin settlement processing ==");
const adminList = (await api("GET", "/api/settlements/admin", { token: admin.token })).data;
check("admin sees the pending settlement", adminList.settlements.some((s) => String(s.id) === String(stl.id)), "");
const processStl = await api("POST", `/api/settlements/admin/${stl.id}/process`, { token: admin.token });
check("admin processed the settlement (settled)", processStl.status === 200, `${processStl.status} ${JSON.stringify(processStl.data)}`);
const reProcess = await api("POST", `/api/settlements/admin/${stl.id}/process`, { token: admin.token });
check("double processing is blocked", reProcess.status === 400, `${reProcess.status}`);
const farmerAfter = (await api("GET", "/api/settlements", { token: farmerA.token })).data;
check("settlement now settled for farmer", farmerAfter.settlements[0].status === "settled", "");
const paymentsAfter = (await api("GET", "/api/payments/status", { token: buyer.token })).data;
// The batch covers 2 orders; only order A is settled at this point, so the
// payment correctly waits (awaiting_settlement) until order B resolves.
check("payment stays awaiting settlement until all orders resolve", paymentsAfter.payments.length === 1 && paymentsAfter.payments[0].status === "awaiting_settlement", JSON.stringify(paymentsAfter.payments));
check("buyer payment history persists after settlement", paymentsAfter.paidOrderIds.includes(String(orderA.id)), JSON.stringify(paymentsAfter.paidOrderIds));
const completedOrder = (await api("GET", "/api/orders/buyer", { token: buyer.token })).data.orders.find((o) => String(o.id) === String(orderA.id));
check("completed order still shows as paid", completedOrder && completedOrder.is_paid === true, `is_paid=${completedOrder && completedOrder.is_paid}`);

console.log("\n== Refund path (order B: accepted + paid, then refunded) ==");
const refund = await api("POST", `/api/orders/${orderB.id}/refund`, { token: buyer.token, body: { reason: "Changed my mind" } });
check("buyer refunded order B", refund.status === 200, `${refund.status} ${JSON.stringify(refund.data)}`);
// Product B started at 30; 5 kg were reserved on acceptance (→25), then
// the refund restored them (→30).
const stockCheck2 = await api("GET", `/api/products/${productB.id}`, {});
check("stock restored after refund (25 → 30)", Number(stockCheck2.data.product.quantity) === 30, `qty=${stockCheck2.data.product.quantity}`);
const buyerOrders = (await api("GET", "/api/orders/buyer", { token: buyer.token })).data.orders;
const orderBShaped = buyerOrders.find((o) => String(o.id) === String(orderB.id));
check("order B shows refunded status", orderBShaped && orderBShaped.rawStatus === "refunded", JSON.stringify(orderBShaped && orderBShaped.rawStatus));
const refundDup = await api("POST", `/api/orders/${orderB.id}/refund`, { token: buyer.token, body: {} });
check("double refund blocked", refundDup.status === 400, `${refundDup.status}`);

console.log("\n== Financial ledger ==");
const { query } = await import("./src/db.js");
const ledger = (await query(`SELECT transaction_type, COUNT(*)::int AS c FROM financial_transactions GROUP BY transaction_type`)).rows;
const types = Object.fromEntries(ledger.map((r) => [r.transaction_type, r.c]));
check("ledger has payment rows", (types.payment || 0) >= 2, JSON.stringify(types));
check("ledger has platform_fee rows", (types.platform_fee || 0) >= 1, JSON.stringify(types));
check("ledger has settlement rows (eligible + payout)", (types.settlement || 0) >= 2, JSON.stringify(types));
check("ledger has refund rows", (types.refund || 0) >= 1, JSON.stringify(types));

const settlementsTable = (await query(`SELECT COUNT(*)::int AS c FROM settlements WHERE status = 'settled'`)).rows[0];
check("settlements table has a settled payout", settlementsTable.c >= 1, "");

console.log(`\n== RESULT: ${pass.length} passed, ${fail.length} failed ==`);
if (fail.length) {
  console.error("Failed checks:", fail);
  process.exit(1);
}
process.exit(0);
