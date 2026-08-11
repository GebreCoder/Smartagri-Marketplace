import Icon from "../Icon.jsx";

export default function SearchBar({ value, onChange, onSubmit, placeholder = "Search products" }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter") onSubmit?.();
  };

  return (
    <div className="row">
      <div className="search-shell grow">
        <Icon name="search" size={18} color="#7A8E81" />
        <input
          className="search-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
      </div>
      <button className="btn btn-soft" style={{ width: 52, height: 52, borderRadius: 16 }} onClick={onSubmit} aria-label="Search">
        <Icon name="options-outline" size={18} color="#1E7A35" />
      </button>
    </div>
  );
}
