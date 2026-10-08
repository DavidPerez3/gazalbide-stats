import { createPortal } from 'react-dom';
export default function FloatingCoupon({ count, odds, feedbackId, onOpen }) {
  if (!count) return null;
  return createPortal(<div className="gazalbet-coupon-dock"><button key={feedbackId || 'idle'} type="button" className={`gazalbet-floating-slip${feedbackId ? ' gazalbet-slip-pulse' : ''}`} onClick={onOpen}>
    <span>Cupón · {count} {count === 1 ? 'selección' : 'selecciones'}</span><strong>{count > 1 ? `Cuota ${odds.toFixed(2)}` : 'Ver boleto'}</strong>
  </button></div>, document.body);
}
