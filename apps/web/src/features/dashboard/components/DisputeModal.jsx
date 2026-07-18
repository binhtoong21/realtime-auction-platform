import { useState } from 'react';
import PropTypes from 'prop-types';
import { useOpenDispute } from '../hooks/useBuyerActions';
import { useToast } from '../../../core/context/ToastContext';
import './DisputeModal.css';

const REASONS = [
  { value: 'ITEM_NOT_AS_DESCRIBED', label: 'Sản phẩm không đúng mô tả' },
  { value: 'ITEM_DAMAGED', label: 'Sản phẩm bị hư hỏng' },
  { value: 'ITEM_NOT_RECEIVED', label: 'Không nhận được hàng' },
  { value: 'COUNTERFEIT_ITEM', label: 'Hàng giả / Hàng nhái' },
  { value: 'OTHER', label: 'Lý do khác' }
];

export function DisputeModal({ payment, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState(''); // Simple text input bypass for now

  const { open, isLoading, error } = useOpenDispute();
  const { showSuccess, showError } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || !description) return;

    try {
      await open({
        paymentId: payment.id,
        reason,
        description,
        evidenceUrls: evidenceUrl ? [evidenceUrl] : [] // Backend gap: Accepts []
      });
      showSuccess('Đã gửi khiếu nại thành công. Quản trị viên sẽ xem xét.');
      onSuccess();
    } catch (err) {
      // Handle 403 Cooldown Message
      if (err.response?.status === 403 && err.response?.data?.error?.code === 'DISPUTE_COOLDOWN') {
        const canOpenAt = err.response.data.error.canOpenAt;
        const formattedDate = new Date(canOpenAt).toLocaleString('vi-VN');
        showError(`Bạn chưa thể mở khiếu nại lúc này. Vui lòng thử lại sau: ${formattedDate}`);
      } else if (err.response?.status === 429) {
        showError(err.response?.data?.error?.message || 'Bạn thao tác quá nhanh, vui lòng thử lại sau.');
      } else {
        showError(err.response?.data?.error?.message || 'Có lỗi xảy ra khi gửi khiếu nại');
      }
    }
  };

  return (
    <div className="dispute-modal-overlay" onClick={isLoading ? undefined : onClose}>
      <div className="dispute-modal-content" onClick={e => e.stopPropagation()}>
        <div className="dispute-modal-header">
          <h2>Mở khiếu nại</h2>
          <button className="close-btn" onClick={onClose} disabled={isLoading}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="form-error">
              {error.response?.data?.error?.message || 'Có lỗi xảy ra'}
            </div>
          )}

          <div className="dispute-warning">
            Lưu ý: Khoản thanh toán của bạn sẽ bị đóng băng cho đến khi quản trị viên giải quyết xong khiếu nại này.
          </div>

          <div className="form-group">
            <label htmlFor="reason">Lý do khiếu nại</label>
            <select
              id="reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              disabled={isLoading}
            >
              <option value="">Chọn lý do</option>
              {REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="description">Mô tả chi tiết</label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Cung cấp thông tin chi tiết về vấn đề bạn gặp phải..."
              required
              rows={4}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="evidence">Link bằng chứng (Không bắt buộc)</label>
            <input
              type="url"
              id="evidence"
              value={evidenceUrl}
              onChange={e => setEvidenceUrl(e.target.value)}
              placeholder="https://..."
              disabled={isLoading}
            />
            <span className="help-text">Tính năng tải ảnh trực tiếp đang được bảo trì. Bạn có thể dán link ảnh/video từ Google Drive.</span>
          </div>

          <div className="dispute-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
              Hủy
            </button>
            <button type="submit" className="btn-primary danger" disabled={isLoading || !reason || !description}>
              {isLoading ? 'Đang gửi...' : 'Gửi khiếu nại'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

DisputeModal.propTypes = {
  payment: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
};
