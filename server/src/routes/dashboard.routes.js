import { Router } from "express";
import { query } from "../db.js";
import { requireAuth, requireBuyer, requireFarmer } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { getWeather } from "../services/weather.js";
import { farmerInsights, buyerInsights, generateAiParagraph } from "../services/insights.js";
import {
  buildOrderSteps,
  capitalize,
  formatDateTime,
  getProfileName,
  normalizeText,
  ORDER_STATUS_LABEL,
  shapeProduct,
  toDisplayOrderId,
} from "../utils.js";

const router = Router();
router.use(requireAuth);

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const PRODUCT_COLUMNS = `
  p.id, p.farmer_id, p.name, p.category, p.description, p.price, p.quantity,
  p.location, p.image_url, p.created_at,
  u.full_name AS farmer_full_name,
  u.location AS farmer_location,
  u.profile_image_url AS farmer_profile_image_url
`;

const ORDER_SELECT = `
  SELECT o.id, o.buyer_id, o.product_id, o.quantity, o.status, o.created_at,
         o.delivery_method, o.delivery_address, o.delivery_notes, o.delivery_fee,
         p.id AS p_id, p.farmer_id, p.name, p.category, p.description, p.price,
         p.quantity AS p_quantity, p.location AS p_location, p.image_url AS p_image_url,
         p.created_at AS p_created_at,
         u.full_name AS farmer_full_name, u.location AS farmer_location,
         u.profile_image_url AS farmer_profile_image_url
  FROM orders o
  JOIN products p ON p.id = o.product_id
  LEFT JOIN users u ON u.id = p.farmer_id
`;

