import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Layers, Edit3, GitMerge, Trash2, X, AlertTriangle } from 'lucide-react';
import './AdminAuctionModals.css';
import './AdminCategoryModals.css';

function generateSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function AdminCreateCategoryModalForm({ onClose, onConfirm, isLoading }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isSlugManual, setIsSlugManual] = useState(false);
  const [error, setError] = useState('');

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (!isSlugManual) {
      setSlug(generateSlug(val));
    }
  };

  const handleSlugChange = (e) => {
    setIsSlugManual(true);
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      setError('Category name must be at least 2 characters');
      return;
    }
    if (!slug.trim() || slug.trim().length < 2) {
      setError('A valid slug (min 2 characters, lowercase alphanumeric and hyphens) is required');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug.trim())) {
      setError('Slug can only contain lowercase letters, numbers, and hyphens');
      return;
    }
    setError('');
    onConfirm({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
    });
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <Layers size={18} className="text-brand" />
            <h3 className="admin-modal-title">Create Category</h3>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <p className="admin-category-modal-desc">
          Add a new marketplace category for taxonomy grouping and item classifications.
        </p>

        {error && <div className="admin-modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="create-category-name" className="admin-form-label">
              Category Name <span className="text-danger">*</span>
            </label>
            <input
              id="create-category-name"
              type="text"
              className="admin-form-input"
              placeholder="e.g. Fine Art & Sculptures"
              value={name}
              onChange={handleNameChange}
              disabled={isLoading}
              maxLength={100}
            />
          </div>

          <div className="admin-form-group">
            <label htmlFor="create-category-slug" className="admin-form-label">
              URL Slug <span className="text-danger">*</span>
            </label>
            <input
              id="create-category-slug"
              type="text"
              className="admin-form-input font-mono"
              placeholder="fine-art-sculptures"
              value={slug}
              onChange={handleSlugChange}
              disabled={isLoading}
              maxLength={100}
            />
            <span className="admin-slug-hint">
              Used in routes and filtering. Alphanumeric characters and hyphens only.
            </span>
          </div>

          <div className="admin-form-group">
            <label htmlFor="create-category-desc" className="admin-form-label">
              Description (Optional)
            </label>
            <textarea
              id="create-category-desc"
              className="admin-form-textarea"
              rows={3}
              placeholder="Brief description of merchandise belonging in this category..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              maxLength={400}
            />
          </div>

          <div className="admin-modal-actions">
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--sm btn--primary"
              disabled={isLoading}
            >
              {isLoading ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

AdminCreateCategoryModalForm.propTypes = {
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
};

export function AdminCreateCategoryModal({ isOpen, onClose, onConfirm, isLoading }) {
  if (!isOpen) return null;
  return (
    <AdminCreateCategoryModalForm
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}

AdminCreateCategoryModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
};

function AdminEditCategoryModalForm({ category, onClose, onConfirm, isLoading }) {
  const [name, setName] = useState(category.name || '');
  const [slug, setSlug] = useState(category.slug || '');
  const [description, setDescription] = useState(category.description || '');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      setError('Category name must be at least 2 characters');
      return;
    }
    if (!slug.trim() || slug.trim().length < 2) {
      setError('A valid slug is required');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug.trim())) {
      setError('Slug can only contain lowercase letters, numbers, and hyphens');
      return;
    }
    setError('');
    onConfirm(category.id, {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
    });
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <Edit3 size={18} className="text-brand" />
            <h3 className="admin-modal-title">Edit Category</h3>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <p className="admin-category-modal-desc">
          Update taxonomy metadata for <strong>{category.name}</strong>.
        </p>

        {error && <div className="admin-modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="edit-category-name" className="admin-form-label">
              Category Name <span className="text-danger">*</span>
            </label>
            <input
              id="edit-category-name"
              type="text"
              className="admin-form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              maxLength={100}
            />
          </div>

          <div className="admin-form-group">
            <label htmlFor="edit-category-slug" className="admin-form-label">
              URL Slug <span className="text-danger">*</span>
            </label>
            <input
              id="edit-category-slug"
              type="text"
              className="admin-form-input font-mono"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              disabled={isLoading}
              maxLength={100}
            />
          </div>

          <div className="admin-form-group">
            <label htmlFor="edit-category-desc" className="admin-form-label">
              Description
            </label>
            <textarea
              id="edit-category-desc"
              className="admin-form-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              maxLength={400}
            />
          </div>

          <div className="admin-modal-actions">
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--sm btn--primary"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

AdminEditCategoryModalForm.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    slug: PropTypes.string,
    description: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
};

export function AdminEditCategoryModal({ isOpen, onClose, onConfirm, category, isLoading }) {
  if (!isOpen || !category) return null;
  return (
    <AdminEditCategoryModalForm
      key={category.id}
      category={category}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}

AdminEditCategoryModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  category: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    slug: PropTypes.string,
    description: PropTypes.string,
  }),
  isLoading: PropTypes.bool,
};

