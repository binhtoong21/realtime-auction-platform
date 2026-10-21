import { useState, useRef, useCallback, useEffect } from 'react';
import {
  User,
  Camera,
  CheckCircle,
  AlertCircle,
  KeyRound,
  ShieldCheck,
  Loader2,
  X,
  Upload,
} from 'lucide-react';
import { useAuth, useAuthDispatch } from '../../../core/context/AuthContext';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { useToast } from '../../../core/context/ToastContext';
import { axiosClient } from '../../../core/api/axiosClient';
import './ProfileSettingsPage.css';

const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProfileSettingsPage() {
  const user = useAuth();
  const { login } = useAuthDispatch();
  const { showSuccess, showError } = useToast();
  const { updateProfile, isLoading: isUpdatingProfile } = useUpdateProfile();

  // Profile Form States
  const [customDisplayName, setCustomDisplayName] = useState(null);
  const displayName = customDisplayName !== null ? customDisplayName : user?.displayName || '';
  const [avatarFile, setAvatarFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState(null);

  // Password Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState(null);

  const fileInputRef = useRef(null);

  // Clean up object URL when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Extract initials for placeholder avatar
  const getInitials = useCallback(() => {
    if (!user) return 'U';
    const name = displayName || user.displayName || user.email || 'U';
    if (name.includes('@')) return name.substring(0, 2).toUpperCase();
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }, [user, displayName]);

  // Handle avatar file selection with validation
  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        showError('Avatar must be an image (JPEG, PNG, WebP)');
        e.target.value = '';
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        showError('Avatar image size should not exceed 5MB');
        e.target.value = '';
        return;
      }

      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }

      setAvatarFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    },
    [previewUrl, showError]
  );

  const handleRemoveAvatarFile = useCallback(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setAvatarFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [previewUrl]);

  // Submit profile details update
  const handleProfileSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setProfileSuccessMsg(null);

      const trimmedName = displayName.trim();
      if (!trimmedName || trimmedName.length < 2) {
        showError('Display name must be at least 2 characters');
        return;
      }
      if (trimmedName.length > 50) {
        showError('Display name cannot exceed 50 characters');
        return;
      }

      try {
        const updatedUser = await updateProfile({
          displayName: trimmedName,
          avatarFile,
        });

        if (updatedUser) {
          login({ ...user, ...updatedUser });
        }

        showSuccess('Profile updated successfully!');
        setProfileSuccessMsg('Profile updated successfully');
        setCustomDisplayName(null);
        setAvatarFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        setTimeout(() => setProfileSuccessMsg(null), 4000);
      } catch (err) {
        const msg =
          err.response?.data?.error?.message ||
          err.message ||
          'Failed to update profile';
        showError(msg);
      }
    },
    [displayName, avatarFile, updateProfile, login, user, showSuccess, showError]
  );

  // Submit password change
  const handlePasswordSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setPasswordError(null);
      setPasswordSuccessMsg(null);

      if (!currentPassword) {
        setPasswordError('Current password is required');
        return;
      }

      if (!PASSWORD_PATTERN.test(newPassword)) {
        setPasswordError(
          'New password must be at least 8 characters with 1 uppercase letter and 1 number'
        );
        return;
      }

      if (newPassword !== confirmPassword) {
        setPasswordError('New passwords do not match');
        return;
      }

      setIsChangingPassword(true);
      try {
        await axiosClient.patch('/auth/change-password', {
          currentPassword,
          newPassword,
        });

        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        showSuccess('Password updated successfully');
        setPasswordSuccessMsg('Your security password has been changed');
        setTimeout(() => setPasswordSuccessMsg(null), 4000);
      } catch (err) {
        const msg =
          err.response?.data?.error?.message ||
          err.message ||
          'Failed to change password';
        setPasswordError(msg);
      } finally {
        setIsChangingPassword(false);
      }
    },
    [currentPassword, newPassword, confirmPassword, showSuccess]
  );

  const activeAvatarSrc = previewUrl || user?.avatarUrl;

  return (
    <div className="profile-settings">
      {/* Header bar */}
      <header className="profile-settings__header">
        <div>
          <h1 className="profile-settings__title">Profile Settings</h1>
          <p className="profile-settings__subtitle">
            Manage your account identity, public display name, avatar, and security credentials
          </p>
        </div>
      </header>

      <div className="profile-settings__grid">
        {/* Profile Card */}
        <section className="profile-card">
          <div className="profile-card__header">
            <User size={18} className="profile-card__header-icon" />
            <h2 className="profile-card__title">Personal Information</h2>
          </div>

          {profileSuccessMsg && (
            <div className="profile-settings__alert profile-settings__alert--success">
              <CheckCircle size={16} />
              <span>{profileSuccessMsg}</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="profile-form">
            {/* Avatar Section */}
            <div className="profile-form__avatar-row">
              <div className="profile-form__avatar-container">
                {activeAvatarSrc ? (
                  <img
                    src={activeAvatarSrc}
                    alt={displayName || 'User Avatar'}
                    className="profile-form__avatar-img"
                  />
                ) : (
                  <div className="profile-form__avatar-fallback">
                    {getInitials()}
                  </div>
                )}
                <button
                  type="button"
                  className="profile-form__avatar-upload-trigger"
                  onClick={() => fileInputRef.current?.click()}
                  title="Choose new avatar"
                  aria-label="Choose new avatar"
                >
                  <Camera size={14} />
                </button>
              </div>

              <div className="profile-form__avatar-meta">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,image/webp"
                  className="profile-form__file-input"
                />

                <div className="profile-form__avatar-actions">
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={14} />
                    <span>Upload Image</span>
                  </button>

                  {avatarFile && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost profile-form__remove-file"
                      onClick={handleRemoveAvatarFile}
                      title="Cancel selected file"
                    >
                      <X size={14} />
                      <span>{avatarFile.name}</span>
                    </button>
                  )}
                </div>

                <span className="profile-form__hint">
                  Supports JPEG, PNG, or WebP. Maximum size 5MB.
                </span>
              </div>
            </div>

            {/* Display Name Input */}
            <div className="profile-form__field">
              <label htmlFor="displayName" className="profile-form__label">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setCustomDisplayName(e.target.value)}
                maxLength={50}
                placeholder="e.g. Satoshi Trader"
                className="profile-form__input"
                required
              />
              <span className="profile-form__field-hint">
                Visible to buyers and sellers in auction rooms and dispute communications.
              </span>
            </div>

            {/* Email (Read-Only) */}
            <div className="profile-form__field">
              <label htmlFor="userEmail" className="profile-form__label">
                Email Address
              </label>
              <div className="profile-form__readonly-box">
                <input
                  id="userEmail"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="profile-form__input profile-form__input--disabled"
                />
                <span className="profile-form__badge profile-form__badge--verified">
                  <ShieldCheck size={12} />
                  <span>Verified</span>
                </span>
              </div>
            </div>

            {/* Account Details / Badges */}
            <div className="profile-form__field">
              <label className="profile-form__label">Account Role & KYC</label>
              <div className="profile-form__tags">
                <span className="profile-tag profile-tag--role">
                  {user?.role === 'admin' ? 'Administrator' : 'Standard Member'}
                </span>
                <span
                  className={`profile-tag profile-tag--${user?.identityStatus === 'verified' ? 'success' : 'muted'}`}
                >
                  KYC: {user?.identityStatus || 'pending'}
                </span>
              </div>
            </div>

            <div className="profile-form__footer">
              <button
                type="submit"
                className="btn btn--primary profile-form__save-btn"
                disabled={isUpdatingProfile}
              >
                {isUpdatingProfile ? (
                  <>
                    <Loader2 size={14} className="spin-icon" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Profile</span>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Change Password Card */}
        <section className="profile-card">
          <div className="profile-card__header">
            <KeyRound size={18} className="profile-card__header-icon" />
            <h2 className="profile-card__title">Security & Password</h2>
          </div>

          {passwordSuccessMsg && (
            <div className="profile-settings__alert profile-settings__alert--success">
              <CheckCircle size={16} />
              <span>{passwordSuccessMsg}</span>
            </div>
          )}

          {passwordError && (
            <div className="profile-settings__alert profile-settings__alert--danger">
              <AlertCircle size={16} />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="profile-form">
            <div className="profile-form__field">
              <label htmlFor="currentPassword" className="profile-form__label">
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="profile-form__input"
                autoComplete="current-password"
                required
              />
            </div>

            <div className="profile-form__field">
              <label htmlFor="newPassword" className="profile-form__label">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 chars, 1 uppercase, 1 number"
                className="profile-form__input"
                autoComplete="new-password"
                required
              />
              <span className="profile-form__field-hint">
                Must contain at least 8 characters, 1 uppercase letter, and 1 number.
              </span>
            </div>

            <div className="profile-form__field">
              <label htmlFor="confirmPassword" className="profile-form__label">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="profile-form__input"
                autoComplete="new-password"
                required
              />
            </div>

            <div className="profile-form__footer">
              <button
                type="submit"
                className="btn btn--secondary profile-form__save-btn"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? (
                  <>
                    <Loader2 size={14} className="spin-icon" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