const shapeOrderRow = (row) => {
  const product = shapeProduct(
    {
      id: row.p_id,
      farmer_id: row.farmer_id,
      name: row.name,
      category: row.category,
      description: row.description,
      price: row.price,
      quantity: row.p_quantity,
      location: row.p_location,
      image_url: row.p_image_url,
      created_at: row.p_created_at,
    },
    {
      full_name: row.farmer_full_name,
      location: row.farmer_location,
      profile_image_url: row.farmer_profile_image_url,
    }
  );

  const quantity = Math.max(1, Number(row.quantity || 1));
  const price = Number(product?.price || 0);
  const deliveryFee = Math.max(0, Number(row.delivery_fee || 0));
  const total = price * quantity + deliveryFee;

  return {
    id: row.id,
    product_id: row.product_id,
    buyer_id: row.buyer_id,
    quantity,
    status: capitalize(row.status),
    rawStatus: normalizeText(row.status).toLowerCase() || "pending",
    product_name: product?.name || "Product",
    farmer_name: product?.farmer_name || "Farmer",
    location: product?.location || "",
    image_url: product?.image_url || "",
    price,
    total,
    total_label: `ETB ${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    created_at: row.created_at,
    created_label: formatDateTime(row.created_at),
    farmer_id: product?.farmer_id || null,
    product,
  };
};

const getBuyerNames = async (ids) => {
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  const names = new Map();
  if (!unique.length) return names;
  const { rows } = await query("SELECT id, full_name, business_name FROM users WHERE id = ANY($1::uuid[])", [unique]);
  rows.forEach((r) => names.set(String(r.id), getProfileName(r, "Buyer")));
  return names;
};

const dayKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ── Farmer dashboard ──────────────────────────────────────────────
// GET /api/dashboard/farmer
router.get(
  "/farmer",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const farmerId = req.user.id;

    const [profileRows, productRows, orderRows, cropRows, activityRows, harvestRows, priceRows] =
      await Promise.all([
        query("SELECT * FROM users WHERE id = $1", [farmerId]),
        query(`SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN users u ON u.id = p.farmer_id WHERE p.farmer_id = $1 ORDER BY p.created_at DESC`, [farmerId]),
        query(`${ORDER_SELECT} WHERE p.farmer_id = $1 ORDER BY o.created_at DESC`, [farmerId]),
        query("SELECT * FROM crops WHERE farmer_id = $1 ORDER BY created_at DESC", [farmerId]),
        query("SELECT * FROM farm_activities WHERE farmer_id = $1 ORDER BY activity_date ASC", [farmerId]),
        query("SELECT * FROM harvests WHERE farmer_id = $1 ORDER BY harvested_at DESC", [farmerId]),
        query("SELECT * FROM market_prices ORDER BY category, name", []),
      ]);

    const farmer = profileRows.rows[0] || {};
    const orders = orderRows.rows.map(shapeOrderRow);
    const products = productRows.rows.map((row) =>
      shapeProduct(row, {
        full_name: row.farmer_full_name,
        location: row.farmer_location,
        profile_image_url: row.farmer_profile_image_url,
      })
    );

    const buyerNames = await getBuyerNames(orders.map((o) => o.buyer_id));

    // ── KPI deltas (vs previous equal-length window) ──
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const prevStart = new Date(now - 2 * monthMs);
    const curStart = new Date(now - monthMs);

    const sumAccepted = (list, from, to) =>
      list
        .filter((o) => o.rawStatus === "accepted" && o.created_at && new Date(o.created_at) >= from && new Date(o.created_at) < to)
        .reduce((sum, o) => sum + Number(o.total || 0), 0);
    const countIn = (list, from, to) => list.filter((o) => o.created_at && new Date(o.created_at) >= from && new Date(o.created_at) < to).length;

    const revenueCur = sumAccepted(orders, curStart, new Date(now));
    const revenuePrev = sumAccepted(orders, prevStart, curStart);
    const ordersCur = countIn(orders, curStart, new Date(now));
    const ordersPrev = countIn(orders, prevStart, curStart);
    const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? 100 : 0);

    const totalSales = orders.filter((o) => o.rawStatus === "accepted").reduce((s, o) => s + Number(o.total || 0), 0);
    const pendingOrders = orders.filter((o) => o.rawStatus === "pending").length;
    const availableInventory = products.reduce((sum, p) => sum + Number(p.quantity || 0), 0);

    const kpis = {
      totalSales: { value: totalSales, label: "Total Sales", delta: pct(revenueCur, revenuePrev), format: "money", spark: [3, 5, 4, 6, 8, 7, 9] },
      totalOrders: { value: orders.length, label: "Total Orders", delta: pct(ordersCur, ordersPrev), format: "number", spark: [4, 3, 5, 7, 6, 8, 9] },
      activeProducts: { value: products.length, label: "Active Products", delta: products.length ? 6.7 : 0, format: "number", spark: [5, 5, 6, 6, 7, 7, 8] },
      availableInventory: { value: availableInventory, label: "Available Inventory", delta: -4.3, format: "kg", spark: [9, 8, 7, 7, 6, 5, 5] },
      revenue30: { value: revenueCur, label: "Revenue (30 Days)", delta: pct(revenueCur, revenuePrev), format: "money", spark: [3, 4, 5, 4, 6, 7, 8] },
      pendingOrders: { value: pendingOrders, label: "Pending Orders", delta: pendingOrders ? -6.2 : 0, format: "number", spark: [8, 7, 6, 6, 5, 5, 4] },
    };

    // ── Sales & revenue chart (default 30 days, ?days=7|30|90|365) ──
    const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const chart = [];
    const start = new Date(now - days * 24 * 60 * 60 * 1000);
    const accepted = orders.filter((o) => o.rawStatus === "accepted" && o.created_at && new Date(o.created_at) >= start);

    if (days <= 30) {
      for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000);
        const label = d.toLocaleDateString([], { month: "short", day: "numeric" });
        const dayOrders = accepted.filter((o) => dayKey(new Date(o.created_at)) === dayKey(d));
        chart.push({ label, revenue: Math.round(dayOrders.reduce((s, o) => s + Number(o.total || 0), 0)), orders: dayOrders.length });
      }
    } else if (days === 90) {
      const weeks = 13;
      for (let i = weeks - 1; i >= 0; i -= 1) {
        const end = new Date(now - i * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekOrders = accepted.filter((o) => new Date(o.created_at) >= weekStart && new Date(o.created_at) < end);
        chart.push({ label: `W${weeks - i}`, revenue: Math.round(weekOrders.reduce((s, o) => s + Number(o.total || 0), 0)), orders: weekOrders.length });
      }
    } else {
      const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (let i = 11; i >= 0; i -= 1) {
        const m = new Date(now - i * 30 * 24 * 60 * 60 * 1000);
        const mStart = new Date(m.getFullYear(), m.getMonth(), 1);
        const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1);
        const monthOrders = accepted.filter((o) => new Date(o.created_at) >= mStart && new Date(o.created_at) < mEnd);
        chart.push({ label: monthLabels[m.getMonth()], revenue: Math.round(monthOrders.reduce((s, o) => s + Number(o.total || 0), 0)), orders: monthOrders.length });
      }
    }

    // ── Farm performance (production by category from harvests) ──
    const productionMap = new Map();
    let totalProduction = 0;
    const harvestList = harvestRows.rows;
    if (harvestList.length) {
      harvestList.forEach((h) => {
        const category = normalizeText(h.category) || "Other";
        const amount = Number(h.quantity_kg || 0);
        productionMap.set(category, (productionMap.get(category) || 0) + amount);
        totalProduction += amount;
      });
    } else {
      products.forEach((p) => {
        const category = p.category || "Other";
        const amount = Number(p.quantity || 0);
        productionMap.set(category, (productionMap.get(category) || 0) + amount);
        totalProduction += amount;
      });
    }
    const PROD_COLORS = { Vegetables: "#16A34A", Grains: "#F59E0B", Fruits: "#10B981", Other: "#64748B" };
    const production = [...productionMap.entries()].map(([label, value]) => ({
      label,
      value: Math.round(value),
      pct: totalProduction > 0 ? Math.round((value / totalProduction) * 100) : 0,
      color: PROD_COLORS[label] || "#64748B",
    }));

    // ── Inventory overview (min stock = 10% of quantity, at least 10) ──
    const inventory = products.map((p) => {
      const quantity = Number(p.quantity || 0);
      const minStock = Math.max(10, Math.round(quantity * 0.1));
      return {
        name: p.name,
        image_url: p.image_url || FALLBACK_IMAGE,
        available: quantity,
        min_stock: minStock,
        status: quantity <= minStock ? "Low Stock" : "Healthy",
        price_label: `ETB ${Number(p.price || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}/kg`,
      };
    });

    // ── AI insights (rules on real data; upgradeable to LLM) ──
    const lowStockProducts = products.filter((p) => Number(p.quantity || 0) <= 10);
    const aiInsights = farmerInsights({
      products,
      orders,
      crops: cropRows.rows,
      prices: priceRows.rows,
      pendingOrders,
    });

    // ── Weather (live Open-Meteo with demo fallback) ──
    const weather = await getWeather(farmer.location || "Addis Ababa");

    const recentOrders = orders.slice(0, 5).map((o) => ({
      displayId: toDisplayOrderId(o.id),
      buyer: buyerNames.get(String(o.buyer_id)) || "Buyer",
      product: o.product_name,
      quantity: `${o.quantity} kg`,
      amount: o.total_label,
      date: formatDateTime(o.created_at).split(",")[0],
      status: o.status,
      rawStatus: o.rawStatus,
    }));

    return res.json({
      user: {
        full_name: farmer.full_name || "Farmer",
        business_name: farmer.business_name || "Green Field Farm",
        location: farmer.location || "Addis Ababa, Ethiopia",
        image_url: farmer.profile_image_url || "",
      },
      kpis,
      salesChart: { days, labels: chart.map((c) => c.label), revenue: chart.map((c) => c.revenue), orders: chart.map((c) => c.orders) },
      production: { total: totalProduction, items: production },
      aiInsights: aiInsights.slice(0, 4),
      marketPrices: priceRows.rows.map((p) => ({
        name: p.name,
        price_label: `ETB ${Number(p.price).toLocaleString("en-US", { maximumFractionDigits: 0 })}/${p.unit}`,
        change_pct: Number(p.change_pct),
        trend: p.trend,
      })),
      recentOrders,
      inventory,
      crops: cropRows.rows.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        growth_stage: c.growth_stage,
        planted_date: c.planted_date ? formatDateTime(c.planted_date).split(",")[0] : "",
        progress: Number(c.progress || 0),
        health: c.health,
        image_url: c.image_url || FALLBACK_IMAGE,
      })),
      activities: activityRows.rows.map((a) => ({
        id: a.id,
        title: a.title,
        activity_type: a.activity_type,
        crop_name: a.crop_name,
        activity_date: a.activity_date ? formatDateTime(a.activity_date).split(",")[0] : "",
        status: a.status,
      })),
      weather,
      lowStockCount: lowStockProducts.length,
      dateLabel: new Date().toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }),
    });
  })
);

// ── Farmer analytics ─────────────────────────────────────────────
// GET /api/dashboard/farmer/analytics
router.get(
  "/farmer/analytics",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const farmerId = req.user.id;

    const [productRows, orderRows, harvestRows] = await Promise.all([
      query(`SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN users u ON u.id = p.farmer_id WHERE p.farmer_id = $1 ORDER BY p.created_at DESC`, [farmerId]),
      query(`${ORDER_SELECT} WHERE p.farmer_id = $1 ORDER BY o.created_at DESC`, [farmerId]),
      query("SELECT * FROM harvests WHERE farmer_id = $1 ORDER BY harvested_at DESC", [farmerId]),
    ]);

    const orders = orderRows.rows.map(shapeOrderRow);
    const products = productRows.rows.map((row) =>
      shapeProduct(row, {
        full_name: row.farmer_full_name,
        location: row.farmer_location,
        profile_image_url: row.farmer_profile_image_url,
      })
    );

    const accepted = orders.filter((o) => o.rawStatus === "accepted");
    const revenueOf = (o) => Number(o.total || 0);

    // ── Top products by revenue ──
    const productMap = new Map();
    accepted.forEach((o) => {
      const entry = productMap.get(String(o.product_id)) || {
        id: o.product_id,
        name: o.product_name,
        image_url: o.image_url || FALLBACK_IMAGE,
        category: o.product?.category || "Other",
        revenue: 0,
        units: 0,
        orders: 0,
      };
      entry.revenue += revenueOf(o);
      entry.units += Number(o.quantity || 0);
      entry.orders += 1;
      productMap.set(String(o.product_id), entry);
    });
    // Products with no sales yet still appear (revenue 0).
    products.forEach((p) => {
      if (!productMap.has(String(p.id))) {
        productMap.set(String(p.id), {
          id: p.id,
          name: p.name,
          image_url: p.image_url || FALLBACK_IMAGE,
          category: p.category || "Other",
          revenue: 0,
          units: 0,
          orders: 0,
        });
      }
    });
    const totalRevenue = [...productMap.values()].reduce((s, p) => s + p.revenue, 0);
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((p) => ({
        ...p,
        revenue_label: `ETB ${Math.round(p.revenue).toLocaleString("en-US")}`,
        share: totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 100) : 0,
      }));

    // ── Order status breakdown ──
    const statusColors = { pending: "#F59E0B", accepted: "#16A34A", rejected: "#DC2626", cancelled: "#94A3B8", delivered: "#0D9488", completed: "#10B981" };
    const statusCounts = { pending: 0, accepted: 0, rejected: 0, cancelled: 0, delivered: 0, completed: 0 };
    orders.forEach((o) => {
      if (statusCounts[o.rawStatus] !== undefined) statusCounts[o.rawStatus] += 1;
    });
    const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      label: status[0].toUpperCase() + status.slice(1),
      count,
      color: statusColors[status],
    }));

    // ── Customer insights (repeat rate, top buyers) ──
    const buyerStats = new Map(); // buyerId -> { orders, spend }
    orders.forEach((o) => {
      const entry = buyerStats.get(String(o.buyer_id)) || { orders: 0, spend: 0 };
      entry.orders += 1;
      if (o.rawStatus === "accepted") entry.spend += revenueOf(o);
      buyerStats.set(String(o.buyer_id), entry);
    });
    const uniqueBuyers = buyerStats.size;
    const repeatBuyers = [...buyerStats.values()].filter((b) => b.orders >= 2).length;
    const repeatRate = uniqueBuyers > 0 ? Math.round((repeatBuyers / uniqueBuyers) * 100) : 0;
    const buyerNames = await getBuyerNames([...buyerStats.keys()]);
    const topBuyers = [...buyerStats.entries()]
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 5)
      .map(([buyerId, stats]) => ({
        id: buyerId,
        name: buyerNames.get(String(buyerId)) || "Buyer",
        orders: stats.orders,
        spend: Math.round(stats.spend),
        spend_label: `ETB ${Math.round(stats.spend).toLocaleString("en-US")}`,
      }));

    // ── Monthly trend (last 12 months) ──
    const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = Date.now();
    const trend = [];
    for (let i = 11; i >= 0; i -= 1) {
      const m = new Date(now - i * 30 * 24 * 60 * 60 * 1000);
      const mStart = new Date(m.getFullYear(), m.getMonth(), 1);
      const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const monthOrders = accepted.filter((o) => new Date(o.created_at) >= mStart && new Date(o.created_at) < mEnd);
      trend.push({
        label: monthLabels[m.getMonth()],
        revenue: Math.round(monthOrders.reduce((s, o) => s + revenueOf(o), 0)),
        orders: monthOrders.length,
      });
    }

    // ── Sales by category ──
    const catMap = new Map();
    accepted.forEach((o) => {
      const cat = o.product?.category || "Other";
      catMap.set(cat, (catMap.get(cat) || 0) + revenueOf(o));
    });
    const CAT_COLORS = ["#16A34A", "#0D9488", "#F59E0B", "#8B5CF6", "#E11D48", "#64748B"];
    const categorySales = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, value], index) => ({
        category,
        value: Math.round(value),
        value_label: `ETB ${Math.round(value).toLocaleString("en-US")}`,
        color: CAT_COLORS[index % CAT_COLORS.length],
        pct: totalRevenue > 0 ? Math.round((value / totalRevenue) * 100) : 0,
      }));

    // ── Summary metrics ──
    const totalOrders = orders.length;
    const avgOrderValue = accepted.length > 0 ? Math.round(totalRevenue / accepted.length) : 0;
    const fulfillmentRate = totalOrders > 0 ? Math.round((statusCounts.accepted / totalOrders) * 100) : 0;
    const totalHarvest = harvestRows.rows.reduce((s, h) => s + Number(h.quantity_kg || 0), 0);

    return res.json({
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalRevenue_label: `ETB ${Math.round(totalRevenue).toLocaleString("en-US")}`,
        totalOrders,
        acceptedOrders: statusCounts.accepted,
        uniqueBuyers,
        repeatRate,
        avgOrderValue: `ETB ${avgOrderValue.toLocaleString("en-US")}`,
        fulfillmentRate,
        totalHarvest: `${totalHarvest.toLocaleString("en-US")} kg`,
      },
      topProducts,
      statusBreakdown,
      topBuyers,
      trend: { labels: trend.map((t) => t.label), revenue: trend.map((t) => t.revenue), orders: trend.map((t) => t.orders) },
      categorySales,
    });
  })
);

// ── Buyer dashboard ───────────────────────────────────────────────
// GET /api/dashboard/buyer
router.get(
  "/buyer",
  requireBuyer,
  asyncHandler(async (req, res) => {
    const buyerId = req.user.id;

    const [profileRows, orderRows, favRows, productRows, priceRows] = await Promise.all([
      query("SELECT * FROM users WHERE id = $1", [buyerId]),
      query(`${ORDER_SELECT} WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`, [buyerId]),
      query(
        `SELECT f.id AS fav_id, f.buyer_id, f.farmer_id, f.product_id, f.created_at,
                farmer.full_name AS farmer_name, farmer.business_name AS farmer_business,
                farmer.location AS farmer_location, farmer.profile_image_url AS farmer_image
         FROM favorites f
         LEFT JOIN users farmer ON farmer.id = f.farmer_id
         WHERE f.buyer_id = $1 ORDER BY f.created_at DESC`,
        [buyerId]
      ),
      query(
        `SELECT ${PRODUCT_COLUMNS} FROM products p
         LEFT JOIN users u ON u.id = p.farmer_id
         ORDER BY p.created_at DESC
         LIMIT 30`,
        []
      ),
      query("SELECT * FROM market_prices ORDER BY category, name", []),
    ]);

    const buyer = profileRows.rows[0] || {};
    const orders = orderRows.rows.map(shapeOrderRow);
    const favorites = favRows.rows;
    const products = productRows.rows.map((row) =>
      shapeProduct(row, {
        full_name: row.farmer_full_name,
        location: row.farmer_location,
        profile_image_url: row.farmer_profile_image_url,
      })
    );

    const { rows: succeededPayments } = await query(
      `SELECT order_ids FROM payments WHERE buyer_id = $1 AND status IN ('succeeded', 'awaiting_settlement', 'settled', 'partially_refunded')`,
      [buyerId]
    );
    const paidSet = new Set();
    succeededPayments.forEach((row) => {
      (Array.isArray(row.order_ids) ? row.order_ids : []).forEach((id) => paidSet.add(String(id)));
    });

    const isSale = (o) => ["accepted", "delivered", "completed"].includes(o.rawStatus);
    const acceptedTotal = orders.filter(isSale).reduce((s, o) => s + Number(o.total || 0), 0);
    const ACTIVE_STATUSES = new Set(["pending", "accepted", "delivered"]);
    const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.rawStatus));
    const savedProducts = favorites.filter((f) => f.product_id).length;
    const favoriteFarmers = favorites.filter((f) => f.farmer_id).length;

    const kpis = {
      totalOrders: { value: orders.length, label: "Total Orders", delta: 12, format: "number", icon: "orders" },
      activeOrders: { value: activeOrders.length, label: "Active Orders", delta: null, caption: "On the way", format: "number", icon: "truck" },
      totalSpent: { value: acceptedTotal, label: "Total Spent", delta: 18, format: "money", icon: "wallet" },
      savedProducts: { value: savedProducts, label: "Saved Products", delta: null, caption: "Your favorites", format: "number", icon: "heart" },
      favoriteFarmers: { value: favoriteFarmers, label: "Favorite Farmers", delta: null, caption: "Trusted partners", format: "number", icon: "people" },
    };

    // ── Recommended products ──
    const recommended = products
      .filter((p) => Number(p.quantity || 0) > 0)
      .slice(0, 5)
      .map((p, index) => ({
        id: p.id,
        name: p.name,
        farmer_name: p.farmer_name,
        location: p.location || p.farmer_location || "Addis Ababa",
        image_url: p.image_url || FALLBACK_IMAGE,
        price_label: p.price_label,
        stock_label: p.stock_label,
        in_stock: Number(p.quantity || 0) > 0,
        is_organic: p.is_organic,
        is_bulk: p.is_bulk,
        rating: (4.6 + ((index * 7) % 4) / 10).toFixed(1),
        reviews: 60 + ((index * 37) % 180),
      }));

    // ── Active orders with progress steps ──
    const activeOrderList = activeOrders.slice(0, 3).map((o) => {
      const isPaid = paidSet.has(String(o.id));
      const tracker = buildOrderSteps(o.rawStatus, isPaid);
      const est = new Date(new Date(o.created_at).getTime() + 3 * 24 * 60 * 60 * 1000);
      return {
        displayId: toDisplayOrderId(o.id),
        product: o.product_name,
        quantity: `${o.quantity} kg`,
        amount: o.total_label,
        status: ORDER_STATUS_LABEL[o.rawStatus] || o.status,
        steps: tracker.steps,
        est_delivery: `Est. delivery ${est.toLocaleDateString([], { month: "short", day: "numeric" })}`,
        image_url: o.image_url || FALLBACK_IMAGE,
      };
    });

    // ── Spending chart (last 6 months) ──
    const now = Date.now();
    const monthLabels = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
    const spending = [];
    const acceptedOrders = orders.filter((o) => o.rawStatus === "accepted");
    for (let i = 5; i >= 0; i -= 1) {
      const m = new Date(now - i * 30 * 24 * 60 * 60 * 1000);
      const mStart = new Date(m.getFullYear(), m.getMonth(), 1);
      const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const monthOrders = acceptedOrders.filter((o) => new Date(o.created_at) >= mStart && new Date(o.created_at) < mEnd);
      spending.push({ label: monthLabels[m.getMonth()], value: Math.round(monthOrders.reduce((s, o) => s + Number(o.total || 0), 0)) });
    }

    // ── Categories (from live products) ──
    const catCounts = new Map();
    products.forEach((p) => {
      const cat = p.category || "Other";
      catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
    });
    const CAT_EMOJI = { Grains: "🌾", Vegetables: "🥦", Fruits: "🍋", Pulses: "🫘", Spices: "🌶️", Other: "🥬" };
    const categories = [...catCounts.entries()].map(([name, count]) => ({ name, count, emoji: CAT_EMOJI[name] || "🥬" }));

    // ── Favorite farmers ──
    const favoriteFarmerRows = favorites.filter((f) => f.farmer_id).map((f) => ({
      id: f.farmer_id,
      name: getProfileName({ full_name: f.farmer_name, business_name: f.farmer_business }, "Farmer"),
      location: f.farmer_location || "Addis Ababa",
      image_url: f.farmer_image || FALLBACK_IMAGE,
      rating: 4.8,
    }));

    // ── AI assistant insights (rules on real data; upgradeable to LLM) ──
    const aiInsights = buyerInsights({ prices: priceRows.rows, favorites });

    // ── Recent activity feed ──
    const activity = [];
    orders.slice(0, 3).forEach((o) => {
      activity.push({ icon: "cart", text: `Purchased ${o.quantity} kg ${o.product_name}`, date: formatDateTime(o.created_at).split(",")[0] });
    });
    favorites.slice(0, 2).forEach((f) => {
      activity.push({ icon: "heart", text: f.product_id ? "Added a product to favorites" : `Started following ${getProfileName({ full_name: f.farmer_name }, "a farmer")}`, date: formatDateTime(f.created_at).split(",")[0] });
    });
    if (acceptedTotal > 0) {
      activity.push({ icon: "payment", text: `Payment of ${kpis.totalSpent.value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ETB successful`, date: new Date().toLocaleDateString([], { month: "short", day: "numeric" }) });
    }
    orders.slice(0, 2).forEach((o) => {
      activity.push({ icon: "check", text: `Order ${toDisplayOrderId(o.id)} confirmed`, date: formatDateTime(o.created_at).split(",")[0] });
    });

    const marketTrends = priceRows.rows.slice(0, 5).map((p) => ({
      name: p.name,
      price_label: `ETB ${Number(p.price).toLocaleString("en-US", { maximumFractionDigits: 0 })}/${p.unit}`,
      change_pct: Number(p.change_pct),
      trend: p.trend,
    }));

    return res.json({
      user: {
        full_name: buyer.full_name || "Buyer",
        location: buyer.location || "Addis Ababa, Ethiopia",
        image_url: buyer.profile_image_url || "",
      },
      kpis,
      recommended,
      activeOrders: activeOrderList,
      spending: { labels: spending.map((s) => s.label), values: spending.map((s) => s.value), total: acceptedTotal, delta: 18 },
      categories,
      aiInsights: aiInsights.slice(0, 5),
      marketTrends,
      favoriteFarmers: favoriteFarmerRows,
      activity: activity.slice(0, 5),
      dateLabel: new Date().toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }),
    });
  })
);

// ── Crops CRUD (farmer) ───────────────────────────────────────────
router.get(
  "/crops",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT * FROM crops WHERE farmer_id = $1 ORDER BY created_at DESC", [req.user.id]);
    return res.json({ crops: rows });
  })
);

router.post(
  "/crops",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const name = normalizeText(req.body.name);
    if (!name) return res.status(400).json({ message: "Crop name is required." });
    const { rows } = await query(
      `INSERT INTO crops (farmer_id, name, category, growth_stage, planted_date, progress, health, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        req.user.id,
        name,
        normalizeText(req.body.category) || "Vegetables",
        normalizeText(req.body.growthStage) || "Growing",
        req.body.plantedDate || null,
        Math.max(0, Math.min(100, Number(req.body.progress || 0))),
        normalizeText(req.body.health) || "Good",
        normalizeText(req.body.imageUrl) || "",
      ]
    );
    return res.status(201).json({ crop: rows[0] });
  })
);

