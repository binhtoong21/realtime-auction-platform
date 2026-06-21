import { useCategories } from '../hooks/useCategories';
import './FilterPills.css';

export function FilterPills({ activeCategory, onCategoryChange }) {
  const { categories, isLoading } = useCategories();

  return (
    <div className="filter-pills-container">
      <div className="filter-pills">
        <button
          className={`filter-pill ${!activeCategory ? 'active' : ''}`}
          onClick={() => onCategoryChange('')}
        >
          All
        </button>
        {!isLoading && categories?.map(cat => (
          <button
            key={cat.id}
            className={`filter-pill ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => onCategoryChange(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  );
}
