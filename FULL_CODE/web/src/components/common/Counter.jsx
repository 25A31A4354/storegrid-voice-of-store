import React, { useEffect, useState } from 'react';

const COUNT_UP_MS = 1100;

/** Counts up to `value` on mount and on change; shows the final value at once if motion is reduced. */
function useCountUp(value) {
  const [shown, setShown] = useState(0);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reduced) return undefined;
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return reduced ? value : shown;
}

function Counter({ value, className = '' }) {
  const shown = useCountUp(value);
  return <span className={`tabular-nums ${className}`}>{shown.toLocaleString()}</span>;
}

export default Counter;
