import { useCallback, useEffect, useState } from "react";
import Icon from "../../Icon.jsx";
import { api } from "../../api.js";
import { Spinner } from "../../components/Spinner.jsx";

const fmtTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function AdminReports() {
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/admin/report");
      setReport(data);
    } catch {
      setReport(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!report) {
    return <div className="card card-pad"><Spinner size={18} /> <span className="muted small bold">Loading report…</span></div>;
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 900, color: "var(--green-950)" }}>Reports</h2>

      <div className="admin-report-grid">
        {report.summaryRows.map((row) => (
          <div key={row.label} className="admin-report-card">
            <div className="admin-report-value">{row.value}</div>
            <div className="admin-report-label">{row.label}</div>
          </div>
        ))}
      </div>

      <div className="buyer-heading" style={{ marginTop: 6 }}>
        <h2 style={{ fontSize: 18 }}>Reported issues</h2>
        <span className="section-hint">{report.issues.length} total</span>
      </div>

      {!report.issues.length ? (
        <div className="empty-state">
          <Icon name="checkmark-done-outline" size={38} color="#7A8E81" />
          <h3>No reported issues</h3>
          <p>When buyers report issues on orders, they'll appear here for review.</p>
        </div>
      ) : (
        report.issues.map((issue) => (
          <div key={issue.id} className="issue-card">
            <div className="issue-title">🚩 Issue from {issue.senderName}</div>
            <div className="issue-meta">
              Reported at {fmtTime(issue.createdAt)} · involving {issue.receiverName}
            </div>
            <div className="issue-text">{issue.message}</div>
          </div>
        ))
      )}

      <div className="buyer-heading" style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 18 }}>Order status totals</h2>
      </div>
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Orders</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(report.statusTotals || {}).map(([status, count]) => (
              <tr key={status}>
                <td>
                  <span className={`pill ${status === "pending" ? "pill-pending" : status === "accepted" ? "pill-accepted" : "pill-rejected"}`}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                </td>
                <td className="bold">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
