import { useState } from "react";
import Icon from "../Icon.jsx";

/**
 * Shared order progress UI used by the buyer and farmer order pages.
 * Renders the 5-step lifecycle tracker, a terminal banner for
 * rejected / cancelled orders, and an expandable timeline of events.
 */
export default function OrderTracker({ steps = [], terminal = false, terminalLabel = "", events = [] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="order-tracker-wrap">
      {terminal ? (
        <div className="order-terminal">
          <Icon name="alert-circle-outline" size={15} />
          <span>{terminalLabel || "This order is closed."}</span>
        </div>
      ) : (
        <div className="order-tracker">
          {steps.map((step, index) => (
            <div
              className={`order-tracker-step${step.done ? " done" : ""}${step.current ? " current" : ""}`}
              key={step.label}
            >
              <span className="order-tracker-dot">
                {step.done && !step.current ? <Icon name="checkmark" size={10} /> : index + 1}
              </span>
              <span className="order-tracker-label">{step.label}</span>
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="order-timeline">
          <button className="order-timeline-toggle" onClick={() => setOpen((v) => !v)} type="button">
            <Icon name={open ? "chevron-up-outline" : "chevron-down-outline"} size={14} />
            {open ? "Hide" : "View"} order timeline
          </button>
          {open && (
            <div className="order-timeline-list">
              {events.map((event) => (
                <div className="order-timeline-item" key={event.id}>
                  <span className="order-timeline-dot" />
                  <div className="order-timeline-body">
                    <div className="order-timeline-label">{event.label}</div>
                    {event.note && <div className="order-timeline-note">{event.note}</div>}
                    <div className="order-timeline-date">{event.createdLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
