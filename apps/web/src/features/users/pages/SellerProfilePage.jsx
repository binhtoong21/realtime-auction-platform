import { useParams } from 'react-router-dom';
import { useSellerProfile } from '../hooks/useSellerProfile';

export function SellerProfilePage() {
  const { id } = useParams();
  const { user, stats, isLoading, error } = useSellerProfile(id);

  if (isLoading) {
    return <div className="seller-profile-loading">Loading seller profile...</div>;
  }

  if (error) {
    return <div className="seller-profile-error">Seller not found</div>;
  }

  return (
    <div className="seller-profile-page">
      <h1>{user?.displayName || 'Seller Profile'}</h1>
      <p>Reputation Score: {stats?.reputationScore ?? 0}%</p>
    </div>
  );
}
