import React from "react";
import { TapoPlugsCard } from "./TapoPlugsCard";
import { ErrorBoundary } from "./ErrorBoundary";
import { useTapo } from "../hooks/useTapo";
import { useTuyaPlug } from "../hooks/useTuyaPlug";
import { useOutdoorLights } from "../hooks/useOutdoorLights";
import type { TrendTopicTarget } from "./VariableTrendModal";

interface PlugsPageProps {
  onOpenTrend?: (target: TrendTopicTarget) => void;
  readOnly?: boolean;
}

export const PlugsPage: React.FC<PlugsPageProps> = ({
  onOpenTrend,
  readOnly = false,
}) => {
  const { devices: tapoDevices } = useTapo();
  const { status: tuyaPlugStatus } = useTuyaPlug();
  const { status: outdoorLightsStatus } = useOutdoorLights();

  // Total monitored plug and smart switch power
  const tapoPower = tapoDevices.reduce((sum, d) => sum + (d.power_w || 0), 0);
  const tuyaPower = tuyaPlugStatus?.telemetry?.power_w ?? 0;
  const relayPower = outdoorLightsStatus?.telemetry?.power_w ?? 0;
  const totalPowerW = tapoPower + tuyaPower + relayPower;

  const activeTapoCount = tapoDevices.filter((d) => d.state === "ON").length;
  const isTuyaOn = tuyaPlugStatus?.isOn ?? false;
  const isRelayOn = outdoorLightsStatus?.isOn ?? false;
  const totalActiveDevices = activeTapoCount + (isTuyaOn ? 1 : 0) + (isRelayOn ? 1 : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 40 }}>
      {/* Category Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 10 }}>
            <span>🔌</span> Älypistorasiat & Kytkimet
          </h2>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 3 }}>
            Kaikki kodin älypistorasiat (Energy+ Tuya & Tapo P115) sekä WiFi-mittausrele yhtenäisessä pörssiohjauksessa
          </div>
        </div>

        {/* Global Plug & Relay Load Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(56, 189, 248, 0.08)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            borderRadius: 14,
            padding: "8px 16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Yhteiskuorma nyt</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#38bdf8" }}>
              {totalPowerW > 0 ? totalPowerW.toFixed(1) : "0"} W
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: "rgba(255, 255, 255, 0.1)" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Päällä</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: totalActiveDevices > 0 ? "#4ade80" : "var(--text-secondary)" }}>
              {totalActiveDevices} kpl
            </span>
          </div>
        </div>
      </div>

      {/* Unified Smart Plugs Grid (Contains Tuya Energy+ and Tapo P115 plugs) */}
      <ErrorBoundary>
        <TapoPlugsCard onOpenTrend={onOpenTrend} readOnly={readOnly} />
      </ErrorBoundary>

      {/* WiFi Switch / Smart Metering Relay Section (Energiamittaus ilman ohjauskytkimiä) */}
      <div style={{ marginTop: 8 }}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>
              WiFi-Mittausrele (Ulkovalaistuksen energiamittaus)
            </h3>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Ulkovalojen kytkin- ja hämäräohjaus sijaitsee 💡 Valaistus -sivulla
          </span>
        </div>

        <div
          className="card"
          style={{
            background: "linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 16,
            padding: "16px 20px",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Hetkellinen teho</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8", marginTop: 4 }}>
                {outdoorLightsStatus?.telemetry?.power_w != null ? `${outdoorLightsStatus.telemetry.power_w.toFixed(1)} W` : "—"}
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Kokonaissähkö (kWh)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80", marginTop: 4 }}>
                {outdoorLightsStatus?.telemetry?.energy_kwh != null ? `${outdoorLightsStatus.telemetry.energy_kwh.toFixed(2)} kWh` : "—"}
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Jännite & Virta</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>
                {outdoorLightsStatus?.telemetry?.voltage_v != null ? `${outdoorLightsStatus.telemetry.voltage_v.toFixed(1)} V` : "—"}
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6 }}>
                  ({outdoorLightsStatus?.telemetry?.current_a != null ? `${outdoorLightsStatus.telemetry.current_a.toFixed(2)} A` : "—"})
                </span>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Releen tila</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: outdoorLightsStatus?.isOn ? "#4ade80" : "var(--text-muted)", marginTop: 4 }}>
                {outdoorLightsStatus?.isOn ? "⚡ Kytketty (Kuorma aktiivinen)" : "Pois päältä"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
