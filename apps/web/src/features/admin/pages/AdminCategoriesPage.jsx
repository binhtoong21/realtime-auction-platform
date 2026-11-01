import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  Plus,
  RotateCw,
  Search,
  X,
  Edit3,
  GitMerge,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { useAdminCategories } from '../hooks/useAdminCategories';
import {
  AdminCreateCategoryModal,
  AdminEditCategoryModal,
  AdminMergeCategoryModal,
  AdminDeleteCategoryModal,
} from '../components/AdminCategoryModals';
import './AdminAuctionsPage.css';
import './AdminCategoriesPage.css';

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminCategoriesPage() {
  const [searchInput, setSearchInput] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [mergingCategory, setMergingCategory] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);

  const {
    categories,
    isLoading,
    error,
    refetch,
    createCategory,
    updateCategory,
    deleteCategory,
    mergeCategories,
    isMutating,
  } = useAdminCategories();

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!searchInput.trim()) return categories;
    const q = searchInput.trim().toLowerCase();
    return categories.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.slug && c.slug.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [categories, searchInput]);

  // Aggregate stats
  const totalAuctionsCount = useMemo(() => {
    return categories.reduce((acc, c) => acc + (c.auctionCount || 0), 0);
  }, [categories]);

  // Create action
  const handleCreate = useCallback(
    async (payload) => {
      try {
        await createCategory(payload);
        setIsCreateOpen(false);
        setToastMessage({
          type: 'success',
          text: `Category "${payload.name}" successfully created.`,
        });
      } catch (err) {
        setToastMessage({
          type: 'danger',
          text: err.response?.data?.error?.message || err.message || 'Failed to create category.',
        });
      }
    },
    [createCategory]
  );

  // Update action
  const handleUpdate = useCallback(
    async (id, payload) => {
      try {
        await updateCategory(id, payload);
        setEditingCategory(null);
        setToastMessage({
          type: 'success',
          text: `Category "${payload.name}" successfully updated.`,
        });
      } catch (err) {
        setToastMessage({
          type: 'danger',
          text: err.response?.data?.error?.message || err.message || 'Failed to update category.',
        });
      }
    },
    [updateCategory]
  );

  // Merge action
  const handleMerge = useCallback(
    async (sourceId, targetId) => {
      try {
        const res = await mergeCategories(sourceId, targetId);
        setMergingCategory(null);
        setToastMessage({
          type: 'success',
          text: `Successfully migrated ${res?.reassignedAuctionsCount ?? 0} lots and deleted source taxonomy.`,
        });
      } catch (err) {
        setToastMessage({
          type: 'danger',
          text: err.response?.data?.error?.message || err.message || 'Failed to merge categories.',
        });
      }
    },
    [mergeCategories]
  );

  // Delete action
  const handleDelete = useCallback(
    async (id) => {
      try {
        await deleteCategory(id);
        setDeletingCategory(null);
        setToastMessage({
          type: 'success',
          text: 'Empty category deleted successfully.',
        });
      } catch (err) {
        setToastMessage({
          type: 'danger',
          text: err.response?.data?.error?.message || err.message || 'Failed to delete category.',
        });
      }
    },
    [deleteCategory]
  );

  return (
    <div className="admin-categories-page">
      {/* Header */}
      <header className="admin-categories-header">
        <div>
          <div className="admin-categories-badge">TAXONOMY ARCHITECTURE</div>
          <h1 className="admin-page-title">Category Management & Taxonomy</h1>
          <p className="admin-page-subtitle">
            Configure marketplace categories, inspect item distribution, and execute taxonomy consolidations
          </p>
        </div>

        <div className="admin-categories-header-actions">
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => setIsCreateOpen(true)}
            disabled={isMutating}
          >
            <Plus size={14} />
            <span>New Category</span>
          </button>
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={refetch}
            disabled={isLoading || isMutating}
            title="Refresh categories"
          >
            <RotateCw size={13} className={isLoading ? 'admin-spinner' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* Notifications / Toast */}
      {toastMessage && (
        <div className={`admin-toast-banner admin-toast-banner--${toastMessage.type}`} role="status">
          {toastMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toastMessage.text}</span>
          <button
            type="button"
            className="admin-toast-dismiss"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Overview Stat Strip */}
      <section className="admin-categories-stats">
        <div className="admin-category-stat-card">
          <span className="admin-category-stat-label">Defined Taxonomies</span>
          <span className="admin-category-stat-value font-mono">{categories.length}</span>
          <span className="admin-category-stat-hint">Active marketplace categories</span>
        </div>

        <div className="admin-category-stat-card">
          <span className="admin-category-stat-label">Assigned Lots</span>
          <span className="admin-category-stat-value font-mono">{totalAuctionsCount}</span>
          <span className="admin-category-stat-hint">Total auctions linked across groups</span>
        </div>

        <div className="admin-category-stat-card">
          <span className="admin-category-stat-label">Filtered Match</span>
          <span className="admin-category-stat-value font-mono">{filteredCategories.length}</span>
          <span className="admin-category-stat-hint">Matches currently visible</span>
        </div>
      </section>

      {/* Search / Filter Bar */}
      <section className="admin-filter-bar">
        <div className="admin-search-wrap">
          <Search size={14} className="admin-search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search categories by name or slug..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </section>

      {/* Categories Table */}
      <section className="admin-table-container">
        {isLoading && categories.length === 0 ? (
          <div className="admin-state-box">
            <RotateCw size={24} className="admin-spinner" style={{ margin: '0 auto 8px' }} />
            <p>Loading taxonomy specifications...</p>
          </div>
        ) : error ? (
          <div className="admin-state-box">
            <AlertTriangle size={24} className="text-danger" style={{ margin: '0 auto 8px' }} />
            <p className="text-danger">Failed to load categories: {error}</p>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={refetch}
              style={{ marginTop: '8px' }}
            >
              Retry Sync
            </button>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="admin-state-box">
            <Layers size={24} style={{ margin: '0 auto 8px', color: 'var(--color-text-disabled)' }} />
            <p>No taxonomy categories found matching &ldquo;{searchInput}&rdquo;.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Category Name & Slug</th>
                <th>Description</th>
                <th>Linked Marketplace Lots</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Operations</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((cat) => {
                const hasLots = (cat.auctionCount || 0) > 0;

                return (
                  <tr key={cat.id}>
                    <td>
                      <div className="admin-category-cell">
                        <span className="admin-category-name">{cat.name}</span>
                        <span className="admin-category-slug font-mono">/{cat.slug}</span>
                      </div>
                    </td>

                    <td>
                      <div className="admin-category-desc-cell">
                        {cat.description || (
                          <span style={{ color: 'var(--color-text-disabled)', fontStyle: 'italic' }}>
                            No description specified
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <Link
                        to={`/admin/auctions?categoryId=${cat.id}`}
                        className="admin-auction-count-link"
                        title="View auctions in this category"
                      >
                        <span>{cat.auctionCount || 0} lots</span>
                        <ExternalLink size={11} />
                      </Link>
                    </td>

                    <td className="font-mono text-secondary" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(cat.createdAt)}
                    </td>

                    <td>
                      <div className="admin-table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn--xs btn--secondary admin-btn-action"
                          onClick={() => setEditingCategory(cat)}
                          disabled={isMutating}
                          title="Edit category name, slug, or description"
                        >
                          <Edit3 size={11} />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn--xs btn--secondary admin-btn-action"
                          onClick={() => setMergingCategory(cat)}
                          disabled={isMutating || categories.length <= 1}
                          title="Reassign lots to another category and delete this one"
                        >
                          <GitMerge size={11} />
                          <span>Merge</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn--xs btn--danger admin-btn-action"
                          onClick={() => setDeletingCategory(cat)}
                          disabled={isMutating || hasLots}
                          title={
                            hasLots
                              ? 'Cannot delete category with active lots. Use Merge first.'
                              : 'Delete empty category'
                          }
                        >
                          <Trash2 size={11} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Modals */}
      <AdminCreateCategoryModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onConfirm={handleCreate}
        isLoading={isMutating}
      />

      <AdminEditCategoryModal
        isOpen={Boolean(editingCategory)}
        onClose={() => setEditingCategory(null)}
        onConfirm={handleUpdate}
        category={editingCategory}
        isLoading={isMutating}
      />

      <AdminMergeCategoryModal
        isOpen={Boolean(mergingCategory)}
        onClose={() => setMergingCategory(null)}
        onConfirm={handleMerge}
        sourceCategory={mergingCategory}
        allCategories={categories}
        isLoading={isMutating}
      />

      <AdminDeleteCategoryModal
        isOpen={Boolean(deletingCategory)}
        onClose={() => setDeletingCategory(null)}
        onConfirm={handleDelete}
        category={deletingCategory}
        isLoading={isMutating}
      />
    </div>
  );
}
