import { useState, useEffect } from 'react';
import './CountdownTimer.css';

/**
 * Renders a countdown timer until the given endAt date.
 * Formats time as HH:MM:SS or DD days HH:MM:SS.
 * Adds warning styles if less than 2 minutes remain.
 */
export function CountdownTimer({ endAt, timeOffset = 0 }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isEnded, setIsEnded] = useState(false);

  useEffect(() => {
    if (!endAt) return;

    const calculateTimeLeft = () => {
      const now = Date.now() + timeOffset;
      const end = new Date(endAt).getTime();
      
      if (Number.isNaN(end)) {
        setIsEnded(true);
        return 0;
      }

      const diff = Math.max(0, end - now);
      
      if (diff === 0) {
        setIsEnded(true);
      } else {
        setIsEnded(false);
      }
      return diff;
    };

    setTimeLeft(calculateTimeLeft());

    const intervalId = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(intervalId);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [endAt]);

  if (isEnded) {
    return <span className="countdown-ended" style={{ color: 'var(--color-text-disabled)' }}>Ended</span>;
  }

  const isCritical = timeLeft > 0 && timeLeft <= 2 * 60 * 1000;
  
  // Format HH:MM:SS
  const seconds = Math.floor((timeLeft / 1000) % 60);
  const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
  const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));

  const formatUnit = (unit) => unit.toString().padStart(2, '0');

  let timeString = '';
  if (days > 0) {
    timeString = `${days}d ${formatUnit(hours)}h ${formatUnit(minutes)}m`;
  } else {
    timeString = `${formatUnit(hours)}:${formatUnit(minutes)}:${formatUnit(seconds)}`;
  }

  return (
    <span className={`countdown-timer ${isCritical ? 'countdown-critical' : ''}`}>
      {timeString}
    </span>
  );
}
