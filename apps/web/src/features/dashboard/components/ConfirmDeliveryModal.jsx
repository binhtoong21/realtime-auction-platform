import { useState } from 'react';
import PropTypes from 'prop-types';
import { useConfirmDelivery } from '../hooks/useBuyerActions';
import { useToast } from '../../../core/context/ToastContext';
import './ConfirmDeliveryModal.css';

export function ConfirmDeliveryModal({ auctionId, onClose, onSuccess }) {
  const { confirm, isLoading } = useConfirmDelivery();
  const { showSuccess, showError } = useToast();

  const handleConfirm = async () => {
    try {
      await confirm(auctionId);
      showSuccess('Delivery confirmed successfully.');
      onSuccess();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Error occurred while confirming delivery');
    }
  };

  return (
    <div className="confirm-modal-overlay" onClick={isLoading ? undefined : onClose}>
      <div className="confirm-modal-content" onClick={e => e.stopPropagation()}>
        <div className="confirm-modal-header">
          <h2>Confirm Delivery</h2>
          <button className="close-btn" type="button" onClick={onClose} disabled={isLoading}>&times;</button>
        </div>
        
        <div className="modal-subtitle">
          Are you sure you have received the item?
        </div>

        <div className="warning-banner">
          This action will release the funds to the seller. This action cannot be undone.
        </div>

        <div className="confirm-modal-footer">
          <button type="button" className="btn btn--md btn--secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button type="button" className="btn btn--md btn--primary" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Confirming...' : 'Confirm Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}

ConfirmDeliveryModal.propTypes = {
  auctionId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
};