function AdminMergeCategoryModalForm({
  sourceCategory,
  allCategories,
  onClose,
  onConfirm,
  isLoading,
}) {
  const eligibleTargets = useMemo(
    () => allCategories.filter((c) => c.id !== sourceCategory?.id),
    [allCategories, sourceCategory]
  );

  const [targetCategoryId, setTargetCategoryId] = useState(eligibleTargets[0]?.id || '');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!targetCategoryId) {
      setError('Please choose an eligible destination category');
      return;
    }
    setError('');
    onConfirm(sourceCategory.id, targetCategoryId);
  };

  const targetCategory = allCategories.find((c) => c.id === targetCategoryId);

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <GitMerge size={18} className="text-warning" />
            <h3 className="admin-modal-title">Merge Categories</h3>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <p className="admin-category-modal-desc">
          Reassign all auctions from <strong>{sourceCategory.name}</strong> into another target category,
          and permanently delete the source category.
        </p>

        <div className="admin-category-preview">
          <div className="admin-category-preview-row">
            <span className="admin-category-preview-label">Source Category:</span>
            <span className="admin-category-preview-val">{sourceCategory.name}</span>
          </div>
          <div className="admin-category-preview-row">
            <span className="admin-category-preview-label">Auctions to Reassign:</span>
            <span className="admin-category-preview-val font-mono">
              {sourceCategory.auctionCount || 0} active/archived lots
            </span>
          </div>
        </div>

        <div className="admin-modal-warning admin-modal-warning--warning">
          <strong>Irreversible Taxonomy Merge:</strong>
          <br />
          All {sourceCategory.auctionCount || 0} auctions will be migrated to the selected target category
          in an atomic transaction. The source taxonomy &ldquo;{sourceCategory.name}&rdquo; will be deleted immediately.
        </div>

        {error && <div className="admin-modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="merge-target-select" className="admin-form-label">
              Target Destination Category <span className="text-danger">*</span>
            </label>
            <select
              id="merge-target-select"
              className="admin-form-select"
              value={targetCategoryId}
              onChange={(e) => setTargetCategoryId(e.target.value)}
              disabled={isLoading || eligibleTargets.length === 0}
            >
              {eligibleTargets.length === 0 && <option value="">No other categories available</option>}
              {eligibleTargets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.auctionCount || 0} existing lots)
                </option>
              ))}
            </select>
          </div>

          <div className="admin-modal-actions">
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--sm btn--primary"
              disabled={isLoading || !targetCategoryId}
            >
              {isLoading ? 'Merging...' : `Reassign to ${targetCategory?.name || 'Target'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

AdminMergeCategoryModalForm.propTypes = {
  sourceCategory: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    auctionCount: PropTypes.number,
  }).isRequired,
  allCategories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      auctionCount: PropTypes.number,
    })
  ).isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
};

export function AdminMergeCategoryModal({
  isOpen,
  onClose,
  onConfirm,
  sourceCategory,
  allCategories = [],
  isLoading,
}) {
  if (!isOpen || !sourceCategory) return null;
  return (
    <AdminMergeCategoryModalForm
      key={sourceCategory.id}
      sourceCategory={sourceCategory}
      allCategories={allCategories}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}

AdminMergeCategoryModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  sourceCategory: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    auctionCount: PropTypes.number,
  }),
  allCategories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      auctionCount: PropTypes.number,
    })
  ),
  isLoading: PropTypes.bool,
};

export function AdminDeleteCategoryModal({ isOpen, onClose, onConfirm, category, isLoading }) {
  if (!isOpen || !category) return null;

  const hasAuctions = (category.auctionCount || 0) > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (hasAuctions) return;
    onConfirm(category.id);
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="admin-modal-title-wrap">
            <Trash2 size={18} className="text-danger" />
            <h3 className="admin-modal-title">Delete Category</h3>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <p className="admin-category-modal-desc">
          You are about to delete <strong>{category.name}</strong> (<span className="font-mono">{category.slug}</span>).
        </p>

        {hasAuctions ? (
          <div className="admin-modal-warning admin-modal-warning--danger">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <AlertTriangle size={14} />
              <strong>Cannot Delete Active Taxonomy:</strong>
            </div>
            This category currently has <strong>{category.auctionCount}</strong> associated auction lot(s).
            To preserve historical integrity, categories with linked items cannot be deleted directly.
            Please use <strong>Merge</strong> to reassign items first.
          </div>
        ) : (
          <div className="admin-modal-warning admin-modal-warning--warning">
            This category is empty and has 0 associated auctions. Once deleted, this taxonomy record cannot be recovered.
          </div>
        )}

        <div className="admin-modal-actions">
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--sm btn--danger"
            disabled={isLoading || hasAuctions}
            onClick={handleSubmit}
          >
            {isLoading ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

AdminDeleteCategoryModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  category: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    slug: PropTypes.string,
    auctionCount: PropTypes.number,
  }),
  isLoading: PropTypes.bool,
};
