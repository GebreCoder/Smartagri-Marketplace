// SmartAgri API contract test — notifications + settlement notifications.
// Exercises GET /api/notifications, PATCH /api/notifications/:id/read and
// POST /api/notifications/read-all against a running server, driven by a real
// buyer→farmer order that produces order/payment/settlement notifications.
// Run: node test-notifications.mjs  (from the server directory)
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
  const email = `nt.${role}.${name}.${rand}@test.dev`;
  const { status, data } = await api("POST", "/api/auth/register", {
    body: { fullName: `NT ${role} ${name}`, phoneNumber: `+2519${rand.slice(0, 7)}`, email, role, businessName: role === "farmer" ? `${name} Farms` : "", location: "Addis Ababa", password: "password123" },
  });
  if (status !== 201) throw new Error(`register ${role} failed: ${status} ${JSON.stringify(data)}`);
  return { token: data.token, user: data.user };
}

const findNotif = (list, title) => list.find((n) => n.title === title);

console.log("\n== Setup: register users ==");
const farmer = await register("farmer", "delta");
const buyer = await register("buyer", "epsilon");
const admin = await (async () => {
  const { status, data } = await api("POST", "/api/auth/login", { body: { email: "admin@smartagri.com", password: "admin1234" } });
  if (status !== 200) throw new Error(`admin login failed: ${status}`);
  return { token: data.token };
})();
check("farmer, buyer, admin registered", true);

console.log("\n== Place an order → farmer gets a new-order notification ==");
const product = (await api("POST", "/api/products", {
  token: farmer.token,
  body: { name: `NT Tomato ${rand}`, category: "Vegetables", description: "Test", price: 100, quantity: 40, location: "Addis Ababa", imageUrl: "" },
})).data.product;

const placed = await api("POST", "/api/orders", {
  token: buyer.token,
  body: { productId: product.id, quantity: 4, deliveryMethod: "delivery", deliveryAddress: "Piazza, Addis Ababa", clientRef: `nt-${rand}` },
});
check("order placed (201)", placed.status === 201, `${placed.status} ${JSON.stringify(placed.data)}`);
const orderId = placed.data.order?.id || placed.data.order_id;

const farmerNotifs = (await api("GET", "/api/notifications", { token: farmer.token })).data;
check("farmer has exactly 1 notification (new order)", farmerNotifs.notifications.length === 1, `count=${farmerNotifs.notifications.length}`);
const newOrder = farmerNotifs.notifications[0];
check("notification title = 'New order received'", newOrder?.title === "New order received", JSON.stringify(newOrder?.title));
check("notification is order type with /farmer/orders link", newOrder?.type === "order" && newOrder?.link === "/farmer/orders", JSON.stringify({ type: newOrder?.type, link: newOrder?.link }));
check("notification unread by default", newOrder?.isRead === false, JSON.stringify(newOrder?.isRead));
check("unread count matches", farmerNotifs.unread === 1, `unread=${farmerNotifs.unread}`);

const buyerNotifs0 = (await api("GET", "/api/notifications", { token: buyer.token })).data;
check("buyer cannot see the farmer's notification (scoping)", buyerNotifs0.notifications.length === 0, `count=${buyerNotifs0.notifications.length}`);

console.log("\n== Mark read: single + read-all + invalid ids ==");
const readRes = await api("PATCH", `/api/notifications/${newOrder.id}/read`, { token: farmer.token });
check("PATCH /:id/read returns 200", readRes.status === 200, `${readRes.status} ${JSON.stringify(readRes.data)}`);
const afterRead = (await api("GET", "/api/notifications", { token: farmer.token })).data;
check("notification now read", afterRead.notifications[0].isRead === true, JSON.stringify(afterRead.notifications[0].isRead));
check("unread decremented to 0", afterRead.unread === 0, `unread=${afterRead.unread}`);

const malformed = await api("PATCH", "/api/notifications/not-a-uuid/read", { token: farmer.token });
check("malformed id → 404 (not a 500)", malformed.status === 404, `${malformed.status}`);
const missing = await api("PATCH", "/api/notifications/00000000-0000-0000-0000-000000000000/read", { token: farmer.token });
check("unknown uuid → 404", missing.status === 404, `${missing.status}`);