router.patch(
  "/crops/:id",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT * FROM crops WHERE id = $1 AND farmer_id = $2", [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: "Crop not found." });
    const crop = rows[0];
    const { rows: updated } = await query(
      `UPDATE crops SET name = $1, category = $2, growth_stage = $3, planted_date = $4, progress = $5, health = $6, image_url = $7
       WHERE id = $8 RETURNING *`,
      [
        normalizeText(req.body.name ?? crop.name),
        normalizeText(req.body.category ?? crop.category),
        normalizeText(req.body.growthStage ?? crop.growth_stage),
        req.body.plantedDate ?? crop.planted_date,
        req.body.progress !== undefined ? Math.max(0, Math.min(100, Number(req.body.progress))) : crop.progress,
        normalizeText(req.body.health ?? crop.health),
        req.body.imageUrl !== undefined ? normalizeText(req.body.imageUrl) : crop.image_url,
        req.params.id,
      ]
    );
    return res.json({ crop: updated[0] });
  })
);

router.delete(
  "/crops/:id",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT id FROM crops WHERE id = $1 AND farmer_id = $2", [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: "Crop not found." });
    await query("DELETE FROM crops WHERE id = $1", [req.params.id]);
    return res.json({ message: "Crop deleted." });
  })
);

// ── Farm activities CRUD (farmer) ─────────────────────────────────
router.get(
  "/activities",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT * FROM farm_activities WHERE farmer_id = $1 ORDER BY activity_date ASC", [req.user.id]);
    return res.json({ activities: rows });
  })
);

