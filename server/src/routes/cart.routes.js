import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { formatMoney, getProfileName, normalizeText, resolveImageUrl, shapeProduct } from "../utils.js";

const router = Router();
router.use(requireAuth);

const cartSelect = `
  SELECT ci.id, ci.buyer_id, ci.product_id, ci.quantity, ci.created_at,
         p.id AS p_id, p.farmer_id, p.name, p.category, p.description, p.price, p.quantity AS p_quantity,
         p.location AS p_location, p.image_url AS p_image_url, p.created_at AS p_created_at,
         u.full_name AS farmer_full_name, u.location AS farmer_location, u.profile_image_url AS farmer_profile_image_url
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
  LEFT JOIN users u ON u.id = p.farmer_id
`;

export const fetchCartRows = async (buyerId) => {
  const { rows } = await query(`${cartSelect} WHERE ci.buyer_id = $1 ORDER BY ci.created_at DESC`, [buyerId]);
  return rows;
};

export const shapeCartItem = (row) => {
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

  return {
    id: row.id,
    buyer_id: row.buyer_id,
    product_id: row.product_id,
    quantity,
    created_at: row.created_at,
    product,
    product_name: product?.name || "Product",
    farmer_name: product?.farmer_name || "Farmer",
    farmer_image_url: product?.farmer_image_url || "",
    location: product?.location || "",
    price,
    price_label: formatMoney(price),
    subtotal: price * quantity,
    subtotal_label: formatMoney(price * quantity),
  };
};

// ── GET cart ───────────────────────────────────────────────────────
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await fetchCartRows(req.user.id);
    return res.json({ items: rows.map(shapeCartItem) });
  })
);

// ── Upsert add to cart ─────────────────────────────────────────────
// POST /api/cart  body: { productId, quantity }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const productId = normalizeText(req.body.productId);
    const safeQuantity = Math.max(1, Number(req.body.quantity || 1));

    if (!productId) {
      return res.status(400).json({ message: "Missing product id." });
    }

    const { rows: existingRows } = await query(
      "SELECT id, quantity FROM cart_items WHERE buyer_id = $1 AND product_id = $2",
      [req.user.id, productId]
    );

    if (existingRows[0]?.id) {
      const nextQuantity = Number(existingRows[0].quantity || 1) + safeQuantity;
      await query("UPDATE cart_items SET quantity = $1 WHERE id = $2", [nextQuantity, existingRows[0].id]);
      return res.json({ itemId: existingRows[0].id });
    }

    const { rows } = await query(
      `INSERT INTO cart_items (buyer_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (buyer_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
       RETURNING id`,
      [req.user.id, productId, safeQuantity]
    );

    return res.status(201).json({ itemId: rows[0]?.id || null });
  })
);

// ── Update quantity ────────────────────────────────────────────────
// PATCH /api/cart/:itemId  body: { quantity }
router.patch(
  "/:itemId",
  asyncHandler(async (req, res) => {
    const safeQuantity = Math.max(1, Number(req.body.quantity || 1));
    const { rowCount } = await query(
      "UPDATE cart_items SET quantity = $1 WHERE id = $2 AND buyer_id = $3",
      [safeQuantity, req.params.itemId, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ message: "Cart item not found." });
    return res.json({ message: "Cart updated." });
  })
);

// ── Remove item ────────────────────────────────────────────────────
// DELETE /api/cart/:itemId
router.delete(
  "/:itemId",
  asyncHandler(async (req, res) => {
    await query("DELETE FROM cart_items WHERE id = $1 AND buyer_id = $2", [req.params.itemId, req.user.id]);
    return res.json({ message: "Item removed." });
  })
);

// ── Clear cart ─────────────────────────────────────────────────────
// DELETE /api/cart
router.delete(
  "/",
  asyncHandler(async (req, res) => {
    await query("DELETE FROM cart_items WHERE buyer_id = $1", [req.user.id]);
    return res.json({ message: "Cart cleared." });
  })
);

export default router;
