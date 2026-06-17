import { useCategories } from '../hooks/useCategories';
import './FilterSidebar.css';

/**
 * Sidebar component for filtering auctions by category, status, and price range.
 * @param {Object} props
 * @param {Object} props.filters - Current filter values.
 * @param {Function} props.onChange - Callback fired when filters change.
 */
export function FilterSidebar({ filters, onChange }) {
  const { categories, isLoading, error } = useCategories();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    onChange({ ...filters, [name]: value });
  };

  const handleClearFilters = () => {
    onChange({
      categoryId: '',
      minPrice: '',
      maxPrice: '',
      status: 'active'
    });
  };

  return (
    <aside className="filter-sidebar">
      <div className="filter-header">
        <h3>Filters</h3>
        <button type="button" className="btn-clear" onClick={handleClearFilters}>
          Clear All
        </button>
      </div>

      <div className="filter-section">
        {/* TODO: Search box (Title/Description) will be added here in future phases */}
      </div>

      <div className="filter-section">
        <label className="filter-label">Status</label>
        <select
          name="status"
          value={filters.status || ''}
          onChange={handleInputChange}
          className="filter-input"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
      </div>

      <div className="filter-section">
        <label className="filter-label">Category</label>
        {isLoading ? (
          <p className="filter-loading">Loading categories...</p>
        ) : error ? (
          <p className="filter-error">Failed to load</p>
        ) : (
          <select
            name="categoryId"
            value={filters.categoryId || ''}
            onChange={handleInputChange}
            className="filter-input"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="filter-section">
        <label className="filter-label">Price Range (USD)</label>
        <div className="price-inputs">
          <input
            type="number"
            name="minPrice"
            placeholder="Min"
            value={filters.minPrice || ''}
            onChange={handleInputChange}
            className="filter-input"
            min="0"
          />
          <span className="price-separator">-</span>
          <input
            type="number"
            name="maxPrice"
            placeholder="Max"
            value={filters.maxPrice || ''}
            onChange={handleInputChange}
            className="filter-input"
            min="0"
          />
        </div>
      </div>
    </aside>
  );
}