router.post(
  "/activities",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const title = normalizeText(req.body.title);
    if (!title) return res.status(400).json({ message: "Activity title is required." });
    const { rows } = await query(
      `INSERT INTO farm_activities (farmer_id, title, activity_type, crop_name, activity_date, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.user.id,
        title,
        normalizeText(req.body.activityType) || "task",
        normalizeText(req.body.cropName) || "",
        req.body.activityDate || new Date().toISOString().slice(0, 10),
        normalizeText(req.body.status) || "planned",
      ]
    );
    return res.status(201).json({ activity: rows[0] });
  })
);

router.patch(
  "/activities/:id",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT * FROM farm_activities WHERE id = $1 AND farmer_id = $2", [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: "Activity not found." });
    const activity = rows[0];
    const { rows: updated } = await query(
      `UPDATE farm_activities SET title = $1, activity_type = $2, crop_name = $3, activity_date = $4, status = $5
       WHERE id = $6 RETURNING *`,
      [
        normalizeText(req.body.title ?? activity.title),
        normalizeText(req.body.activityType ?? activity.activity_type),
        normalizeText(req.body.cropName ?? activity.crop_name),
        req.body.activityDate ?? activity.activity_date,
        normalizeText(req.body.status ?? activity.status),
        req.params.id,
      ]
    );
    return res.json({ activity: updated[0] });
  })
);

router.delete(
  "/activities/:id",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT id FROM farm_activities WHERE id = $1 AND farmer_id = $2", [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: "Activity not found." });
    await query("DELETE FROM farm_activities WHERE id = $1", [req.params.id]);
    return res.json({ message: "Activity deleted." });
  })
);

// ── Favorites CRUD (buyer) ────────────────────────────────────────
router.get(
  "/favorites",
  requireBuyer,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT f.id AS fav_id, f.product_id, f.farmer_id, f.created_at,
              p.name AS product_name, p.price, p.image_url, p.quantity, p.category,
              u.full_name AS farmer_name, u.business_name, u.location AS farmer_location
       FROM favorites f
       LEFT JOIN products p ON p.id = f.product_id
       LEFT JOIN users u ON u.id = f.farmer_id
       WHERE f.buyer_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    const products = rows.filter((r) => r.product_id).map((r) => ({
      id: r.product_id,
      fav_id: r.fav_id,
      name: r.product_name,
      category: r.category,
      price_label: `ETB ${Number(r.price || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      image_url: r.image_url || FALLBACK_IMAGE,
      farmer_name: r.farmer_name || "Farmer",
      in_stock: Number(r.quantity || 0) > 0,
    }));
    const farmers = rows.filter((r) => r.farmer_id).map((r) => ({
      id: r.farmer_id,
      name: r.farmer_name || r.business_name || "Farmer",
      location: r.farmer_location || "Addis Ababa",
    }));
    return res.json({ products, farmers });
  })
);

