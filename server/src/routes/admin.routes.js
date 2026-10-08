import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { emitMessageNew, emitOrderChanged, emitGlobal, emitToOrder } from "../socket.js";
import {
  composeAccountRole,
  formatDateTime,
  formatNumber,
  getAccountStateLabel,
  normalizeText,
  splitAccountRole,
  USER_TYPES,
  shapeProduct,
} from "../utils.js";

const router = Router();
router.use(requireAuth, requireAdmin);

const USER_COLUMNS = `id, full_name, email, phone_number, role, business_name, location, profile_image_url, created_at`;

// ── Profile ────────────────────────────────────────────────────────
// GET /api/admin/profile
router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      "SELECT id, full_name, email, role, location, profile_image_url FROM users WHERE id = $1",
      [req.user.id]
    );
    return res.json({ profile: rows[0] || { id: req.user.id, full_name: req.user.email, email: req.user.email, role: "admin" } });
  })
);

// ── Dashboard stats ────────────────────────────────────────────────
// GET /api/admin/stats
router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [{ rows: usersResult }, { rows: productsResult }, { rows: ordersResult }, { rows: chatsResult }, { rows: reportsResult }] =
      await Promise.all([
        query("SELECT COUNT(*)::int AS count FROM users"),
        query("SELECT COUNT(*)::int AS count FROM products"),
        query("SELECT COUNT(*)::int AS count, status FROM orders GROUP BY status"),
        query("SELECT COUNT(*)::int AS count FROM messages WHERE message NOT ILIKE 'Issue reported:%'"),
        query("SELECT COUNT(*)::int AS count FROM messages WHERE message ILIKE 'Issue reported:%'"),
      ]);

    const counts = {
      users: usersResult?.[0]?.count || 0,
      products: productsResult?.[0]?.count || 0,
      orders: ordersResult.reduce((sum, row) => sum + Number(row.count || 0), 0),
      chats: chatsResult?.[0]?.count || 0,
      reports: reportsResult?.[0]?.count || 0,
    };

    const statusCounts = ordersResult.reduce((acc, row) => ({ ...acc, [row.status]: Number(row.count || 0) }), {});
    const pendingOrders = statusCounts.pending || 0;
    const acceptedOrders = statusCounts.accepted || 0;

    return res.json({
      counts,
      pendingOrders,
      acceptedOrders,
      activeUsers: counts.users,
      totalProducts: counts.products,
      totalOrders: counts.orders,
      openChats: counts.chats,
      reportItems: counts.reports,
      notificationCount: pendingOrders + counts.reports,
    });
  })
);

