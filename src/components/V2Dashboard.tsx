import React from 'react';
import { Activity, BatteryCharging, Gauge, Thermometer, Wrench, CheckCircle2, AlertTriangle, Cpu, Database } from 'lucide-react';
import { TelemetryData, ConnectionType } from '../types';
import { identifyHarleyVehicle } from '../services/harleyVehicleIdentifier';

interface V2DashboardProps {
  telemetry: TelemetryData;
  connectionType: ConnectionType;
  speedUnit: 'kmh' | 'mph';
  tempUnit: 'celsius' | 'fahrenheit';
  onOpenDiagnostics: () => void;
  onOpenDatalogger: () => void;
}

const percentOrDash = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';

export const V2Dashboard: React.FC<V2DashboardProps> = ({
  telemetry,
  connectionType,
  speedUnit,
  tempUnit,
  onOpenDiagnostics,
  onOpenDatalogger,
}) => {
  const connected = connectionType !== 'disconnected';
  const identified = connected && Boolean(telemetry.vin);
  const identity = identifyHarleyVehicle(telemetry.vin);
  const speed = speedUnit === 'kmh' ? telemetry.speedKmH : telemetry.speedMph;
  const temp = tempUnit === 'celsius' ? telemetry.engineTempC : telemetry.engineTempF;
  const tempSuffix = tempUnit === 'celsius' ? '°C' : '°F';
  const battery = telemetry.batteryVoltage > 0 ? telemetry.batteryVoltage : telemetry.elmSupplyVoltage;
  const currentCount = telemetry.activeDtcList?.length ?? 0;
  const historicCount = telemetry.historicDtcList?.length ?? 0;

  const metricCards = [
    { label: 'Temp. do Motor', value: temp > 0 ? `${temp.toFixed(0)} ${tempSuffix}` : '—', icon: Thermometer, source: 'LIVE' },
    { label: 'MAP (Pressão Coletor)', value: typeof telemetry.manifoldPressureKpa === 'number' ? `${telemetry.manifoldPressureKpa.toFixed(1)} kPa` : '—', icon: Activity, source: 'ECM' },
    { label: 'TPS (Borboleta)', value: percentOrDash(telemetry.throttlePosition), icon: Gauge, source: 'ECM' },
    { label: 'Tensão da Bateria', value: battery && battery > 0 ? `${battery.toFixed(1)} V` : '—', icon: BatteryCharging, source: telemetry.batteryVoltage > 0 ? 'ECM' : 'ELM' },
  ];

  return (
    <div className="v2-dashboard">
      <section className="v2-live-grid">
        <div className="v2-gauge v2-gauge-rpm">
          <div className="v2-gauge-ring" style={{ '--gauge-pct': `${Math.min(100, Math.max(0, telemetry.rpm / 70))}%` } as React.CSSProperties}>
            <div className="v2-gauge-inner">
              <span className="v2-gauge-value">{connected ? Math.round(telemetry.rpm).toLocaleString('pt-BR') : '—'}</span>
              <span className="v2-gauge-unit">RPM</span>
            </div>
          </div>
          <div className="v2-gauge-caption">Rotação do motor</div>
        </div>

        <div className="v2-gauge v2-gauge-speed">
          <div className="v2-gauge-ring" style={{ '--gauge-pct': `${Math.min(100, Math.max(0, speed / (speedUnit === 'kmh' ? 2.2 : 1.4)))}%` } as React.CSSProperties}>
            <div className="v2-gauge-inner">
              <span className="v2-gauge-value">{connected ? Math.round(speed) : '—'}</span>
              <span className="v2-gauge-unit">{speedUnit === 'kmh' ? 'km/h' : 'mph'}</span>
            </div>
          </div>
          <div className="v2-gauge-caption">Velocidade</div>
        </div>

        <div className="v2-compact-stack">
          <div className="v2-compact-gauge"><span>TPS</span><strong>{percentOrDash(telemetry.throttlePosition)}</strong></div>
          <div className="v2-compact-gauge"><span>Marcha</span><strong>{connected ? telemetry.gear : '—'}</strong></div>
          <div className="v2-compact-gauge"><span>Link</span><strong>{connected ? (connectionType === 'simulator' ? 'SIM' : 'LIVE') : 'OFF'}</strong></div>
        </div>
      </section>

      <section className="v2-metrics-row">
        {metricCards.map(({ label, value, icon: Icon, source }) => (
          <div className="v2-metric-card" key={label}>
            <Icon className="v2-metric-icon" />
            <div><strong>{value}</strong><span>{label}</span></div>
            <small>{source}</small>
          </div>
        ))}
      </section>

      <section className="v2-bottom-grid">
        <article className="v2-panel">
          <header><Cpu /><strong>ECM / VIN</strong></header>
          {!identified ? (
            <div className="v2-empty"><Database /><strong>Aguardando identificação</strong><span>Os dados da motocicleta aparecem somente após a leitura real.</span></div>
          ) : (
            <div className="v2-kv">
              <span>VIN</span><strong>{telemetry.vin}</strong>
              <span>ECM P/N</span><strong>{telemetry.ecuPartNumber || '—'}</strong>
              <span>Calibração</span><strong>{telemetry.ecuCalId || '—'}</strong>
              <span>Ano / Modelo</span><strong>{identity?.modelYear ? `${identity.modelYear} · ${identity.factoryModel || identity.commercialName || 'Harley-Davidson'}` : 'Harley-Davidson'}</strong>
              <span>Motor</span><strong>{identity?.engine || '—'}</strong>
              <span>Planta de montagem</span><strong>{identity?.assemblyPlant ? `${telemetry.vin?.[10] || ''} · ${identity.assemblyPlant}` : 'Unknown'}</strong>
            </div>
          )}
        </article>

        <article className="v2-panel v2-dtc-panel">
          <header><AlertTriangle /><strong>DTC</strong></header>
          <div className={`v2-dtc-state ${currentCount ? 'danger' : 'ok'}`}>
            {currentCount ? <AlertTriangle /> : <CheckCircle2 />}
            <div><strong>Correntes (0x13)</strong><span>{currentCount ? `${currentCount} código(s) presente(s)` : 'Nenhum código corrente'}</span></div>
          </div>
          <div className="v2-dtc-state historic"><Activity /><div><strong>Histórico (0x11)</strong><span>{historicCount ? `${historicCount} código(s) armazenado(s)` : 'Nenhum código histórico'}</span></div></div>
          <button onClick={onOpenDiagnostics}><Wrench /> Abrir diagnóstico completo</button>
        </article>

        <article className="v2-panel v2-data-panel">
          <header><Activity /><strong>Datalog / Tempo Real</strong></header>
          <div className="v2-data-hero"><span>Fonte</span><strong>{connected ? 'Telemetria real disponível' : 'Aguardando conexão'}</strong><small>RPM · TPS · MAP · Temperatura · Tensão</small></div>
          <button onClick={onOpenDatalogger}><Activity /> Abrir Datalogger</button>
        </article>
      </section>
    </div>
  );
};
