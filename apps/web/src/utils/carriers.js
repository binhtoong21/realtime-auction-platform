import { CARRIERS, CARRIER_TRACKING_REGEX, CARRIER_TRACKING_URLS } from '@auction/shared-constants';

export const CARRIER_LABELS = {
  [CARRIERS.VNPOST]: 'VNPost',
  [CARRIERS.GHN]: 'GHN (Giao Hàng Nhanh)',
  [CARRIERS.GHTK]: 'GHTK (Giao Hàng Tiết Kiệm)',
  [CARRIERS.JT]: 'J&T Express',
  [CARRIERS.FEDEX]: 'FedEx',
  [CARRIERS.DHL]: 'DHL',
  [CARRIERS.UPS]: 'UPS',
  [CARRIERS.OTHER]: 'Other',
};

export const TRACKING_HINTS = {
  [CARRIERS.VNPOST]: '2 letters + 9 digits + 2 letters (e.g., EA123456789VN)',
  [CARRIERS.GHN]: '8-15 alphanumeric characters',
  [CARRIERS.GHTK]: '9 digits or alphanumeric dot-separated (e.g. S12345.MB1.01)',
  [CARRIERS.JT]: '12-15 digits',
  [CARRIERS.FEDEX]: '12-14 digits',
  [CARRIERS.DHL]: '10-11 digits',
  [CARRIERS.UPS]: 'Starts with 1Z followed by 16 alphanumeric characters',
  [CARRIERS.OTHER]: '6-50 characters',
};

export function getCarrierTrackingUrl(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return null;
  const baseUrl = CARRIER_TRACKING_URLS[carrier];
  return baseUrl ? `${baseUrl}${encodeURIComponent(trackingNumber.trim())}` : null;
}

export function validateTrackingNumber(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return false;
  const regex = CARRIER_TRACKING_REGEX[carrier];
  return regex ? regex.test(trackingNumber.trim()) : true;
}