// ── Users list ─────────────────────────────────────────────────────
// GET /api/admin/users
router.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC`);
    return res.json({
      users: rows.map((row) => {
        const { userType, accountState } = splitAccountRole(row.role);
        return {
          id: row.id,
          name: row.full_name || "Unknown user",
          email: row.email || "",
          phoneNumber: row.phone_number || "",
          userType,
          accountState,
          location: row.location || "",
          businessName: row.business_name || "",
          avatarUrl: row.profile_image_url || "",
          createdAt: row.created_at,
          displayLabel:
            userType === USER_TYPES.FARMER ? "Farm Name" : userType === USER_TYPES.BUYER ? "Business Name" : "Account",
          statusLabel: getAccountStateLabel(accountState),
        };
      }),
    });
  })
);

// ── Set user state (active / inactive) ─────────────────────────────
// PATCH /api/admin/users/:id/state  body: { nextState }
router.patch(
  "/users/:id/state",
  asyncHandler(async (req, res) => {
    const userId = normalizeText(req.params.id);
    const nextState = normalizeText(req.body.nextState).toLowerCase();

    if (!userId) return res.status(400).json({ message: "Missing user id." });
    if (!["active", "inactive"].includes(nextState)) {
      return res.status(400).json({ message: "Invalid user state." });
    }

    const { rows } = await query("SELECT id, role FROM users WHERE id = $1", [userId]);
    const currentUser = rows[0];
    if (!currentUser) return res.status(404).json({ message: "User not found." });

    const { userType } = splitAccountRole(currentUser.role);
    const nextRole = composeAccountRole(userType, nextState);

    await query("UPDATE users SET role = $1 WHERE id = $2", [nextRole, userId]);
    return res.json({ message: "User state updated." });
  })
);

// ── Deletion preview ───────────────────────────────────────────────
// GET /api/admin/users/:id/deletion-preview
router.get(
  "/users/:id/deletion-preview",
  asyncHandler(async (req, res) => {
    const userId = normalizeText(req.params.id);
    const { rows } = await query("SELECT id, role, full_name, email FROM users WHERE id = $1", [userId]);
    const currentUser = rows[0];
    if (!currentUser) return res.status(404).json({ message: "User not found." });

    const { userType } = splitAccountRole(currentUser.role);

    const [productResult, orderResult, messageResult] = await Promise.all([
      userType === USER_TYPES.FARMER
        ? query("SELECT COUNT(*)::int AS count FROM products WHERE farmer_id = $1", [userId])
        : Promise.resolve({ rows: [{ count: 0 }] }),
      userType === USER_TYPES.BUYER
        ? query("SELECT COUNT(*)::int AS count FROM orders WHERE buyer_id = $1", [userId])
        : Promise.resolve({ rows: [{ count: 0 }] }),
      query(
        "SELECT COUNT(*)::int AS count FROM messages WHERE sender_id = $1 OR receiver_id = $1",
        [userId]
      ),
    ]);

    const relatedProducts = productResult.rows[0]?.count || 0;
    const relatedOrders = orderResult.rows[0]?.count || 0;
    const relatedMessages = messageResult.rows[0]?.count || 0;
    const hasRelatedData = relatedProducts > 0 || relatedOrders > 0 || relatedMessages > 0;

    return res.json({
      user: currentUser,
      userType,
      relatedProducts,
      relatedOrders,
      relatedMessages,
      hasRelatedData,
      recommendedAction: hasRelatedData ? "inactive" : "delete",
    });
  })
);

// ── Delete user (with related-data cleanup so 'Delete Anyway' works) ─
// DELETE /api/admin/users/:id
router.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const userId = normalizeText(req.params.id);
    const { rows } = await query("SELECT id FROM users WHERE id = $1", [userId]);
    if (!rows[0]) return res.status(404).json({ message: "User not found." });

    await withTransaction(async (client) => {
      await client.query("DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1", [userId]);
      await client.query("DELETE FROM cart_items WHERE buyer_id = $1", [userId]);
      const { rows: orderRows } = await client.query("SELECT id FROM orders WHERE buyer_id = $1", [userId]);
      if (orderRows.length) {
        await client.query("DELETE FROM messages WHERE order_id = ANY($1::uuid[])", [orderRows.map((o) => o.id)]);
        await client.query("DELETE FROM orders WHERE buyer_id = $1", [userId]);
      }
      await client.query("DELETE FROM products WHERE farmer_id = $1", [userId]);
      await client.query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    });

    return res.json({ message: "User deleted." });
  })
);

// ── Products list (admin) ──────────────────────────────────────────
// GET /api/admin/products
router.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT p.id, p.farmer_id, p.name, p.category, p.description, p.price, p.quantity,
              p.location, p.image_url, p.created_at,
              u.full_name AS farmer_full_name, u.location AS farmer_location,
              u.profile_image_url AS farmer_profile_image_url
       FROM products p
       LEFT JOIN users u ON u.id = p.farmer_id
       ORDER BY p.created_at DESC
       LIMIT 500`
    );

    return res.json({
      products: rows.map((row) => {
        const product = shapeProduct(row, {
          full_name: row.farmer_full_name,
          location: row.farmer_location,
          profile_image_url: row.farmer_profile_image_url,
        });
        return {
          id: product.id,
          name: product.name,
          farmerName: product.farmer_name,
          location: product.location || product.farmer_location || "",
          category: product.category || "Other",
          description: product.description || "",
          priceLabel: product.price_label,
          stockLabel: product.stock_label,
          imageUrl: product.image_url,
          createdLabel: product.created_label,
          farmerId: product.farmer_id,
        };
      }),
    });
  })
);

// ── Delete product (admin) ─────────────────────────────────────────
// DELETE /api/admin/products/:id
router.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await query("DELETE FROM products WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: "Product not found." });
    emitGlobal("product:changed", {});
    return res.json({ message: "Product removed." });
  })
);

