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
      { full_name: "Abebe Tesfaye", email: "farmer@agrispark.com", phone: "+251-911-111-111", role: "farmer", business_name: "Green Valley Farms", location: "Addis Ababa", password: "farmer123" },
      { full_name: "Nana Lemma", email: "buyer@agrispark.com", phone: "+251-922-222-222", role: "buyer", business_name: "Nana Restaurants", location: "Addis Ababa", password: "buyer123" },
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
    }
  }

  console.log("✅ Seed complete.");
  process.exit(0);
};

run().catch((error) => {
  console.error("❌ Seed failed:", error.message);
  process.exit(1);
});
