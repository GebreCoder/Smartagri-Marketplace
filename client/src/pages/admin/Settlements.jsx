import { useCallback, useEffect, useState } from "react";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";

const STATUS_CHIP = {
  eligible: "admin-chip-eligible",
  processing: "admin-chip-processing",
  settled: "admin-chip-settled",
  failed: "admin-chip-failed",
};

export default function AdminSettlements() {
  const [settlements, setSettlements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { settlements: data, summary: totals } = await api.get("/api/settlements/admin");
      setSettlements(data || []);
      setSummary(totals || null);
    } catch {
      setSettlements([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const process = async (settlement) => {
    setBusyId(settlement.id);
    try {
      await api.post(`/api/settlements/admin/${settlement.id}/process`);
      await load();
    } catch (err) {
      alert(err.message || "Could not process this settlement.");
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = summary?.pendingCount || 0;
  const settledCount = summary?.settledCount || 0;

  return (
    <div>
      <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 900, color: "var(--green-950)" }}>Farmer Settlements</h2>

      <div className="admin-report-grid">
        <div className="admin-report-card">
          <div className="admin-report-value">{settlements.length}</div>
          <div className="admin-report-label">Total settlements</div>
        </div>
        <div className="admin-report-card">
          <div className="admin-report-value" style={{ color: "#D97706" }}>{pendingCount}</div>
          <div className="admin-report-label">Pending payout</div>
        </div>
        <div className="admin-report-card">
          <div className="admin-report-value" style={{ color: "#1E7A35" }}>{summary?.pendingAmount || "ETB 0"}</div>
          <div className="admin-report-label">Amount pending</div>
        </div>
        <div className="admin-report-card">
          <div className="admin-report-value">{settledCount}</div>
          <div className="admin-report-label">Paid out</div>
        </div>
        <div className="admin-report-card">
          <div className="admin-report-value" style={{ color: "#2C5AA0" }}>{summary?.settledAmount || "ETB 0"}</div>
          <div className="admin-report-label">Total paid out</div>
        </div>
      </div>

      {loading ? (
        <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading settlements…</span></div>
      ) : !settlements.length ? (
        <div className="empty-state">
          <Icon name="wallet-outline" size={38} color="#7A8E81" />
          <h3>No settlements yet</h3>
          <p>When a buyer completes an order, the farmer's payout appears here for processing.</p>
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Farmer</th>
                <th>Product</th>
                <th>Buyer</th>
                <th>Net amount</th>
                <th>Breakdown</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((settlement) => (
                <tr key={settlement.id}>
                  <td>
                    <div className="admin-cell-name">{settlement.farmerName}</div>
                    <div className="admin-cell-sub">{settlement.reference}</div>
                  </td>
                  <td>
                    <div className="admin-cell-name">{settlement.productName}</div>
                    <div className="admin-cell-sub">{settlement.orderQuantity} kg</div>
                  </td>
                  <td className="muted">{settlement.buyerName}</td>
                  <td className="bold">{settlement.netAmount}</td>
                  <td>
                    <div className="admin-cell-sub">
                      Product {settlement.productAmount} + delivery {settlement.deliveryFee} − fee {settlement.platformFee}
                    </div>
                  </td>
                  <td>
                    <span className={`admin-chip ${STATUS_CHIP[settlement.status] || "admin-chip-pending"}`}>
                      {settlement.status === "eligible" ? "Eligible" : settlement.status === "settled" ? "Settled" : settlement.status}
                    </span>
                  </td>
                  <td className="muted">{settlement.createdLabel}</td>
                  <td>
                    {settlement.status === "eligible" || settlement.status === "processing" ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => process(settlement)}
                        disabled={busyId === settlement.id}
                      >
                        {busyId === settlement.id ? <Spinner light size={13} /> : <><Icon name="cash-outline" size={13} /> Mark settled</>}
                      </button>
                    ) : (
                      <span className="muted small">{settlement.settledLabel || "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
