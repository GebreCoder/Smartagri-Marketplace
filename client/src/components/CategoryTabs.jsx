export default function CategoryTabs({ categories, value, onChange }) {
  return (
    <div className="tabs-row">
      {categories.map((category) => {
        const active = value === category;
        return (
          <button key={category} className={`tab${active ? " tab-active" : ""}`} onClick={() => onChange(category)}>
            {category}
          </button>
        );
      })}
    </div>
  );
}