router.post(
  "/favorites",
  requireBuyer,
  asyncHandler(async (req, res) => {
    const farmerId = normalizeText(req.body.farmerId);
    const productId = normalizeText(req.body.productId);
    if (!farmerId && !productId) {
      return res.status(400).json({ message: "Provide a productId or farmerId to favorite." });
    }
    // Product favorite (farmer_id NULL) and farmer follow (product_id NULL) are
    // mutually exclusive, so each gets its own conflict target matching the
    // partial unique indexes in schema.sql. Product favorites snapshot the
    // current price so buyers can later get price-drop alerts.
    let priceAtFavorite = null;
    if (productId && !farmerId) {
      const { rows: pRows } = await query("SELECT price FROM products WHERE id = $1", [productId]);
      priceAtFavorite = pRows[0] ? Number(pRows[0].price) : null;
    }
    const { rows } =
      productId && !farmerId
        ? await query(
            `INSERT INTO favorites (buyer_id, product_id, price_at_favorite)
             VALUES ($1, $2::uuid, $3)
             ON CONFLICT (buyer_id, product_id) WHERE farmer_id IS NULL
             DO UPDATE SET price_at_favorite = EXCLUDED.price_at_favorite
             RETURNING *`,
            [req.user.id, productId, priceAtFavorite]
          )
        : await query(
            `INSERT INTO favorites (buyer_id, farmer_id)
             VALUES ($1, $2::uuid)
             ON CONFLICT (buyer_id, farmer_id) WHERE product_id IS NULL DO NOTHING
             RETURNING *`,
            [req.user.id, farmerId]
          );
    return res.status(201).json({ favorite: rows[0] || null });
  })
);

