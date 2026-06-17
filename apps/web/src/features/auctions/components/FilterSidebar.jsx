import { useState, useEffect, useRef } from 'react';
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
  const [localFilters, setLocalFilters] = useState(filters);
  const timeoutRef = useRef(null);

  // Sync from props if they change externally (e.g. clear filters or browser back button)
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    setLocalFilters(prev => {
      const next = { ...prev, [name]: value };
      
      if (name === 'minPrice' || name === 'maxPrice') {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          onChange(next);
        }, 1000);
      } else {
        onChange(next);
      }
      
      return next;
    });
  };

  const handleClearFilters = () => {
    const cleared = {
      categoryId: '',
      minPrice: '',
      maxPrice: '',
      status: 'active'
    };
    setLocalFilters(cleared);
    onChange(cleared);
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
          value={localFilters.status || ''}
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
            value={localFilters.categoryId || ''}
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
            value={localFilters.minPrice || ''}
            onChange={handleInputChange}
            className="filter-input"
            min="0"
          />
          <span className="price-separator">-</span>
          <input
            type="number"
            name="maxPrice"
            placeholder="Max"
            value={localFilters.maxPrice || ''}
            onChange={handleInputChange}
            className="filter-input"
            min="0"
          />
        </div>
      </div>
    </aside>
  );
}
