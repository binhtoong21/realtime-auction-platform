import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../../core/context/AuthContext';
import { useToast } from '../../../core/context/ToastContext';
import { useCategories } from '../../auctions/hooks/useCategories';
import { useEditAuction } from '../hooks/useSellerActions';
import { useFetch } from '../../../core/hooks/useFetch';
import { parseLocalToUTC } from '../../../utils/formatters';
import { ArrowLeft, Upload, X } from 'lucide-react';
import './CreateAuctionPage.css';

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function EditAuctionPage() {
  const { id } = useParams();
  const user = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const { data: auctionData, isLoading: isLoadingAuction, error: auctionError } = useFetch(`/auctions/${id}`);
  const { categories, isLoading: isLoadingCategories } = useCategories();
  const { editAuction, isLoading: isSubmitting } = useEditAuction();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [bidIncrement, setBidIncrement] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]); // [{ file, preview }]
  const [errors, setErrors] = useState({});

  const fileInputRef = useRef(null);
  const previewUrlsRef = useRef([]);

  // Populate initial state from auctionData
  useEffect(() => {
    if (!auctionData?.data) return;
    const a = auctionData.data;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(a.title || '');
    setDescription(a.description || '');
    setCategoryId(a.category_id || a.category?.id || '');
    setStartingPrice(a.starting_price != null ? String(a.starting_price) : '');
    setReservePrice(a.reserve_price != null ? String(a.reserve_price) : '');
    setBidIncrement(a.bid_increment != null ? String(a.bid_increment) : '');
    
    if (a.start_at) {
      // Format to datetime-local input YYYY-MM-DDTHH:mm
      const startDate = new Date(a.start_at);
      const localStart = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setStartAt(localStart);
    }
    if (a.end_at) {
      const endDate = new Date(a.end_at);
      const localEnd = new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setEndAt(localEnd);
    }

    if (Array.isArray(a.images)) {
      setExistingImages(a.images);
    }
  }, [auctionData]);

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const auction = auctionData?.data;
  const isOwner = !auction?.seller?.id || !user?.id || auction.seller.id === user.id;
  const hasBids = Number(auction?.bid_count) > 0;
  const isEditable = auction && (auction.status === 'scheduled' || auction.status === 'active') && !hasBids && isOwner;


  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const availableSlots = MAX_IMAGES - (existingImages.length + newImages.length);
    if (availableSlots <= 0) {
      showError(`Maximum ${MAX_IMAGES} images allowed.`);
      return;
    }

    const filesToProcess = files.slice(0, availableSlots);
    const validNewImages = [];

    filesToProcess.forEach(file => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        showError(`Invalid file format: ${file.name}. Only JPEG, PNG, and WebP are allowed.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        showError(`File too large: ${file.name}. Maximum size is 5MB.`);
        return;
      }
      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.push(preview);
      validNewImages.push({ file, preview });
    });

    setNewImages(prev => [...prev, ...validNewImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeExistingImage = (indexToRemove) => {
    setExistingImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const removeNewImage = (indexToRemove) => {
    setNewImages(prev => {
      const imageToRemove = prev[indexToRemove];
      if (imageToRemove?.preview) {
        URL.revokeObjectURL(imageToRemove.preview);
        previewUrlsRef.current = previewUrlsRef.current.filter(url => url !== imageToRemove.preview);
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  };

  const validate = () => {
    const newErrors = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!description.trim()) newErrors.description = 'Description is required';
    if (!categoryId) newErrors.categoryId = 'Category is required';

    if (!startingPrice || Number(startingPrice) <= 0) newErrors.startingPrice = 'Starting price must be > 0';
    if (!bidIncrement || Number(bidIncrement) <= 0) newErrors.bidIncrement = 'Bid increment must be > 0';
    if (!startAt) newErrors.startAt = 'Start time is required';
    if (!endAt) newErrors.endAt = 'End time is required';

    if (existingImages.length + newImages.length === 0) {
      newErrors.images = 'At least 1 image is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      showError('Please correct the errors in the form.');
      return;
    }

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('categoryId', categoryId);
    formData.append('startingPrice', String(Number(startingPrice)));
    if (reservePrice) {
      formData.append('reservePrice', String(Number(reservePrice)));
    }
    formData.append('bidIncrement', String(Number(bidIncrement)));
    formData.append('startAt', parseLocalToUTC(startAt));
    formData.append('endAt', parseLocalToUTC(endAt));

    // Append existing images retained
    existingImages.forEach(imgUrl => {
      formData.append('existingImages', imgUrl);
    });

    // Append new image files
    newImages.forEach(img => {
      formData.append('images', img.file);
    });

    try {
      await editAuction(id, formData);
      showSuccess('Auction updated successfully!');
      navigate('/dashboard/auctions');
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to update auction');
    }
  };

  if (isLoadingAuction || isLoadingCategories) {
    return (
      <div className="create-auction-container">
        <p>Loading auction details...</p>
      </div>
    );
  }

  if (auctionError || !auction) {
    return (
      <div className="create-auction-container">
        <p>Auction not found or unavailable.</p>
        <Link to="/dashboard/auctions" className="btn btn--sm btn--secondary">
          Back to My Auctions
        </Link>
      </div>
    );
  }

  return (
    <div className="create-auction-container">
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/dashboard/auctions" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-brand)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}>
          <ArrowLeft size={16} /> Back to My Auctions
        </Link>
      </div>

      <div className="create-auction-header">
        <h1 className="create-auction-title">Edit Auction</h1>
        <p className="create-auction-subtitle">ID: {id}</p>
      </div>

      {!isEditable && (
        <div className="error-banner" style={{ marginBottom: 'var(--space-5)' }}>
          {hasBids
            ? 'This auction already has active bids and cannot be edited.'
            : 'Only scheduled or active auctions with 0 bids can be edited.'}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auction-form-step">
        <div className="form-group">
          <label className="form-label" htmlFor="auction-title">Title *</label>
          <input
            id="auction-title"
            type="text"
            className={`form-input ${errors.title ? 'form-input--error' : ''}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting || !isEditable}
          />
          {errors.title && <span className="field-error">{errors.title}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="auction-category">Category *</label>
          <select
            id="auction-category"
            className={`form-select ${errors.categoryId ? 'form-input--error' : ''}`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={isSubmitting || !isEditable}
          >
            <option value="">Select a category</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          {errors.categoryId && <span className="field-error">{errors.categoryId}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="auction-description">Description *</label>
          <textarea
            id="auction-description"
            className={`form-textarea ${errors.description ? 'form-input--error' : ''}`}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting || !isEditable}
          />
          {errors.description && <span className="field-error">{errors.description}</span>}
        </div>

        <div className="pricing-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="starting-price">Starting Price ($) *</label>
            <input
              id="starting-price"
              type="number"
              min="1"
              step="any"
              className={`form-input ${errors.startingPrice ? 'form-input--error' : ''}`}
              value={startingPrice}
              onChange={(e) => setStartingPrice(e.target.value)}
              disabled={isSubmitting || !isEditable}
            />
            {errors.startingPrice && <span className="field-error">{errors.startingPrice}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reserve-price">Reserve Price ($)</label>
            <input
              id="reserve-price"
              type="number"
              min="0"
              step="any"
              className="form-input"
              value={reservePrice}
              onChange={(e) => setReservePrice(e.target.value)}
              disabled={isSubmitting || !isEditable}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="bid-increment">Bid Increment ($) *</label>
            <input
              id="bid-increment"
              type="number"
              min="1"
              step="any"
              className={`form-input ${errors.bidIncrement ? 'form-input--error' : ''}`}
              value={bidIncrement}
              onChange={(e) => setBidIncrement(e.target.value)}
              disabled={isSubmitting || !isEditable}
            />
            {errors.bidIncrement && <span className="field-error">{errors.bidIncrement}</span>}
          </div>
        </div>

        <div className="schedule-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="start-at">Start Time *</label>
            <input
              id="start-at"
              type="datetime-local"
              className={`form-input ${errors.startAt ? 'form-input--error' : ''}`}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              disabled={isSubmitting || !isEditable}
            />
            {errors.startAt && <span className="field-error">{errors.startAt}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="end-at">End Time *</label>
            <input
              id="end-at"
              type="datetime-local"
              className={`form-input ${errors.endAt ? 'form-input--error' : ''}`}
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              disabled={isSubmitting || !isEditable}
            />
            {errors.endAt && <span className="field-error">{errors.endAt}</span>}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Images ({existingImages.length + newImages.length}/{MAX_IMAGES}) *</label>
          {isEditable && (
            <div
              className="dropzone-area"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={28} className="dropzone-icon" />
              <p className="dropzone-text">Click to upload new images</p>
              <p className="dropzone-hint">JPEG, PNG, WebP up to 5MB each</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleImageChange}
              />
            </div>
          )}

          <div className="preview-grid" style={{ marginTop: 'var(--space-3)' }}>
            {existingImages.map((url, idx) => (
              <div key={`existing-${idx}`} className="preview-item">
                <img src={url} alt={`Existing ${idx + 1}`} className="preview-thumb" />
                {isEditable && (
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={() => removeExistingImage(idx)}
                    title="Remove image"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {newImages.map((img, idx) => (
              <div key={`new-${idx}`} className="preview-item">
                <img src={img.preview} alt={`New upload ${idx + 1}`} className="preview-thumb" />
                {isEditable && (
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={() => removeNewImage(idx)}
                    title="Remove image"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {errors.images && <span className="field-error">{errors.images}</span>}
        </div>

        <div className="form-nav-buttons" style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Link to="/dashboard/auctions" className="btn btn--md btn--secondary">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn--md btn--primary"
            disabled={isSubmitting || !isEditable}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
