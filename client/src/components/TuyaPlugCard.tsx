import React, { useState, useEffect } from "react";
import { useTuyaPlug } from "../hooks/useTuyaPlug";
import { useElectricityPrice } from "../hooks/useElectricityPrice";

interface TuyaPlugCardProps {
  readOnly?: boolean;
}

export const TuyaPlugCard: React.FC<TuyaPlugCardProps> = ({ readOnly = false }) => {
  const { status, loading, saving, togglePower, setOverride, updateSettings } = useTuyaPlug();
  const { priceCentsKWh } = useElectricityPrice();

  const [priceInput, setPriceInput] = useState<string>("15.0");
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  useEffect(() => {
    if (status?.maxPriceLimit != null && !isEditingPrice) {
      setPriceInput(String(status.maxPriceLimit));
    }
  }, [status?.maxPriceLimit, isEditingPrice]);

  if (loading && !status) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
        ⏳ Ladataan Tuya Energy+ -älypistorasian tietoja...
      </div>
    );
  }

  const isOn = Boolean(status?.isOn);
  const powerW = status?.telemetry?.power_w ?? 0;
  const voltageV = status?.telemetry?.voltage_v ?? 0;
  const currentA = status?.telemetry?.current_a ?? 0;
  const energyKwh = status?.telemetry?.today_energy_kwh ?? 0;
  const mode = status?.mode || "auto";
  const maxPrice = status?.maxPriceLimit ?? 15.0;
  const isOverride = status?.overrideActive;
  const overrideMin = status?.overrideMinutesRemaining ?? 0;

  const currentPrice = priceCentsKWh;
  const isPriceExceeded = currentPrice != null && currentPrice > maxPrice;

  const handleSavePrice = async (newVal?: number) => {
    const val = newVal ?? parseFloat(priceInput);
    if (isNaN(val) || val <= 0) return;
    setPriceInput(val.toFixed(1));
    setIsEditingPrice(false);
    await updateSettings({ maxPriceLimit: val });
  };

  const handleModeChange = async (newMode: string) => {
    await updateSettings({ mode: newMode });
  };

  return (
    <div
      className="card"
      style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(145deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.95) 100%)",
        border: isOn
          ? "1px solid rgba(74, 222, 128, 0.35)"
          : isPriceExceeded && mode === "auto"
          ? "1px solid rgba(245, 158, 11, 0.35)"
          : "1px solid rgba(56, 189, 248, 0.25)",
        borderRadius: 16,
        padding: "20px 22px",
        boxShadow: isOn
          ? "0 8px 32px rgba(34, 197, 94, 0.08), 0 2px 10px rgba(0, 0, 0, 0.3)"
          : "0 4px 20px rgba(0, 0, 0, 0.25)",
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
      }}
    >
      {/* Accent top glow */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "5%",
          right: "5%",
          height: "2px",
          background: isOn
            ? "linear-gradient(90deg, transparent, rgba(74, 222, 128, 0.8), transparent)"
            : "linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.6), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* Header Row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          paddingBottom: 16,
          borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: isOn
                ? "linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(16, 185, 129, 0.15))"
                : "linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(148, 163, 184, 0.1))",
              border: isOn ? "1px solid rgba(74, 222, 128, 0.4)" : "1px solid rgba(255, 255, 255, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.4rem",
              boxShadow: isOn ? "0 0 15px rgba(74, 222, 128, 0.25)" : "none",
            }}
          >
            🔌
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                {status?.name || "Energy+ Älypistorasia Home Connect IP20"}
              </h3>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "rgba(56, 189, 248, 0.12)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.25)",
                }}
              >
                Tuya / Smart Life
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "rgba(168, 85, 247, 0.12)",
                  color: "#c084fc",
                  border: "1px solid rgba(168, 85, 247, 0.25)",
                }}
              >
                APC Hintaleikkuri
              </span>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Malli: smart-PFW02-G · ID: {status?.deviceId}
            </p>
          </div>
        </div>

        {/* State Badge & Main Power Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: "0.82rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: isOn ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.12)",
              color: isOn ? "#4ade80" : "#f87171",
              border: isOn ? "1px solid rgba(74, 222, 128, 0.35)" : "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isOn ? "#4ade80" : "#ef4444",
                boxShadow: isOn ? "0 0 8px #4ade80" : "none",
              }}
            />
            <span>{isOn ? "PÄÄLLÄ (ON)" : "POIS PÄÄLTÄ (OFF)"}</span>
          </div>

          <button
            type="button"
            disabled={readOnly || saving}
            onClick={() => togglePower(!isOn)}
            style={{
              padding: "8px 18px",
              borderRadius: 10,
              fontSize: "0.84rem",
              fontWeight: 700,
              cursor: readOnly || saving ? "not-allowed" : "pointer",
              border: "none",
              color: "#fff",
              background: isOn
                ? "linear-gradient(135deg, #ef4444, #b91c1c)"
                : "linear-gradient(135deg, #10b981, #059669)",
              boxShadow: isOn
                ? "0 4px 14px rgba(239, 68, 68, 0.35)"
                : "0 4px 14px rgba(16, 185, 129, 0.35)",
              transition: "transform 0.1s ease",
            }}
          >
            {saving ? "⏳ Käsitellään..." : isOn ? "Katkaise virta" : "Kytke päälle"}
          </button>
        </div>
      </div>

      {/* APC Reason / Hintaleikkuri Banner */}
      <div
        style={{
          marginBottom: 18,
          padding: "12px 16px",
          borderRadius: 12,
          background: isPriceExceeded && mode === "auto"
            ? "rgba(245, 158, 11, 0.1)"
            : isOn
            ? "rgba(34, 197, 94, 0.08)"
            : "rgba(56, 189, 248, 0.06)",
          border: isPriceExceeded && mode === "auto"
            ? "1px solid rgba(245, 158, 11, 0.3)"
            : isOn
            ? "1px solid rgba(74, 222, 128, 0.25)"
            : "1px solid rgba(56, 189, 248, 0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.2rem" }}>
            {isOverride ? "⏱️" : isPriceExceeded && mode === "auto" ? "🛑" : isOn ? "✅" : "💤"}
          </span>
          <div>
            <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {status?.reason || (isOn ? "Pistorasia kytketty päälle" : "Pistorasia kytketty pois päältä")}
            </div>
            <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: 2 }}>
              Spot-hinta nyt: <strong style={{ color: isPriceExceeded ? "#fb923c" : "#38bdf8" }}>{currentPrice != null ? `${currentPrice.toFixed(1)} snt/kWh` : "—"}</strong>
              {" · "}
              Katkaisuraja: <strong>{maxPrice.toFixed(1)} snt/kWh</strong>
              {isOverride && (
                <span style={{ color: "#38bdf8", fontWeight: 600, marginLeft: 6 }}>
                  (Manuaaliohitus aktiivinen, {overrideMin} min jäljellä)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Override Clear Button if active */}
        {isOverride && (
          <button
            type="button"
            disabled={readOnly || saving}
            onClick={() => setOverride(null, 0)}
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: "0.78rem",
              fontWeight: 600,
              background: "rgba(56, 189, 248, 0.15)",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              color: "#38bdf8",
              cursor: "pointer",
            }}
          >
            🔄 Palauta automaatio
          </button>
        )}
      </div>

      {/* 4-Metric Realtime Telemetry Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {/* Power */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            ⚡ Hetkellinen Teho
          </span>
          <span style={{ fontSize: "1.35rem", fontWeight: 800, color: powerW > 5 ? "#38bdf8" : "var(--text-primary)", marginTop: 4 }}>
            {powerW.toFixed(1)} <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-muted)" }}>W</span>
          </span>
        </div>

        {/* Energy Today */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            📊 Päivän Kulutus
          </span>
          <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#a78bfa", marginTop: 4 }}>
            {energyKwh.toFixed(2)} <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-muted)" }}>kWh</span>
          </span>
        </div>

        {/* Voltage */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            🔌 Jännite
          </span>
          <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
            {voltageV > 0 ? voltageV.toFixed(0) : "—"} <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-muted)" }}>V</span>
          </span>
        </div>

        {/* Current */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            〰️ Virta
          </span>
          <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>
            {currentA.toFixed(2)} <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-muted)" }}>A</span>
          </span>
        </div>
      </div>

      {/* Control Panel: Mode Selector, Price Threshold, Manual Override */}
      <div
        style={{
          background: "rgba(0, 0, 0, 0.25)",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: 14,
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {/* Operating Mode */}
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
              ⚙️ Ohjaustila (APC Kuormanohjaus)
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={readOnly || saving}
                onClick={() => handleModeChange("auto")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: mode === "auto" ? "1px solid rgba(56, 189, 248, 0.6)" : "1px solid rgba(255, 255, 255, 0.1)",
                  background: mode === "auto" ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  color: mode === "auto" ? "#38bdf8" : "var(--text-secondary)",
                }}
              >
                🤖 Automaattinen
              </button>
              <button
                type="button"
                disabled={readOnly || saving}
                onClick={() => handleModeChange("constant_on")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: mode === "constant_on" ? "1px solid rgba(74, 222, 128, 0.6)" : "1px solid rgba(255, 255, 255, 0.1)",
                  background: mode === "constant_on" ? "rgba(74, 222, 128, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  color: mode === "constant_on" ? "#4ade80" : "var(--text-secondary)",
                }}
              >
                ⚡ Aina päällä
              </button>
              <button
                type="button"
                disabled={readOnly || saving}
                onClick={() => handleModeChange("constant_off")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: mode === "constant_off" ? "1px solid rgba(239, 68, 68, 0.6)" : "1px solid rgba(255, 255, 255, 0.1)",
                  background: mode === "constant_off" ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  color: mode === "constant_off" ? "#f87171" : "var(--text-secondary)",
                }}
              >
                🛑 Aina pois
              </button>
            </div>
            <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 6 }}>
              {mode === "auto"
                ? "Katkaisee sähkön kun spot-hinta > hintaraja. Kytkee päälle kun hinta laskee."
                : mode === "constant_on"
                ? "Pidetään jatkuvasti päällä pörssisähkön hinnasta riippumatta."
                : "Virransyöttö on katkaistu kokonaan."}
            </span>
          </div>

          {/* Price Limit Setting */}
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
              💰 Hintaleikkurin raja (snt/kWh)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                disabled={readOnly || saving}
                value={priceInput}
                onChange={(e) => {
                  setPriceInput(e.target.value);
                  setIsEditingPrice(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSavePrice();
                }}
                style={{
                  width: 90,
                  padding: "7px 10px",
                  borderRadius: 8,
                  background: "rgba(10, 15, 29, 0.9)",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
              <button
                type="button"
                disabled={readOnly || saving}
                onClick={() => handleSavePrice()}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #0284c7, #0369a1)",
                  border: "none",
                  color: "#fff",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Tallenna
              </button>

              {/* Presets */}
              <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                {[10, 12, 15, 20].map((val) => (
                  <button
                    key={val}
                    type="button"
                    disabled={readOnly || saving}
                    onClick={() => handleSavePrice(val)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      background: maxPrice === val ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.05)",
                      border: maxPrice === val ? "1px solid rgba(56, 189, 248, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
                      color: maxPrice === val ? "#38bdf8" : "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {val}c
                  </button>
                ))}
              </div>
            </div>
            <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 6 }}>
              Virta katkeaa heti kun pörssisähkö ylittää {maxPrice.toFixed(1)} snt/kWh.
            </span>
          </div>
        </div>

        {/* Quick Overrides Row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginRight: 4 }}>
            ⏱️ Väliaikainen pakotus:
          </span>
          <button
            type="button"
            disabled={readOnly || saving}
            onClick={() => setOverride("ON", 1)}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              fontSize: "0.76rem",
              fontWeight: 600,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(74, 222, 128, 0.3)",
              color: "#4ade80",
              cursor: "pointer",
            }}
          >
            ⚡ Pakota päälle 1h
          </button>
          <button
            type="button"
            disabled={readOnly || saving}
            onClick={() => setOverride("ON", 2)}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              fontSize: "0.76rem",
              fontWeight: 600,
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(74, 222, 128, 0.3)",
              color: "#4ade80",
              cursor: "pointer",
            }}
          >
            ⚡ Pakota päälle 2h
          </button>
          <button
            type="button"
            disabled={readOnly || saving}
            onClick={() => setOverride("OFF", 2)}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              fontSize: "0.76rem",
              fontWeight: 600,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              cursor: "pointer",
            }}
          >
            🛑 Pakota pois 2h
          </button>
          {isOverride && (
            <button
              type="button"
              disabled={readOnly || saving}
              onClick={() => setOverride(null, 0)}
              style={{
                marginLeft: "auto",
                padding: "5px 12px",
                borderRadius: 7,
                fontSize: "0.76rem",
                fontWeight: 600,
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                color: "#38bdf8",
                cursor: "pointer",
              }}
            >
              🔄 Palauta automaatio
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
