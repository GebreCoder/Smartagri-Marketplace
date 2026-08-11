import { Router } from "express";
import { query } from "../db.js";
import { requireAuth, requireFarmer } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/error.js";
import { emitGlobal } from "../socket.js";
import { normalizeText, shapeProduct } from "../utils.js";

const router = Router();

const PRODUCT_COLUMNS = `
  p.id, p.farmer_id, p.name, p.category, p.description, p.price, p.quantity,
  p.location, p.image_url, p.created_at,
  u.full_name AS farmer_full_name,
  u.location AS farmer_location,
  u.profile_image_url AS farmer_profile_image_url
`;

const productSelect = (where = "", params = []) =>
  query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p
     LEFT JOIN users u ON u.id = p.farmer_id
     ${where}
     ORDER BY p.created_at DESC`,
    params
  );

const toShape = (row) =>
  shapeProduct(row, {
    full_name: row.farmer_full_name,
    location: row.farmer_location,
    profile_image_url: row.farmer_profile_image_url,
  });

// ── Marketplace listing ────────────────────────────────────────────
// GET /api/products?search=&category=&limit=&offset=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 12)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const category = normalizeText(req.query.category);
    const search = normalizeText(req.query.search).replace(/[%_]/g, " ");

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(`(p.name ILIKE $${paramIndex} OR p.category ILIKE $${paramIndex} OR p.location ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
      params.push(pattern);
      paramIndex += 1;
    }
    if (category && category !== "All") {
      conditions.push(`p.category = $${paramIndex}`);
      params.push(category);
      paramIndex += 1;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    const { rows } = await productSelect(where, params.slice(0, params.length - 2));
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS count FROM products p ${where}`,
      params.slice(0, params.length - 2)
    );

    return res.json({
      products: rows.map(toShape),
      totalCount: countRows[0]?.count || 0,
    });
  })
);

// ── Featured picks ─────────────────────────────────────────────────
// GET /api/products/featured
router.get(
  "/featured",
  asyncHandler(async (_req, res) => {
    const { rows } = await productSelect("", []);
    const products = rows.map(toShape);
    const newest = products.slice(0, 3);
    const bulk = products.filter((item) => item.is_bulk).slice(0, 3);
    const organic = products.filter((item) => item.is_organic).slice(0, 3);
    return res.json({ newest, bulk, organic });
  })
);

// ── Single product ─────────────────────────────────────────────────
// GET /api/products/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await productSelect("WHERE p.id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Product not found." });
    return res.json({ product: toShape(rows[0]) });
  })
);

// ── Farmer's own products ──────────────────────────────────────────
// GET /api/products/mine  (farmer)
router.get(
  "/mine/all",
  requireAuth,
  requireFarmer,
  asyncHandler(async (req, res) => {
    const { rows } = await productSelect("WHERE p.farmer_id = $1", [req.user.id]);
    return res.json({ products: rows.map(toShape) });
  })
);

// ── Create / update product ────────────────────────────────────────
// POST /api/products  (farmer)  body: { name, category, description, price, quantity, location, imageUrl }
// PUT  /api/products/:id  (farmer, owns product)
router.post(
  "/",
  requireAuth,
  requireFarmer,
  asyncHandler(async (req, res) => {
    const name = normalizeText(req.body.name);
    const description = normalizeText(req.body.description);
    const location = normalizeText(req.body.location);
    const category = normalizeText(req.body.category) || "Vegetables";
    const price = Number(req.body.price);
    const quantity = Number(req.body.quantity);
    const imageUrl = normalizeText(req.body.imageUrl);

    if (!name || !description || !location || Number.isNaN(price) || Number.isNaN(quantity)) {
      return res.status(400).json({ message: "Invalid input. Please fill all fields correctly." });
    }

    await assertNoDuplicate({ farmerId: req.user.id, name, category, location, excludeId: null });

    const { rows } = await query(
      `INSERT INTO products (farmer_id, name, category, description, price, quantity, location, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.id, name, category, description, price, quantity, location, imageUrl]
    );

    // Buyers' marketplace refreshes live when a farmer publishes a product.
    emitGlobal("product:changed", {});
    return res.status(201).json({ product: rows[0] });
  })
);

router.put(
  "/:id",
  requireAuth,
  requireFarmer,
  asyncHandler(async (req, res) => {
    const product = await findOwnedProduct(req.params.id, req.user.id);
    if (!product) return res.status(404).json({ message: "Product not found." });

    const name = normalizeText(req.body.name ?? product.name);
    const description = normalizeText(req.body.description ?? product.description);
    const location = normalizeText(req.body.location ?? product.location);
    const category = normalizeText(req.body.category ?? product.category);
    const price = Number(req.body.price ?? product.price);
    const quantity = Number(req.body.quantity ?? product.quantity);
    const imageUrl = normalizeText(req.body.imageUrl ?? product.image_url);

    if (!name || !description || !location || Number.isNaN(price) || Number.isNaN(quantity)) {
      return res.status(400).json({ message: "Invalid input. Please fill all fields correctly." });
    }

    await assertNoDuplicate({ farmerId: req.user.id, name, category, location, excludeId: req.params.id });

    const { rows } = await query(
      `UPDATE products
       SET name = $1, category = $2, description = $3, price = $4, quantity = $5, location = $6, image_url = $7
       WHERE id = $8
       RETURNING *`,
      [name, category, description, price, quantity, location, imageUrl, req.params.id]
    );

    // Live-update buyers' marketplace with the edited product.
    emitGlobal("product:changed", {});
    return res.json({ product: rows[0] });
  })
);

// ── Delete product ─────────────────────────────────────────────────
// DELETE /api/products/:id (farmer, owns product)
router.delete(
  "/:id",
  requireAuth,
  requireFarmer,
  asyncHandler(async (req, res) => {
    const product = await findOwnedProduct(req.params.id, req.user.id);
    if (!product) return res.status(404).json({ message: "Product not found." });

    await query("DELETE FROM products WHERE id = $1", [req.params.id]);
    // Live-update buyers' marketplace with the removed product.
    emitGlobal("product:changed", {});
    return res.json({ message: "Product deleted." });
  })
);

// ── helpers ────────────────────────────────────────────────────────
const findOwnedProduct = async (productId, farmerId) => {
  const { rows } = await query("SELECT * FROM products WHERE id = $1 AND farmer_id = $2", [productId, farmerId]);
  return rows[0] || null;
};

const assertNoDuplicate = async ({ farmerId, name, category, location, excludeId }) => {
  let sql = `SELECT id FROM products WHERE farmer_id = $1 AND LOWER(name) = LOWER($2) AND LOWER(category) = LOWER($3) AND LOWER(location) = LOWER($4)`;
  const params = [farmerId, name, category, location];
  if (excludeId) {
    sql += " AND id <> $5";
    params.push(excludeId);
  }
  const { rows } = await query(sql, params);
  if (rows[0]) {
    const error = new Error("This product already exists for your account.");
    error.status = 409;
    throw error;
  }
};

export default router;