router.delete(
  "/favorites/:id",
  requireBuyer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT id FROM favorites WHERE id = $1 AND buyer_id = $2", [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: "Favorite not found." });
    await query("DELETE FROM favorites WHERE id = $1", [req.params.id]);
    return res.json({ message: "Removed from favorites." });
  })
);

// ── Harvests CRUD (farmer) ────────────────────────────────────────
router.get(
  "/harvests",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT * FROM harvests WHERE farmer_id = $1 ORDER BY harvested_at DESC", [req.user.id]);
    return res.json({ harvests: rows });
  })
);

router.post(
  "/harvests",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const cropName = normalizeText(req.body.cropName);
    if (!cropName) return res.status(400).json({ message: "Crop name is required." });
    const quantityKg = Math.max(0, Number(req.body.quantityKg || 0));
    if (!(quantityKg > 0)) return res.status(400).json({ message: "Quantity (kg) must be greater than zero." });
    const { rows } = await query(
      `INSERT INTO harvests (farmer_id, crop_name, category, quantity_kg, harvested_at)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now())) RETURNING *`,
      [
        req.user.id,
        cropName,
        normalizeText(req.body.category) || "Vegetables",
        quantityKg,
        req.body.harvestedAt || null,
      ]
    );
    return res.status(201).json({ harvest: rows[0] });
  })
);

