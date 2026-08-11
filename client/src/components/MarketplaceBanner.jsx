import Icon from "../Icon.jsx";

const bannerMeta = {
  newest: { title: "Newest arrivals", subtitle: "Fresh listings just added", icon: "sparkles-outline", tone: "#D8F7E5" },
  bulk: { title: "Bulk deals", subtitle: "Stock up with larger orders", icon: "cube-outline", tone: "#F8EFC7" },
  organic: { title: "Organic picks", subtitle: "Certified clean harvests", icon: "leaf-outline", tone: "#E7F4EA" },
};

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1464226184884-fa280b87c399";

export default function MarketplaceBanner({ sections = {}, onPressProduct }) {
  const banners = Object.entries(sections)
    .flatMap(([key, items]) => (items || []).slice(0, 1).map((item) => ({ ...item, key })))
    .slice(0, 3);

  if (!banners.length) return null;

  return (
    <div className="banner-scroll">
      {banners.map((item) => {
        const meta = bannerMeta[item.key] || bannerMeta.newest;
        return (
          <button key={`${item.key}-${item.id}`} className="banner-card" onClick={() => onPressProduct?.(item)}>
            <div className="banner-image" style={{ background: meta.tone }}>
              <img src={item.image_url || FALLBACK_IMAGE} alt={item.name} />
            </div>
            <div className="banner-copy">
              <div className="row" style={{ gap: 8 }}>
                <Icon name={meta.icon} size={16} color="#EAF7EF" />
                <span className="banner-title">{meta.title}</span>
              </div>
              <div className="banner-subtitle">{meta.subtitle}</div>
              <div className="banner-name">{item.name}</div>
              <div className="banner-meta">
                {item.price_label} · {item.location || item.farmer_location}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
