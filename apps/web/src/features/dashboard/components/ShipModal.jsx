import { useState } from 'react';
import PropTypes from 'prop-types';
import { useShipAuction } from '../hooks/useSellerActions';
import { useToast } from '../../../core/context/ToastContext';
import { CARRIERS, CARRIER_TRACKING_REGEX } from '@auction/shared-constants';
import './ShipModal.css';

const CARRIER_LABELS = {
  [CARRIERS.VNPOST]: 'VNPost',
  [CARRIERS.GHN]: 'Giao Hàng Nhanh',
  [CARRIERS.GHTK]: 'Giao Hàng Tiết Kiệm',
  [CARRIERS.JT]: 'J&T Express',
  [CARRIERS.FEDEX]: 'FedEx',
  [CARRIERS.DHL]: 'DHL',
  [CARRIERS.UPS]: 'UPS',
  [CARRIERS.OTHER]: 'Khác'
};

export function ShipModal({ auctionId, onClose, onSuccess }) {
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const { ship, isLoading, error } = useShipAuction();
  const { showSuccess, showError } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!carrier || !trackingNumber) return;

    if (CARRIER_TRACKING_REGEX[carrier] && !CARRIER_TRACKING_REGEX[carrier].test(trackingNumber)) {
      showError('Mã vận đơn không đúng định dạng của đơn vị vận chuyển này');
      return;
    }

    try {
      await ship(auctionId, carrier, trackingNumber);
      showSuccess('Đã cập nhật thông tin giao hàng thành công');
      onSuccess();
    } catch (err) {
      showError(err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật vận đơn');
    }
  };

  return (
    <div className="ship-modal-overlay" onClick={onClose}>
      <div className="ship-modal-content" onClick={e => e.stopPropagation()}>
        <div className="ship-modal-header">
          <h2>Cập nhật vận đơn</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error.response?.data?.message || 'Có lỗi xảy ra'}</div>}

          <div className="form-group">
            <label htmlFor="carrier">Đơn vị vận chuyển</label>
            <select
              id="carrier"
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
              required
              disabled={isLoading}
            >
              <option value="">Chọn đơn vị vận chuyển</option>
              {Object.values(CARRIERS).map(c => (
                <option key={c} value={c}>{CARRIER_LABELS[c] || c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="trackingNumber">Mã vận đơn</label>
            <input
              type="text"
              id="trackingNumber"
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="Ví dụ: SPX123456789"
              required
              disabled={isLoading}
            />
          </div>

          <div className="ship-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
              Hủy
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || !carrier || !trackingNumber}>
              {isLoading ? 'Đang cập nhật...' : 'Xác nhận giao hàng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

ShipModal.propTypes = {
  auctionId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
};