// ── Orders (admin) ─────────────────────────────────────────────────
// GET /api/admin/orders
router.get(
  "/orders",
  asyncHandler(async (_req, res) => {
    const { rows: orderRows } = await query("SELECT * FROM orders ORDER BY created_at DESC");

    const productIds = [...new Set(orderRows.map((row) => row.product_id).filter(Boolean))];
    const buyerIds = [...new Set(orderRows.map((row) => row.buyer_id).filter(Boolean))];

    const [productResult, buyerResult, issueResult, paymentResult] = await Promise.all([
      productIds.length
        ? query(
            `SELECT p.id, p.farmer_id, p.name, p.category, p.price, p.quantity, p.location, p.image_url, p.created_at,
                    u.full_name AS farmer_full_name, u.location AS farmer_location,
                    u.business_name AS farmer_business_name, u.profile_image_url AS farmer_profile_image_url
             FROM products p
             LEFT JOIN users u ON u.id = p.farmer_id
             WHERE p.id = ANY($1::uuid[])`,
            [productIds]
          )
        : Promise.resolve({ rows: [] }),
      buyerIds.length
        ? query(
            "SELECT id, full_name, location, business_name, profile_image_url, role FROM users WHERE id = ANY($1::uuid[])",
            [buyerIds]
          )
        : Promise.resolve({ rows: [] }),
      orderRows.length
        ? query(
            "SELECT id, order_id, message, created_at, sender_id, receiver_id FROM messages WHERE message ILIKE 'Issue reported:%' ORDER BY created_at DESC"
          )
        : Promise.resolve({ rows: [] }),
      orderRows.length
        ? query(
            "SELECT order_ids FROM payments WHERE status IN ('succeeded', 'awaiting_settlement', 'settled', 'partially_refunded') AND order_ids ?| $1::text[]",
            [orderRows.map((row) => row.id)]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const paidOrderSet = new Set();
    paymentResult.rows.forEach((row) => {
      (Array.isArray(row.order_ids) ? row.order_ids : []).forEach((id) => paidOrderSet.add(String(id)));
    });

    const productsMap = new Map(productResult.rows.map((row) => [String(row.id), row]));
    const buyersMap = new Map(buyerResult.rows.map((row) => [String(row.id), row]));
    const issueMap = new Map();
    issueResult.rows.forEach((row) => {
      if (!issueMap.has(String(row.order_id))) issueMap.set(String(row.order_id), row);
    });

    const orders = orderRows.map((orderRow) => {
      const product = productsMap.get(String(orderRow.product_id));
      const buyer = buyersMap.get(String(orderRow.buyer_id));
      const farmer = product ? { full_name: product.farmer_full_name, location: product.farmer_location, business_name: product.farmer_business_name } : null;
      const quantity = Number(orderRow.quantity || 0);
      const unitPrice = Number(product?.price || 0);
      const deliveryFee = Math.max(0, Number(orderRow.delivery_fee || 0));
      const deliveryMethod = normalizeText(orderRow.delivery_method).toLowerCase() || "delivery";
      const issue = issueMap.get(String(orderRow.id));
      const rawStatus = normalizeText(orderRow.status).toLowerCase() || "pending";

      return {
        id: orderRow.id,
        productName: product?.name || "Product",
        buyerName: buyer?.full_name || "Buyer",
        farmerName: farmer?.full_name || "Farmer",
        buyerLocation: buyer?.location || "",
        farmerLocation: farmer?.location || "",
        buyerBusinessName: buyer?.business_name || "",
        farmerBusinessName: farmer?.business_name || "",
        imageUrl: product?.image_url || "",
        status: rawStatus,
        statusLabel: rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1),
        createdAt: orderRow.created_at,
        createdLabel: formatDateTime(orderRow.created_at),
        quantityLabel: `${quantity} kg`,
        totalLabel: `ETB ${(unitPrice * quantity + deliveryFee).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        total: unitPrice * quantity + deliveryFee,
        deliveryFee,
        deliveryMethod,
        deliveryMethodLabel: deliveryMethod === "pickup" ? "Farm pickup" : "Home delivery",
        deliveryAddress: normalizeText(orderRow.delivery_address),
        isPaid: paidOrderSet.has(String(orderRow.id)),
        productCategory: product?.category || "Other",
        productLocation: product?.location || "",
        disputeMessage: issue?.message || "",
        disputeCreatedAt: issue?.created_at || null,
        hasDispute: !!issue,
        issueId: issue?.id || null,
        farmerId: product?.farmer_id || null,
        productId: product?.id || null,
        buyerId: orderRow.buyer_id,
      };
    });

    return res.json({ orders });
  })
);

// ── Chat users (admin) ─────────────────────────────────────────────
// GET /api/admin/chat/users
router.get(
  "/chat/users",
  asyncHandler(async (_req, res) => {
    const [userResult, orderResult, productResult, messageResult] = await Promise.all([
      query(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC`),
      query("SELECT id, buyer_id, product_id, status, created_at FROM orders ORDER BY created_at DESC"),
      query("SELECT id, farmer_id, name, image_url, created_at FROM products ORDER BY created_at DESC"),
      query("SELECT id, order_id, sender_id, receiver_id, message, created_at FROM messages ORDER BY created_at DESC"),
    ]);

    const users = userResult.rows;
    const orders = orderResult.rows;
    const products = productResult.rows;
    const messages = messageResult.rows;

    const productsMap = new Map(products.map((row) => [String(row.id), row]));
    const messagesByOrderId = new Map();
    messages.forEach((row) => {
      if (!messagesByOrderId.has(String(row.order_id))) messagesByOrderId.set(String(row.order_id), row);
    });

    const userThreadMap = new Map();
    orders.forEach((order) => {
      const product = productsMap.get(String(order.product_id));
      const latestMessage = messagesByOrderId.get(String(order.id));
      const thread = {
        orderId: order.id,
        productName: product?.name || "Product",
        orderStatus: normalizeText(order.status).toLowerCase() || "pending",
        lastMessage: latestMessage?.message || `Order ${normalizeText(order.status).toLowerCase() || "pending"}`,
        lastMessageAt: latestMessage?.created_at || order.created_at,
      };

      const addThread = (userId) => {
        if (!userId) return;
        const existing = userThreadMap.get(String(userId)) || [];
        existing.push(thread);
        userThreadMap.set(String(userId), existing);
      };
      addThread(order.buyer_id);
      addThread(product?.farmer_id);
    });

    const result = users.map((row) => {
      const { userType, accountState } = splitAccountRole(row.role);
      const threads = (userThreadMap.get(String(row.id)) || []).sort(
        (left, right) => new Date(right.lastMessageAt || 0).getTime() - new Date(left.lastMessageAt || 0).getTime()
      );
      const latestThread = threads[0] || null;

      return {
        id: row.id,
        name: row.full_name || "Unknown user",
        email: row.email || "",
        phoneNumber: row.phone_number || "",
        userType,
        accountState,
        location: row.location || "",
        businessName: row.business_name || "",
        avatarUrl: row.profile_image_url || "",
        createdAt: row.created_at,
        threadCount: threads.length,
        latestOrderId: latestThread?.orderId || null,
        latestProductName: latestThread?.productName || "",
        latestMessage: latestThread?.lastMessage || "No messages yet",
        latestMessageAt: latestThread?.lastMessageAt || null,
        canChat: !!latestThread?.orderId,
        threads,
      };
    });

    return res.json({ users: result });
  })
);

// ── Chat thread (admin) ────────────────────────────────────────────
// GET /api/admin/chat/threads/:orderId
router.get(
  "/chat/threads/:orderId",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.orderId);
    if (!orderId) return res.status(400).json({ message: "Missing order id." });

    const [{ rows: orderRows }, { rows: messages }] = await Promise.all([
      query("SELECT * FROM orders WHERE id = $1", [orderId]),
      query(
        "SELECT id, order_id, sender_id, receiver_id, message, created_at, is_read FROM messages WHERE order_id = $1 ORDER BY created_at ASC",
        [orderId]
      ),
    ]);

    const order = orderRows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });

    const { rows: productRows } = await query(
      "SELECT id, farmer_id, name, category, price, quantity, location, image_url, created_at FROM products WHERE id = $1",
      [order.product_id]
    );
    const productRow = productRows[0] || null;

    const [buyerRow, farmerRow] = await Promise.all([
      query("SELECT id, full_name, location, business_name, profile_image_url, role FROM users WHERE id = $1", [order.buyer_id]),
      productRow?.farmer_id
        ? query("SELECT id, full_name, location, business_name, profile_image_url, role FROM users WHERE id = $1", [productRow.farmer_id])
        : Promise.resolve({ rows: [] }),
    ]);

    const buyer = buyerRow.rows[0] || null;
    const farmer = farmerRow.rows[0] || null;

    return res.json({
      order,
      product: productRow
        ? { id: productRow.id, name: productRow.name, location: productRow.location || "", imageUrl: productRow.image_url || "", farmerId: productRow.farmer_id || null }
        : null,
      buyer: buyer ? { id: buyer.id, name: buyer.full_name || "Buyer", location: buyer.location || "", businessName: buyer.business_name || "", avatarUrl: buyer.profile_image_url || "" } : null,
      farmer: farmer ? { id: farmer.id, name: farmer.full_name || "Farmer", location: farmer.location || "", businessName: farmer.business_name || "", avatarUrl: farmer.profile_image_url || "" } : null,
      messages,
      receiverOptions: [
        { label: "Buyer", value: order.buyer_id, name: buyer?.full_name || "Buyer" },
        { label: "Farmer", value: productRow?.farmer_id || null, name: farmer?.full_name || "Farmer" },
      ].filter((item) => !!item.value),
    });
  })
);

