import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../Icon.jsx";
import ChatFab from "../components/ChatFab.jsx";
import Modal from "../components/Modal.jsx";
import AiChatbot from "../components/AiChatbot.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import "./landing.css";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

const carouselImageset = [
  { id: "1", image: "/images/agri_hero-1.jpg", title: "Fresh Harvest, Straight From Farmers" },
  { id: "2", image: "/images/agri_hero-3.png", title: "Trusted Produce From Local Communities" },
  { id: "3", image: "/images/agri_hero-4.png", title: "Better Prices For Buyers And Growers" },
  { id: "4", image: "/images/agri_hero-5.jpg", title: "Reliable Agri Marketplace, Every Day" },
];

const localProducts = [
  { id: "local-1", name: "Organic Tomatoes", price: "50 ETB/kg", seller: "Green Valley Farms", image: "/images/bruna-branco.jpg" },
  { id: "local-2", name: "Premium Coffee Beans", price: "380 ETB/kg", seller: "Sidama Growers", image: "/images/chris-barbalis-0EWai5-kuBo-unsplash.jpg" },
];

const categories = [
  { name: "Vegetables", image: "/images/bruna-branco.jpg" },
  { name: "Fruits", image: "/images/rens-d-ozMroXStJ2w-unsplash.jpg" },
  { name: "Grains", image: "/images/cereals-image.avif" },
];

const features = [
  { title: "For Farmers", text: "Sell Directly", icon: "leaf-outline" },
  { title: "For Buyers", text: "Bulk Purchasing", icon: "cart-outline" },
  { title: "Real-time", text: "Chat", icon: "chatbubble-ellipses-outline" },
  { title: "Order", text: "Management", icon: "receipt-outline" },
];

const steps = [
  { icon: "person-add-outline", title: "1. Create account", text: "Sign up as a farmer or buyer with basic verification." },
  { icon: "search-outline", title: "2. List or browse products", text: "Upload product details or filter listings by type and location." },
  { icon: "chatbubble-ellipses-outline", title: "3. Place or receive orders", text: "Coordinate quantity, price, and delivery with built-in chat." },
  { icon: "checkmark-done-outline", title: "4. Confirm transactions", text: "Mark deliveries complete and leave feedback for trusted trading." },
];

const pins = [
  { city: "Bahir Dar", top: "24%", left: "20%" },
  { city: "Adama", top: "48%", left: "56%" },
  { city: "Hawassa", top: "68%", left: "52%" },
  { city: "Mekelle", top: "14%", left: "66%" },
];

const reviews = [
  { type: "Farmer Testimonial", quote: "AgriSpark helped me sell directly and improve my income.", author: "Abebe T.", place: "Gondar" },
  { type: "Buyer Testimonial", quote: "We consistently get fresh produce in bulk with lower cost.", author: "Nana L.", place: "Addis Ababa" },
];

function Carousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % carouselImageset.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="land-carousel">
      <div className="land-slide">
        <img src={carouselImageset[activeIndex].image} alt={carouselImageset[activeIndex].title} />
        <div className="land-slide-overlay">
          <span>{carouselImageset[activeIndex].title}</span>
        </div>
      </div>
      <div className="land-pagination">
        {carouselImageset.map((item, index) => (
          <span key={item.id} className={`land-dot ${index === activeIndex ? "land-dot-active" : ""}`} />
        ))}
      </div>
    </div>
  );
}