const readAll = await api("POST", "/api/notifications/read-all", { token: farmer.token });
check("POST /read-all returns 200", readAll.status === 200, `${readAll.status}`);
const afterReadAll = (await api("GET", "/api/notifications", { token: farmer.token })).data;
check("read-all leaves nothing unread", afterReadAll.unread === 0, `unread=${afterReadAll.unread}`);

console.log("\n== Fulfillment → payment → delivery → completion notifications ==");
const accept = await api("PATCH", `/api/orders/${orderId}/status`, { token: farmer.token, body: { status: "accepted" } });
check("farmer accepted order", accept.status === 200, `${accept.status}`);

const pay = await api("POST", "/api/payments/from-orders", {
  token: buyer.token,
  body: { orderIds: [orderId], method: "mobile_money", idempotencyKey: `nt-batch-${rand}` },
});
check("batch payment succeeded (accepted order)", pay.status === 201, `${pay.status} ${JSON.stringify(pay.data)}`);

// Dispatch requires verified payment, so the fulfillment chain runs after payment.
for (const status of ["preparing", "ready_for_delivery", "dispatched"]) {
  const r = await api("PATCH", `/api/orders/${orderId}/status`, { token: farmer.token, body: { status } });
  check(`status → ${status}`, r.status === 200, `${r.status} ${JSON.stringify(r.data)}`);
}

const confirmDel = await api("POST", `/api/orders/${orderId}/confirm-delivery`, { token: buyer.token });
check("buyer confirmed delivery", confirmDel.status === 201, `${confirmDel.status}`);
const complete = await api("POST", `/api/orders/${orderId}/complete`, { token: buyer.token });
check("buyer completed order", complete.status === 200, `${complete.status} ${JSON.stringify(complete.data)}`);

const buyerNotifs = (await api("GET", "/api/notifications", { token: buyer.token })).data;
check("buyer got 'Order accepted'", Boolean(findNotif(buyerNotifs.notifications, "Order accepted")), JSON.stringify(buyerNotifs.notifications.map((n) => n.title)));
check("buyer got 'Payment successful'", Boolean(findNotif(buyerNotifs.notifications, "Payment successful")), "");
check("buyer got 'Order out for delivery'", Boolean(findNotif(buyerNotifs.notifications, "Order out for delivery")), "");
check("buyer has 5 unread (accepted + payment + preparing/ready/dispatch)", buyerNotifs.unread === 5, `unread=${buyerNotifs.unread}`);
check("buyer never sees farmer-only 'New order received' (scoping)", !findNotif(buyerNotifs.notifications, "New order received"), "");

console.log("\n== Admin processes the settlement → farmer gets payout notification ==");
const adminSettlements = (await api("GET", "/api/settlements/admin", { token: admin.token })).data;
const settlement = adminSettlements.settlements.find((s) => String(s.orderId) === String(orderId));
check("settlement exists for the order", Boolean(settlement), JSON.stringify(adminSettlements.summary));
const processRes = await api("POST", `/api/settlements/admin/${settlement.id}/process`, { token: admin.token });
check("admin processed the settlement", processRes.status === 200, `${processRes.status} ${JSON.stringify(processRes.data)}`);

const farmerFinal = (await api("GET", "/api/notifications", { token: farmer.token })).data;
check("farmer got 'Settlement processed'", Boolean(findNotif(farmerFinal.notifications, "Settlement processed")), JSON.stringify(farmerFinal.notifications.map((n) => n.title)));
check("farmer got 'Order paid'", Boolean(findNotif(farmerFinal.notifications, "Order paid")), "");
check("farmer got 'Delivery confirmed'", Boolean(findNotif(farmerFinal.notifications, "Delivery confirmed")), "");
check("farmer got 'Order completed — settlement eligible'", Boolean(findNotif(farmerFinal.notifications, "Order completed — settlement eligible")), "");
check("farmer never sees buyer-only 'Payment successful' (scoping)", !findNotif(farmerFinal.notifications, "Payment successful"), "");
check("buyer never sees farmer-only 'Settlement processed' (scoping)", !findNotif((await api("GET", "/api/notifications", { token: buyer.token })).data.notifications, "Settlement processed"), "");

console.log(`\n== RESULT: ${pass.length} passed, ${fail.length} failed ==`);
if (fail.length) {
  console.error("Failed checks:", fail);
  process.exit(1);
}
process.exit(0);