router.delete(
  "/harvests/:id",
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT id FROM harvests WHERE id = $1 AND farmer_id = $2", [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: "Harvest record not found." });
    await query("DELETE FROM harvests WHERE id = $1", [req.params.id]);
    return res.json({ message: "Harvest record deleted." });
  })
);

// ── Weather (any authenticated user) ───────────────────────────────
router.get(
  "/weather",
  asyncHandler(async (req, res) => {
    const location = String(req.query.location || "");
    const weather = await getWeather(location || (req.user?.location || "Addis Ababa"));
    return res.json({ weather });
  })
);

// ── AI insight paragraph (any authenticated user) ──────────────────
// Uses the configured Groq/Gemini key when present; falls back to rules.
router.post(
  "/ai-insight",
  asyncHandler(async (req, res) => {
    const role = String(req.body.role || "farmer").toLowerCase();
    const context = String(req.body.context || "").trim().slice(0, 1200);
    const fallback = String(req.body.fallback || "");
    const result = await generateAiParagraph({ role, context, fallback });
    return res.json(result);
  })
);

// ── Buyer budget (monthly spending target) ─────────────────────────
// GET /api/dashboard/budget?month=YYYY-MM   → { month, amount, spent, remaining }
// PUT /api/dashboard/budget  body: { month, amount }
router.get(
  "/budget",
  requireBuyer,
  asyncHandler(async (req, res) => {
    const requested = String(req.query.month || "").trim();
    const month = /^\d{4}-\d{2}$/.test(requested) ? requested : monthKey(new Date());
    const { rows: budgetRows } = await query("SELECT amount FROM budgets WHERE buyer_id = $1 AND month = $2", [req.user.id, month]);
    const amount = Number(budgetRows[0]?.amount || 0);

    const { rows: orderRows } = await query(`${ORDER_SELECT} WHERE o.buyer_id = $1`, [req.user.id]);
    const spent = orderRows
      .filter((o) => normalizeText(o.status).toLowerCase() === "accepted" && o.created_at && monthKey(o.created_at) === month)
      .reduce((s, o) => s + Number(o.price || 0) * Math.max(1, Number(o.quantity || 1)), 0);

    return res.json({
      month,
      amount: Math.round(amount),
      spent: Math.round(spent),
      remaining: Math.max(0, Math.round(amount - spent)),
      pct: amount > 0 ? Math.min(100, Math.round((spent / amount) * 100)) : 0,
    });
  })
);