// ── Send admin chat message ────────────────────────────────────────
// POST /api/admin/chat/threads/:orderId/messages  body: { receiverId, message }
router.post(
  "/chat/threads/:orderId/messages",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.orderId);
    const receiverId = normalizeText(req.body.receiverId);
    const message = normalizeText(req.body.message);

    if (!orderId) return res.status(400).json({ message: "Missing order id." });
    if (!receiverId) return res.status(400).json({ message: "Missing receiver id." });
    if (!message) return res.status(400).json({ message: "Message cannot be empty." });

    const { rows } = await query(
      `INSERT INTO messages (order_id, sender_id, receiver_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [orderId, req.user.id, receiverId, message]
    );

    emitMessageNew({ orderId, senderId: req.user.id, receiverId });
    emitOrderChanged(orderId, null, null);

    return res.status(201).json({ message: rows[0] });
  })
);

// ── Clear chat thread (admin) ──────────────────────────────────────
// DELETE /api/admin/chat/threads/:orderId/messages
router.delete(
  "/chat/threads/:orderId/messages",
  asyncHandler(async (req, res) => {
    const orderId = normalizeText(req.params.orderId);
    if (!orderId) return res.status(400).json({ message: "Missing order id." });

    await query("DELETE FROM messages WHERE order_id = $1", [orderId]);
    emitToOrder(orderId, "message:cleared", { orderId });
    return res.json({ message: "Chat thread cleared." });
  })
);

// ── System report ──────────────────────────────────────────────────
// GET /api/admin/report
router.get(
  "/report",
  asyncHandler(async (_req, res) => {
    const { rows: statusRows } = await query("SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status");
    const statusTotals = statusRows.reduce(
      (acc, row) => ({ ...acc, [row.status]: row.count }),
      { pending: 0, accepted: 0, rejected: 0 }
    );

    const { rows: messages } = await query(
      "SELECT id, message, sender_id, receiver_id, created_at FROM messages WHERE message ILIKE 'Issue reported:%' ORDER BY created_at DESC"
    );

    const userIds = [...new Set([...messages.map((m) => m.sender_id), ...messages.map((m) => m.receiver_id)].filter(Boolean).map(String))];
    const usersMap = new Map();
    if (userIds.length) {
      const { rows: usersData } = await query("SELECT id, full_name, email FROM users WHERE id = ANY($1::uuid[])", [userIds]);
      usersData.forEach((u) => usersMap.set(String(u.id), u.full_name || u.email || "User"));
    }

    const issues = messages.map((m) => ({
      id: m.id,
      message: String(m.message || "").replace(/^Issue reported:\s*/i, "").trim(),
      senderId: m.sender_id,
      senderName: usersMap.get(String(m.sender_id)) || "Unknown",
      receiverId: m.receiver_id,
      receiverName: usersMap.get(String(m.receiver_id)) || "Unknown",
      createdAt: m.created_at,
    }));

    const [{ rows: countUsers }, { rows: countProducts }, { rows: countOrders }, { rows: countChats }, { rows: countReports }] =
      await Promise.all([
        query("SELECT COUNT(*)::int AS count FROM users"),
        query("SELECT COUNT(*)::int AS count FROM products"),
        query("SELECT COUNT(*)::int AS count FROM orders"),
        query("SELECT COUNT(*)::int AS count FROM messages WHERE message NOT ILIKE 'Issue reported:%'"),
        query("SELECT COUNT(*)::int AS count FROM messages WHERE message ILIKE 'Issue reported:%'"),
      ]);

    const stats = {
      activeUsers: countUsers[0]?.count || 0,
      totalProducts: countProducts[0]?.count || 0,
      totalOrders: countOrders[0]?.count || 0,
      openChats: countChats[0]?.count || 0,
      reportItems: countReports[0]?.count || 0,
      notificationCount: (countOrders[0]?.count || 0) + (countReports[0]?.count || 0),
    };

    return res.json({
      stats,
      statusTotals,
      summaryRows: [
        { label: "Users", value: formatNumber(stats.activeUsers) },
        { label: "Products", value: formatNumber(stats.totalProducts) },
        { label: "Orders", value: formatNumber(stats.totalOrders) },
        { label: "Notifications", value: formatNumber(stats.notificationCount) },
      ],
      issues,
    });
  })
);

export default router;