function TopProduct() {
  const [products, setProducts] = useState(localProducts);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const featured = await api.get("/api/products/featured");
        const combined = [...(featured.newest || []), ...(featured.bulk || []), ...(featured.organic || [])];
        const unique = [];
        const seen = new Set();
        for (const item of combined) {
          const key = String(item?.id || item?.name || "").trim();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          unique.push({
            id: String(item?.id || item?.name || unique.length),
            name: item?.name || "Fresh Product",
            price: item?.price_label || (item?.price ? `${item.price} ETB` : "Available now"),
            seller: item?.farmer_name || item?.seller || "Local farmer",
            image: item?.image_url || "/images/cereals-image.avif",
          });
          if (unique.length >= 4) break;
        }
        if (mounted && unique.length > 0) setProducts(unique);
      } catch {
        /* fall back to bundled products */
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="land-section">
      <h2 className="land-heading">Top Products</h2>
      {products.map((product) => (
        <div key={product.id || product.name} className="land-top-card">
          <img src={product.image || FALLBACK_IMAGE} alt={product.name} className="land-top-image" />
          <div className="land-top-name">{product.name}</div>
          <div className="land-top-price">{product.price}</div>
          <div className="land-top-seller">{product.seller}</div>
        </div>
      ))}
    </section>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="land-page">
      <header className="land-header">
        <div className="land-header-inner">
          <div className="land-brand" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
            <div className="land-logo-shell">
              <img src="/images/logo-1.png" alt="AgriSpark logo" />
            </div>
            <div>
              <div className="land-logo-text">AgriSpark</div>
              <div className="land-brand-sub">Secure . Verified</div>
            </div>
          </div>

          <nav className="land-nav">
            <Link to="/products" className="land-nav-browse">
              Browse <Icon name="chevron-forward" size={14} color="#1F6E33" />
            </Link>
            {user ? (
              <>
                <Link to={user.role === "admin" ? "/admin" : user.role === "farmer" ? "/farmer" : "/buyer"} className="btn btn-soft btn-sm">
                  Dashboard
                </Link>
                <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate("/"); }}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login-register?mode=login" className="btn btn-ghost btn-sm">
                  Login
                </Link>
                <Link to="/login-register?mode=register" className="btn btn-primary btn-sm">
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="land-body">
        {/* Hero */}
        <section className="land-hero">
          <h1 className="land-hero-title">Connecting Farmers and Buyers Directly</h1>
          <p className="land-hero-sub">Buy and sell quality agricultural products without middlemen.</p>
          <div className="land-hero-carousel">
            <Carousel />
          </div>
          <div className="land-hero-actions">
            {user ? (
              <button className="land-btn-primary" onClick={() => navigate(user.role === "farmer" ? "/farmer" : user.role === "admin" ? "/admin" : "/buyer")}>
                Go to Dashboard
              </button>
            ) : (
              <>
                <button className="land-btn-primary" onClick={() => navigate("/login-register?mode=login")}>
                  Login
                </button>
                <button className="land-btn-secondary" onClick={() => navigate("/login-register?mode=register")}>
                  Register
                </button>
              </>
            )}
          </div>
        </section>

        {/* Categories */}
        <section className="land-section">
          <h2 className="land-heading">Explore Categories</h2>
          <div className="land-cat-grid">
            {categories.map((category) => (
              <button key={category.name} className="land-cat-card" onClick={() => navigate("/products")}>
                <img src={category.image} alt={category.name} />
                <span className="land-cat-name">{category.name}</span>
              </button>
            ))}
          </div>
        </section>

        <TopProduct />

        {/* Features */}
        <section className="land-section">
          <h2 className="land-heading">Features</h2>
          <div className="land-feature-grid">
            {features.map((card) => (
              <div key={card.title + card.text} className="land-feature-card">
                <div className="land-feature-icon">
                  <Icon name={card.icon} size={18} color="#1F6E33" />
                </div>
                <div className="land-feature-title">{card.title}</div>
                <div className="land-feature-text">{card.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="land-section land-work-section">
          <h2 className="land-heading">How It Works</h2>
          {steps.map((step) => (
            <div key={step.title} className="land-step-card">
              <div className="land-step-icon">
                <Icon name={step.icon} size={22} color="#1F6E33" />
              </div>
              <div className="land-step-copy">
                <div className="land-step-title">{step.title}</div>
                <div className="land-step-text">{step.text}</div>
              </div>
            </div>
          ))}
        </section>

        {/* Connect locally */}
        <section className="land-section">
          <h2 className="land-heading">Connect Locally</h2>
          <div className="land-map-card">
            <div className="land-road land-road-1" />
            <div className="land-road land-road-2" />
            <div className="land-tag">
              <div className="land-tag-title">Ethiopia</div>
              <div className="land-tag-sub">Farmers + Buyers</div>
            </div>
            {pins.map((pin) => (
              <span key={pin.city} className="land-pin" style={{ top: pin.top, left: pin.left }}>
                <Icon name="location" size={18} color="#1E7A35" />
              </span>
            ))}
            <span className="land-main-pin">
              <Icon name="location" size={24} color="#0E6B2E" />
            </span>
            <div className="land-sticky-tip">
              <div className="land-sticky-title">Addis Ababa</div>
              <div className="land-sticky-sub">128 active farmers</div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="land-section">
          <h2 className="land-heading">Trusted by Farmers and Buyers</h2>
          <div className="land-review-row">
            {reviews.map((item) => (
              <div key={item.type} className="land-review-card">
                <div className="land-review-badge">
                  <Icon name="shield-checkmark-outline" size={12} color="#1F6E33" />
                  <span>{item.type}</span>
                </div>
                <p className="land-review-quote">“{item.quote}”</p>
                <div className="land-review-author">{item.author}</div>
                <div className="land-review-place">{item.place}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="land-footer">
        <div className="land-footer-card">
          <div className="land-footer-title">Grow with AgriSpark</div>
          <div className="land-footer-sub">Helping buyers and farmers connect directly with trusted profiles.</div>
          <div className="land-footer-chips">
            <span className="land-footer-chip">
              <Icon name="mail-outline" size={14} color="#1E7A35" />
              info@agrispark.com
            </span>
            <span className="land-footer-chip">
              <Icon name="help-circle-outline" size={14} color="#1E7A35" />
              FAQ
            </span>
          </div>
          <div className="land-footer-social">
            <Icon name="logo-facebook" size={18} color="#203422" />
            <Icon name="logo-linkedin" size={18} color="#203422" />
            <Icon name="logo-instagram" size={18} color="#203422" />
          </div>
          <div className="land-footer-divider" />
          <div className="land-footer-note">Privacy and terms apply. Secure transactions & verified profiles.</div>
        </div>
      </footer>

      <ChatFab onClick={() => setChatOpen(true)} />

      <Modal open={chatOpen} onClose={() => setChatOpen(false)} maxWidth={460}>
        <div style={{ height: "80vh", minHeight: 520 }}>
          <AiChatbot onClose={() => setChatOpen(false)} />
        </div>
      </Modal>
    </div>
  );
}