router.put(
  "/budget",
  requireBuyer,
  asyncHandler(async (req, res) => {
    const requested = String(req.body.month || "").trim();
    const month = /^\d{4}-\d{2}$/.test(requested) ? requested : monthKey(new Date());
    const amount = Math.max(0, Number(req.body.amount || 0));
    if (!(amount > 0)) return res.status(400).json({ message: "Budget must be greater than zero." });

    await query(
      `INSERT INTO budgets (buyer_id, month, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (buyer_id, month) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()`,
      [req.user.id, month, amount]
    );
    return res.json({ month, amount: Math.round(amount), message: "Budget saved." });
  })
);

// ── Buyer spending insights ───────────────────────────────────────
// GET /api/dashboard/buyer/insights → spending by category, price-drop
// alerts on favorites, and a 12-month spending trend.
router.get(
  "/buyer/insights",
  requireBuyer,
  asyncHandler(async (req, res) => {
    const [orderRows, favRows] = await Promise.all([
      query(`${ORDER_SELECT} WHERE o.buyer_id = $1 ORDER BY o.created_at DESC`, [req.user.id]),
      query(
        `SELECT f.id AS fav_id, f.product_id, f.price_at_favorite, f.created_at,
                p.name AS product_name, p.price AS current_price, p.category, p.image_url
         FROM favorites f
         JOIN products p ON p.id = f.product_id
         WHERE f.buyer_id = $1 AND f.product_id IS NOT NULL
         ORDER BY f.created_at DESC`,
        [req.user.id]
      ),
    ]);

    const orders = orderRows.rows.map(shapeOrderRow);
    const accepted = orders.filter((o) => o.rawStatus === "accepted");

    // ── Spending by category (all time + this month) ──
    const now = new Date();
    const thisMonth = monthKey(now);
    const catMap = new Map();
    const monthCatMap = new Map();
    accepted.forEach((o) => {
      const cat = o.product?.category || "Other";
      const value = Number(o.total || 0);
      catMap.set(cat, (catMap.get(cat) || 0) + value);
      if (monthKey(o.created_at) === thisMonth) {
        monthCatMap.set(cat, (monthCatMap.get(cat) || 0) + value);
      }
    });
    const CAT_COLORS = ["#16A34A", "#0D9488", "#F59E0B", "#8B5CF6", "#E11D48", "#64748B"];
    const spendingByCategory = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, value], index) => ({
        category,
        value: Math.round(value),
        value_label: `ETB ${Math.round(value).toLocaleString("en-US")}`,
        color: CAT_COLORS[index % CAT_COLORS.length],
        pct: accepted.length > 0 ? Math.round((value / accepted.reduce((s, o) => s + Number(o.total || 0), 0)) * 100) : 0,
        this_month: Math.round(monthCatMap.get(category) || 0),
      }));

    // ── Price-drop alerts (current price < price when favorited) ──
    const priceAlerts = favRows.rows
      .filter((f) => f.price_at_favorite && f.current_price !== null && Number(f.current_price) < Number(f.price_at_favorite))
      .map((f) => {
        const drop = Number(f.price_at_favorite) - Number(f.current_price);
        return {
          productId: f.product_id,
          name: f.product_name,
          image_url: f.image_url || FALLBACK_IMAGE,
          old_price: Number(f.price_at_favorite),
          new_price: Number(f.current_price),
          drop_label: `ETB ${Math.round(drop).toLocaleString("en-US")}`,
          drop_pct: Math.round((drop / Number(f.price_at_favorite)) * 100),
          new_price_label: `ETB ${Number(f.current_price).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        };
      })
      .sort((a, b) => b.drop_pct - a.drop_pct)
      .slice(0, 5);

    const totalSpent = accepted.reduce((s, o) => s + Number(o.total || 0), 0);
    const thisMonthSpent = monthCatMap.size ? [...monthCatMap.values()].reduce((s, v) => s + v, 0) : 0;

    return res.json({
      totalSpent: Math.round(totalSpent),
      totalSpent_label: `ETB ${Math.round(totalSpent).toLocaleString("en-US")}`,
      thisMonthSpent: Math.round(thisMonthSpent),
      thisMonthSpent_label: `ETB ${Math.round(thisMonthSpent).toLocaleString("en-US")}`,
      topCategory: [...catMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
      spendingByCategory,
      priceAlerts,
    });
  })
);

// ── Market prices (any authenticated user) ─────────────────────────
router.get(
  "/market-prices",
  asyncHandler(async (_req, res) => {
    const { rows } = await query("SELECT * FROM market_prices ORDER BY category, name", []);
    return res.json({
      prices: rows.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price_label: `ETB ${Number(p.price).toLocaleString("en-US", { maximumFractionDigits: 0 })}/${p.unit}`,
        change_pct: Number(p.change_pct),
        trend: p.trend,
      })),
    });
  })
);

export default router;
