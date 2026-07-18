import { useState, useRef, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../core/context/AuthContext';
import { useToast } from '../../../core/context/ToastContext';
import { useCategories } from '../../auctions/hooks/useCategories';
import { useSellerActions } from '../hooks/useSellerActions';
import { parseLocalToUTC } from '../../../utils/formatters';
import './CreateAuctionPage.css';

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function CreateAuctionPage() {
  const user = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const { categories, isLoading: isLoadingCategories, error: categoriesError, refetch } = useCategories();
  const { useCreateAuction } = useSellerActions();
  const { createAuction, isLoading: isSubmitting } = useCreateAuction();

  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const previewUrlsRef = useRef([]);

  useEffect(() => {
    const urlsToRevoke = previewUrlsRef.current;
    return () => {
      // Cleanup all tracked preview URLs to prevent memory leaks
      urlsToRevoke.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  
  const [startingPrice, setStartingPrice] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [bidIncrement, setBidIncrement] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  const [images, setImages] = useState([]); // [{ file, preview }]

  // KYC Guard
  if (user?.identityStatus !== 'verified') {
    return <Navigate to="/dashboard/settings/kyc" replace />;
  }

  const validateStep = (step) => {
    const newErrors = {};
    if (step === 0) {
      if (!title.trim()) newErrors.title = 'Title is required';
      if (title.length > 200) newErrors.title = 'Title must be less than 200 characters';
      if (!description.trim()) newErrors.description = 'Description is required';
      if (description.length > 2000) newErrors.description = 'Description must be less than 2000 characters';
      if (!categoryId) newErrors.categoryId = 'Category is required';
    } else if (step === 1) {
      if (!startingPrice || Number.isNaN(Number(startingPrice)) || Number(startingPrice) <= 0) newErrors.startingPrice = 'Starting price must be a valid number > 0';
      if (reservePrice !== '' && (Number.isNaN(Number(reservePrice)) || Number(reservePrice) < Number(startingPrice))) newErrors.reservePrice = 'Reserve price must be >= starting price';
      if (!bidIncrement || Number.isNaN(Number(bidIncrement)) || Number(bidIncrement) <= 0) newErrors.bidIncrement = 'Bid increment must be a valid number > 0';
      
      if (!startAt) newErrors.startAt = 'Start time is required';
      if (!endAt) newErrors.endAt = 'End time is required';
      
      if (startAt && endAt) {
        const start = new Date(startAt).getTime();
        const end = new Date(endAt).getTime();
        if (end < start + 3600000) {
          newErrors.endAt = 'End time must be at least 1 hour after start time';
        }
      }
    } else if (step === 2) {
      if (images.length === 0) {
        newErrors.images = 'At least 1 image is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleFileSelect = (files) => {
    const validFiles = [];
    const newErrors = { ...errors };
    delete newErrors.images;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (images.length + validFiles.length >= MAX_IMAGES) {
        newErrors.images = `Maximum ${MAX_IMAGES} images allowed`;
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        newErrors.images = `${file.name} exceeds 5MB limit`;
        continue;
      }
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        newErrors.images = `${file.name} is not a valid JPEG or PNG`;
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      validFiles.push({
        file,
        preview: previewUrl
      });
      previewUrlsRef.current.push(previewUrl);
    }

    setErrors(newErrors);
    if (validFiles.length > 0) {
      setImages(prev => [...prev, ...validFiles]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (images.length >= MAX_IMAGES) return;
    handleFileSelect(e.dataTransfer.files);
  };

  const removeImage = (index) => {
    setImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleSubmit = async () => {
    if (!validateStep(2)) return;

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('categoryId', categoryId);
    formData.append('startingPrice', startingPrice);
    if (reservePrice) formData.append('reservePrice', reservePrice);
    formData.append('bidIncrement', bidIncrement);
    
    // Convert to UTC safely
    formData.append('startAt', parseLocalToUTC(startAt));
    formData.append('endAt', parseLocalToUTC(endAt));

    images.forEach(img => {
      formData.append('images', img.file);
    });

    try {
      await createAuction(formData);
      showSuccess('Auction created successfully!');
      navigate('/dashboard/auctions');
    } catch (err) {
      // Handle 422 Validation Error Routing
      if (err.response?.status === 422 && Array.isArray(err.response?.data?.error?.details)) {
        const details = err.response.data.error.details;
        const fieldToStep = {
          title: 0, description: 0, categoryId: 0,
          startingPrice: 1, reservePrice: 1, bidIncrement: 1, startAt: 1, endAt: 1,
          images: 2
        };

        const newErrors = {};
        let targetStep = Infinity;

        details.forEach(d => {
          const field = d.field;
          newErrors[field] = d.message;
          if (fieldToStep[field] !== undefined) {
            const fieldStep = fieldToStep[field];
            targetStep = Math.min(targetStep, fieldStep);
          } else {
            showError(`Server error on ${field}: ${d.message}`); // Fallback
          }
        });

        setErrors(newErrors);
        if (targetStep !== Infinity && targetStep !== currentStep) {
          setCurrentStep(targetStep);
        }
      } else {
        showError(err.response?.data?.error?.message || 'Failed to create auction');
      }
    }
  };

  return (
    <div className="create-auction-page">
      <header>
        <h1>Create Auction</h1>
        <p>List a new item for auction.</p>
      </header>

      <div className="step-indicators">
        {['Basic Info', 'Pricing & Schedule', 'Images'].map((label, idx) => (
          <div key={idx} className={`step-item ${currentStep === idx ? 'active' : ''} ${currentStep > idx ? 'completed' : ''}`}>
            <div className="step-circle">{idx + 1}</div>
            <span className="step-label">{label}</span>
          </div>
        ))}
      </div>

      {currentStep === 0 && (
        <div className="form-step">
          <div className="form-group">
            <label>Title</label>
            <input 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="e.g. Rolex Submariner"
              maxLength={200}
            />
            {errors.title && <span className="field-error">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label>Category</label>
            {isLoadingCategories ? (
              <div className="category-status loading">Loading categories...</div>
            ) : categoriesError ? (
              <div className="category-status error">
                Failed to load categories. <button type="button" onClick={refetch} className="btn-link">Retry</button>
              </div>
            ) : (!categories || categories.length === 0) ? (
              <div className="category-status empty">
                No categories available. <button type="button" onClick={refetch} className="btn-link">Refresh</button>
              </div>
            ) : (
              <select 
                value={categoryId} 
                onChange={e => setCategoryId(e.target.value)}
              >
                <option value="">Select a category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
            {errors.categoryId && <span className="field-error">{errors.categoryId}</span>}
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the item condition, history, etc."
              maxLength={2000}
            />
            {errors.description && <span className="field-error">{errors.description}</span>}
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="form-step">
          <div className="form-group">
            <label>Starting Price</label>
            <div className="input-with-suffix">
              <input 
                type="number" 
                value={startingPrice} 
                onChange={e => setStartingPrice(e.target.value)} 
                min="1"
              />
              <span className="suffix-text">VND</span>
            </div>
            {errors.startingPrice && <span className="field-error">{errors.startingPrice}</span>}
          </div>

          <div className="form-group">
            <label>Reserve Price (Optional)</label>
            <div className="input-with-suffix">
              <input 
                type="number" 
                value={reservePrice} 
                onChange={e => setReservePrice(e.target.value)} 
                min={startingPrice || '1'}
              />
              <span className="suffix-text">VND</span>
            </div>
            {errors.reservePrice && <span className="field-error">{errors.reservePrice}</span>}
          </div>

          <div className="form-group">
            <label>Bid Increment</label>
            <div className="input-with-suffix">
              <input 
                type="number" 
                value={bidIncrement} 
                onChange={e => setBidIncrement(e.target.value)} 
                min="1"
              />
              <span className="suffix-text">VND</span>
            </div>
            {errors.bidIncrement && <span className="field-error">{errors.bidIncrement}</span>}
          </div>

          <div className="form-group">
            <label>Start Time (Local Time)</label>
            <input 
              type="datetime-local" 
              value={startAt} 
              onChange={e => setStartAt(e.target.value)} 
            />
            {errors.startAt && <span className="field-error">{errors.startAt}</span>}
          </div>

          <div className="form-group">
            <label>End Time (Local Time)</label>
            <input 
              type="datetime-local" 
              value={endAt} 
              onChange={e => setEndAt(e.target.value)} 
            />
            {errors.endAt && <span className="field-error">{errors.endAt}</span>}
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="form-step">
          <div className="form-group">
            <label>Images</label>
            <div 
              className={`dropzone ${images.length >= MAX_IMAGES ? 'disabled' : ''}`}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => images.length < MAX_IMAGES && fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }}
                accept="image/jpeg, image/png"
                multiple
                onChange={e => handleFileSelect(e.target.files)}
              />
              <p>Drag and drop images here, or click to select files</p>
              <span>{images.length}/{MAX_IMAGES} images uploaded. JPG, PNG up to 5MB.</span>
            </div>
            {errors.images && <span className="field-error">{errors.images}</span>}

            {images.length > 0 && (
              <div className="image-previews">
                {images.map((img, idx) => (
                  <div key={idx} className="image-preview-item">
                    <img src={img.preview} alt={`Preview ${idx + 1}`} />
                    <button type="button" className="delete-img-btn" onClick={() => removeImage(idx)}>
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="form-actions">
        {currentStep > 0 && (
          <button className="btn-secondary" onClick={handlePrev} disabled={isSubmitting}>Back</button>
        )}
        {currentStep < 2 ? (
          <button className="btn-primary" onClick={handleNext}>Next</button>
        ) : (
          <button className="btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating auction...' : 'Create Auction'}
          </button>
        )}
      </div>
    </div>
  );
}
