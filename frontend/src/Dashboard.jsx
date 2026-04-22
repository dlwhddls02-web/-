import { useState, useEffect } from "react";
import axios from "axios";

const Card = ({ label, value, sub, color }) => (
  <div style={{ background: "white", borderRadius: 16, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", borderLeft: `4px solid ${color}` }}>
    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color }}>{value ?? "—"}</div>
    {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
  </div>
);

export default function Dashboard({ api }) {
  const [data, setData] = useState(null);
  const [sns, setSns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [contracts, setContracts] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [d, s, cu, co] = await Promise.all([
          axios.get(`${api}/api/dashboard`),
          axios.get(`${api}/api/sns/history?limit=5`),
          axios.get(`${api}/api/customers/recent?limit=5`),
          axios.get(`${api}/api/contracts/recent?limit=5`),
        ]);
        setData(d.data);
        setSns(s.data.posts || []);
        setCustomers(cu.data.customers || []);
        setContracts(co.data.contracts || []);
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [api]);

  const fmt = n => n != null ? n.toLocaleString() : "0";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>

      {/* 핵심 지표 */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>📊 핵심 지표 — {data?.period || ""}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Card label="팀원 수"       value={data?.team_size}         color="#2563eb" />
          <Card label="전체 고객"     value={data?.total_customers}   color="#0891b2" />
          <Card label="유효 계약"     value={data?.active_contracts}  color="#059669" sub={data?.monthly_premium ? `월납 ${fmt(data.monthly_premium)}원` : ""} />
          <Card label="SNS 게시"      value={data?.sns_posts_total}   color="#7c3aed" />
          <Card label="이달 팔로업 초과" value={data?.overdue_followups} color="#dc2626" />
          <Card label="이달 매출"     value={data?.monthly_sales ? `${fmt(data.monthly_sales)}만` : "0만"} color="#d97706" />
        </div>
      </section>

      {/* 파이프라인 */}
      {data?.pipeline && (
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>🔄 고객 파이프라인</div>
          <div style={{ background: "white", borderRadius: 14, padding: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(data.pipeline).map(([status, cnt]) => (
              <div key={status} style={{ background: "#f3f4f6", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>{status}</span>
                <span style={{ fontWeight: 700, color: "#111827", marginLeft: 6 }}>{cnt}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SNS 최근 게시물 */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>📱 최근 SNS 게시물</div>
        {sns.length === 0
          ? <div style={{ background: "white", borderRadius: 12, padding: "16px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>아직 게시물이 없습니다</div>
          : sns.map(p => (
            <div key={p.id} style={{ background: "white", borderRadius: 12, padding: "12px 14px", marginBottom: 8, borderLeft: `3px solid ${p.platform === "instagram" ? "#7c3aed" : "#2563eb"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.platform === "instagram" ? "#7c3aed" : "#2563eb" }}>
                  {p.platform === "instagram" ? "📸 인스타그램" : "📘 페이스북"}
                </span>
                <span style={{ fontSize: 10, color: p.status === "posted" ? "#059669" : "#d97706" }}>
                  {p.status === "posted" ? "✅ 게시됨" : "🔄 시뮬레이션"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{(p.caption || p.message || "").slice(0, 80)}...</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{p.insurance_type} · {p.posted_at?.slice(0, 16)}</div>
            </div>
          ))
        }
      </section>

      {/* 최근 고객 */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>👥 최근 고객</div>
        {customers.length === 0
          ? <div style={{ background: "white", borderRadius: 12, padding: 16, fontSize: 13, color: "#9ca3af", textAlign: "center" }}>등록된 고객이 없습니다</div>
          : customers.map(cu => (
            <div key={cu.id} style={{ background: "white", borderRadius: 12, padding: "10px 14px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{cu.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{cu.industry} · {cu.status}</div>
              </div>
              <div style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                {cu.lead_score}점
              </div>
            </div>
          ))
        }
      </section>

      {/* 최근 계약 */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>📋 최근 계약</div>
        {contracts.length === 0
          ? <div style={{ background: "white", borderRadius: 12, padding: 16, fontSize: 13, color: "#9ca3af", textAlign: "center" }}>등록된 계약이 없습니다</div>
          : contracts.map(ct => (
            <div key={ct.id} style={{ background: "white", borderRadius: 12, padding: "10px 14px", marginBottom: 6, borderLeft: "3px solid #059669" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{ct.customer_name} — {ct.insurance_type}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{ct.product_name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: "#059669", fontSize: 13 }}>월 {(ct.premium_monthly || 0).toLocaleString()}원</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>{ct.status}</div>
                </div>
              </div>
            </div>
          ))
        }
      </section>
    </div>
  );
}
