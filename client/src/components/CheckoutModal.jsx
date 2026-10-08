import { useEffect, useState } from "react";
import Icon from "../Icon.jsx";
import Modal from "./Modal.jsx";
import { Spinner } from "./Spinner.jsx";

// Flat delivery fee charged per batch when the buyer chooses home delivery
// (must match the server: server/src/routes/orders.routes.js → FLAT_DELIVERY_FEE).
const DELIVERY_FEE = 180;

const formatEtb = (value) => `ETB ${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * Shared checkout step used by both "Buy now" (single product) and the cart.
 * Collects delivery method + address + notes, shows the price breakdown
 * (subtotal / delivery / total) and submits the order.
 *
 * Props:
 *   open          - controls visibility
 *   onClose       - close handler
 *   subtotal      - products subtotal
 *   itemCount     - number of orders the fee will be split across (cart size)
 *   confirmLabel  - primary button text ("Buy now" / "Place order")
 *   busy          - submission in progress
 *   error         - optional error message shown on top
 *   onSubmit({ deliveryMethod, deliveryAddress, deliveryNotes })
 */
export default function CheckoutModal({ open, onClose, subtotal = 0, itemCount = 1, confirmLabel = "Place order", busy = false, error = "", onSubmit }) {
  const [method, setMethod] = useState("delivery");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState("");

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (open) {
      setMethod("delivery");
      setAddress("");
      setNotes("");
      setLocalError("");
    }
  }, [open]);

  if (!open) return null;

  const fee = method === "delivery" ? DELIVERY_FEE : 0;
  const total = Number(subtotal || 0) + fee;

  const submit = () => {
    if (method === "delivery" && !address.trim()) {
      setLocalError("Please enter your delivery address.");
      return;
    }
    onSubmit({
      deliveryMethod: method,
      deliveryAddress: address.trim(),
      deliveryNotes: notes.trim(),
    });
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={480}>
      <div className="pay-sheet">
        <div className="pay-sheet-head">
          <h3>Checkout</h3>
          <p>
            Choose how you want to receive your {itemCount > 1 ? `${itemCount} products` : "product"} — the farmer
            ships after you pay.
          </p>
        </div>

        {error && (
          <div className="error-banner">
            <Icon name="alert-circle-outline" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="checkout-methods">
          <button
            type="button"
            className={`pay-method-item${method === "delivery" ? " pay-method-active" : ""}`}
            onClick={() => setMethod("delivery")}
          >
            <span className={`pay-radio${method === "delivery" ? " pay-radio-active" : ""}`}>
              {method === "delivery" && <span className="pay-radio-dot" />}
            </span>
            <Icon name="navigate-outline" size={20} color={method === "delivery" ? "#1E7A35" : "#7A8E81"} />
            <span className="pay-method-copy">
              <span className="pay-method-title">Home delivery</span>
              <span className="pay-method-hint">Flat fee · {formatEtb(DELIVERY_FEE)}</span>
            </span>
          </button>

          <button
            type="button"
            className={`pay-method-item${method === "pickup" ? " pay-method-active" : ""}`}
            onClick={() => setMethod("pickup")}
          >
            <span className={`pay-radio${method === "pickup" ? " pay-radio-active" : ""}`}>
              {method === "pickup" && <span className="pay-radio-dot" />}
            </span>
            <Icon name="storefront-outline" size={20} color={method === "pickup" ? "#1E7A35" : "#7A8E81"} />
            <span className="pay-method-copy">
              <span className="pay-method-title">Farm pickup</span>
              <span className="pay-method-hint">Free — collect it at the farm</span>
            </span>
          </button>
        </div>

        <label className="checkout-label">Delivery address {method === "delivery" && <span className="muted">(required)</span>}</label>
        <textarea
          className="textarea"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={method === "delivery" ? "e.g. Bole, Addis Ababa — Wollo Sefer, near the roundabout" : "Delivery address (used if you switch to delivery later)"}
        />

        <label className="checkout-label">Delivery notes <span className="muted">(optional)</span></label>
        <textarea
          className="textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Call when you arrive, leave with the guard…"
        />

        <div className="checkout-summary">
          <div className="cart-summary-row">
            <span>Subtotal</span>
            <span>{formatEtb(subtotal)}</span>
          </div>
          <div className="cart-summary-row">
            <span>Delivery {method === "pickup" && <span className="muted">(farm pickup)</span>}</span>
            <span>{fee ? formatEtb(fee) : "Free"}</span>
          </div>
          <div className="cart-summary-total">
            <span>Total</span>
            <span className="cart-total-value">{formatEtb(total)}</span>
          </div>
        </div>

        {localError && (
          <div className="error-banner" style={{ marginTop: 12 }}>
            <Icon name="alert-circle-outline" size={16} />
            <span>{localError}</span>
          </div>
        )}

        <div className="pay-sheet-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner light size={16} /> : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
