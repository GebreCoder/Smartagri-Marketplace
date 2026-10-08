import bcrypt from "bcryptjs";
import { query } from "./db.js";
import { config } from "./config.js";

const run = async () => {
  console.log("🌱 Seeding smartagri_db ...");

  // ── Admin account ────────────────────────────────────────────────
  const adminEmail = config.seed.adminEmail.toLowerCase();
  const { rows: existingAdmin } = await query("SELECT id FROM users WHERE LOWER(email) = $1", [adminEmail]);

  if (existingAdmin[0]) {
    console.log(`   ✓ Admin already exists (${adminEmail})`);
  } else {
    const passwordHash = await bcrypt.hash(config.seed.adminPassword, 10);
    await query(
      `INSERT INTO users (full_name, email, phone_number, role, business_name, location, password)
       VALUES ($1, $2, $3, 'admin', '', '', $4)`,
      [config.seed.adminName, adminEmail, "+251-900-000-000", passwordHash]
    );
    console.log(`   ✓ Admin created: ${adminEmail} / ${config.seed.adminPassword}`);
  }

  // ── Optional demo data ───────────────────────────────────────────
  if (process.env.SEED_DEMO === "true") {
    console.log("   · Adding demo farmers, buyers and products ...");

    const demo = [
      { full_name: "Abebe Tesfaye", email: "farmer@smartagri.com", phone: "+251-911-111-111", role: "farmer", business_name: "Green Valley Farms", location: "Addis Ababa", password: "farmer123" },
      { full_name: "Nana Lemma", email: "buyer@smartagri.com", phone: "+251-922-222-222", role: "buyer", business_name: "Nana Restaurants", location: "Addis Ababa", password: "buyer123" },
    ];

    const userIds = {};
    for (const item of demo) {
      const { rows } = await query("SELECT id FROM users WHERE LOWER(email) = $1", [item.email]);
      if (!rows[0]) {
        const passwordHash = await bcrypt.hash(item.password, 10);
        const { rows: created } = await query(
          `INSERT INTO users (full_name, email, phone_number, role, business_name, location, password)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [item.full_name, item.email, item.phone, item.role, item.business_name, item.location, passwordHash]
        );
        userIds[item.role] = created[0].id;
        console.log(`   ✓ Demo ${item.role} created: ${item.email} / ${item.password}`);
      } else {
        userIds[item.role] = rows[0].id;
      }
    }

    const farmerId = userIds.farmer;
    if (farmerId) {
      const { rows: productCount } = await query("SELECT COUNT(*)::int AS count FROM products WHERE farmer_id = $1", [farmerId]);
      if (!productCount[0].count) {
        const products = [
          { name: "Organic Tomatoes", category: "Vegetables", description: "Fresh organic tomatoes from a verified farm.", price: 60, quantity: 500, location: "Addis Ababa", image_url: "" },
          { name: "Premium Teff", category: "Grains", description: "High quality white teff, bulk orders welcome.", price: 110, quantity: 2000, location: "Addis Ababa", image_url: "" },
          { name: "Fresh Avocados", category: "Fruits", description: "Creamy avocados harvested this week.", price: 35, quantity: 800, location: "Addis Ababa", image_url: "" },
          { name: "Red Onions", category: "Vegetables", description: "Sweet red onions from the highlands.", price: 45, quantity: 320, location: "Addis Ababa", image_url: "" },
          { name: "Fresh Potatoes", category: "Vegetables", description: "High-yield potatoes for wholesale.", price: 30, quantity: 600, location: "Addis Ababa", image_url: "" },
          { name: "Cabbage", category: "Vegetables", description: "Crisp green cabbage heads.", price: 25, quantity: 120, location: "Addis Ababa", image_url: "" },
        ];
        for (const p of products) {
          await query(
            `INSERT INTO products (farmer_id, name, category, description, price, quantity, location)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [farmerId, p.name, p.category, p.description, p.price, p.quantity, p.location]
          );
        }
        console.log("   ✓ Demo products created");
      }

      // ── Demo crops ──
      const { rows: cropCount } = await query("SELECT COUNT(*)::int AS count FROM crops WHERE farmer_id = $1", [farmerId]);
      if (!cropCount[0].count) {
        const crops = [
          { name: "Tomatoes", category: "Vegetables", growth_stage: "Flowering", planted_date: "2026-02-20", progress: 72, health: "Good" },
          { name: "Wheat", category: "Grains", growth_stage: "Growing", planted_date: "2026-02-10", progress: 54, health: "Good" },
          { name: "Onions", category: "Vegetables", growth_stage: "Harvest Ready", planted_date: "2026-01-15", progress: 92, health: "Good" },
          { name: "Cabbage", category: "Vegetables", growth_stage: "Vegetative", planted_date: "2026-02-25", progress: 48, health: "Fair" },
        ];
        for (const c of crops) {
          await query(
            `INSERT INTO crops (farmer_id, name, category, growth_stage, planted_date, progress, health)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [farmerId, c.name, c.category, c.growth_stage, c.planted_date, c.progress, c.health]
          );
        }
        console.log("   ✓ Demo crops created");
      }

      // ── Demo farm activities (calendar) ──
      const { rows: activityCount } = await query("SELECT COUNT(*)::int AS count FROM farm_activities WHERE farmer_id = $1", [farmerId]);
      if (!activityCount[0].count) {
        const activities = [
          { title: "Irrigation", activity_type: "irrigation", crop_name: "Tomatoes", activity_date: "2026-05-22" },
          { title: "Fertilization", activity_type: "fertilization", crop_name: "Wheat", activity_date: "2026-05-23" },
          { title: "Pest Control", activity_type: "pest_control", crop_name: "Cabbage", activity_date: "2026-05-24" },
          { title: "Harvest", activity_type: "harvest", crop_name: "Onions", activity_date: "2026-05-26" },
          { title: "Delivery", activity_type: "delivery", crop_name: "3 Orders", activity_date: "2026-05-28" },
        ];
        for (const a of activities) {
          await query(
            `INSERT INTO farm_activities (farmer_id, title, activity_type, crop_name, activity_date)
             VALUES ($1, $2, $3, $4, $5)`,
            [farmerId, a.title, a.activity_type, a.crop_name, a.activity_date]
          );
        }
        console.log("   ✓ Demo farm activities created");
      }

      // ── Demo harvests (production) ──
      const { rows: harvestCount } = await query("SELECT COUNT(*)::int AS count FROM harvests WHERE farmer_id = $1", [farmerId]);
      if (!harvestCount[0].count) {
        const harvests = [
          { crop_name: "Tomatoes", category: "Vegetables", quantity_kg: 1250 },
          { crop_name: "Wheat", category: "Grains", quantity_kg: 950 },
          { crop_name: "Avocados", category: "Fruits", quantity_kg: 650 },
          { crop_name: "Mixed", category: "Other", quantity_kg: 400 },
        ];
        for (const h of harvests) {
          await query(
            `INSERT INTO harvests (farmer_id, crop_name, category, quantity_kg)
             VALUES ($1, $2, $3, $4)`,
            [farmerId, h.crop_name, h.category, h.quantity_kg]
          );
        }
        console.log("   ✓ Demo harvests created");
      }
    }

    // ── Demo market prices (global reference data) ──
    const { rows: priceCount } = await query("SELECT COUNT(*)::int AS count FROM market_prices");
    if (!priceCount[0].count) {
      const prices = [
        { name: "Tomatoes", category: "Vegetables", unit: "kg", price: 60, change_pct: 12, trend: "up" },
        { name: "Onions", category: "Vegetables", unit: "kg", price: 45, change_pct: -5, trend: "down" },
        { name: "Potatoes", category: "Vegetables", unit: "kg", price: 30, change_pct: 8, trend: "up" },
        { name: "Wheat", category: "Grains", unit: "100kg", price: 2800, change_pct: 3, trend: "up" },
        { name: "Avocado", category: "Fruits", unit: "kg", price: 110, change_pct: 9, trend: "up" },
        { name: "Cabbage", category: "Vegetables", unit: "kg", price: 25, change_pct: -2, trend: "down" },
        { name: "Carrots", category: "Vegetables", unit: "kg", price: 35, change_pct: 4, trend: "up" },
        { name: "Teff", category: "Grains", unit: "100kg", price: 9500, change_pct: 2, trend: "up" },
        { name: "Coffee Beans", category: "Other", unit: "kg", price: 450, change_pct: 6, trend: "up" },
      ];
      for (const p of prices) {
        await query(
          `INSERT INTO market_prices (name, category, unit, price, change_pct, trend)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [p.name, p.category, p.unit, p.price, p.change_pct, p.trend]
        );
      }
      console.log("   ✓ Demo market prices created");
    }

    // ── Demo favorites (buyer follows farmer + saves products) ──
    const buyerId = userIds.buyer;
    if (buyerId && farmerId) {
      const { rows: favCount } = await query("SELECT COUNT(*)::int AS count FROM favorites WHERE buyer_id = $1", [buyerId]);
      if (!favCount[0].count) {
        const { rows: demoProducts } = await query("SELECT id FROM products WHERE farmer_id = $1 LIMIT 3", [farmerId]);
        await query(
          "INSERT INTO favorites (buyer_id, farmer_id) VALUES ($1, $2)",
          [buyerId, farmerId]
        );
        for (const product of demoProducts) {
          await query(
            "INSERT INTO favorites (buyer_id, product_id) VALUES ($1, $2)",
            [buyerId, product.id]
          );
        }
        console.log("   ✓ Demo favorites created");
      }
    }
  }

  console.log("✅ Seed complete.");
  process.exit(0);
};

run().catch((error) => {
  console.error("❌ Seed failed:", error.message);
  process.exit(1);
});
