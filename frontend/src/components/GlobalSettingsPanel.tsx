import type { GlobalOptions } from '../types';

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
  width: '100%',
  boxSizing: 'border-box',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 24,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
  marginBottom: 4,
};

interface GlobalSettingsPanelProps {
  configJson: Record<string, unknown>;
  onConfigChange: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  globalOptions: GlobalOptions | null;
}

export function GlobalSettingsPanel({ configJson, onConfigChange, globalOptions }: GlobalSettingsPanelProps) {
  const enabledFeatures = Array.isArray(configJson.enabledFeatures)
    ? (configJson.enabledFeatures as string[])
    : [];
  const plugins = Array.isArray(configJson.plugins) ? (configJson.plugins as string[]) : [];
  const worker = configJson.worker && typeof configJson.worker === 'object' ? (configJson.worker as Record<string, unknown>) : {};
  const temporal = configJson.temporal && typeof configJson.temporal === 'object' ? (configJson.temporal as Record<string, unknown>) : {};
  const activity = configJson.activity && typeof configJson.activity === 'object' ? (configJson.activity as Record<string, unknown>) : {};
  const activityPayload = activity.payload && typeof activity.payload === 'object' ? (activity.payload as Record<string, unknown>) : {};
  const activityTimeouts = activity.defaultTimeouts && typeof activity.defaultTimeouts === 'object' ? (activity.defaultTimeouts as Record<string, unknown>) : {};
  const activityRetry = activity.retryPolicy && typeof activity.retryPolicy === 'object' ? (activity.retryPolicy as Record<string, unknown>) : {};

  const setEnabledFeatures = (next: string[]) => {
    onConfigChange((prev) => ({ ...prev, enabledFeatures: next }));
  };

  const setPlugins = (next: string[]) => {
    onConfigChange((prev) => ({ ...prev, plugins: next }));
  };

  const toggleFeature = (id: string, checked: boolean) => {
    if (checked) setEnabledFeatures([...enabledFeatures, id].filter((x, i, a) => a.indexOf(x) === i));
    else setEnabledFeatures(enabledFeatures.filter((x) => x !== id));
  };

  const addPlugin = (id: string) => {
    if (!id || plugins.includes(id)) return;
    setPlugins([...plugins, id]);
  };

  const removePlugin = (id: string) => {
    setPlugins(plugins.filter((p) => p !== id));
  };

  const featureFlags = globalOptions?.featureFlags ?? [];
  const pluginOptions = globalOptions?.plugins ?? [];

  return (
    <div style={{ padding: 24, overflow: 'auto', maxWidth: 720 }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem' }}>Feature flags & settings</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 20 }}>
        Options are loaded from <code>components/global</code>. These values are written into the engine config (pipelines tab edits the pipeline block only).
      </p>

      <section style={sectionStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Config version</h3>
        <input
          type="text"
          value={(configJson.configVersion as string) ?? '1.0'}
          onChange={(e) => onConfigChange((prev) => ({ ...prev, configVersion: e.target.value || undefined }))}
          placeholder="1.0"
          style={{ ...inputStyle, maxWidth: 120 }}
        />
      </section>

      <section style={sectionStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Plugin repo package prefix</h3>
        <input
          type="text"
          value={(configJson.pluginRepoPackagePrefix as string) ?? ''}
          onChange={(e) => onConfigChange((prev) => ({ ...prev, pluginRepoPackagePrefix: e.target.value || undefined }))}
          placeholder="com.openllmorchestrator.worker.plugin"
          style={inputStyle}
        />
      </section>

      <section style={sectionStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Feature flags</h3>
        <p style={{ ...labelStyle, marginBottom: 8 }}>Enable the features that should run at bootstrap.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {featureFlags.length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No feature flags from components/global. Add feature-flags.json.</span>
          )}
          {featureFlags.map((ff) => (
            <label key={ff.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabledFeatures.includes(ff.id)}
                onChange={(e) => toggleFeature(ff.id, e.target.checked)}
              />
              <span>{ff.name}</span>
              {ff.description && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>({ff.description})</span>
              )}
            </label>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Plugins (allow-list)</h3>
        <p style={{ ...labelStyle, marginBottom: 8 }}>Plugin IDs allowed for static pipelines and dynamic use. Options from components/global/plugins.json.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <select
            style={{ ...inputStyle, maxWidth: 320 }}
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) addPlugin(id);
              e.target.value = '';
            }}
          >
            <option value="">Add plugin…</option>
            {pluginOptions.filter((p) => !plugins.includes(p.id)).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {plugins.map((id) => (
            <li key={id} style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ fontSize: '0.8rem', flex: 1, wordBreak: 'break-all' }}>{id}</code>
              <button
                type="button"
                className="form-actions secondary"
                style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                onClick={() => removePlugin(id)}
              >
                Remove
              </button>
            </li>
          ))}
          {plugins.length === 0 && (
            <li style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No plugins selected. Add from dropdown above.</li>
          )}
        </ul>
      </section>

      <section style={sectionStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Worker</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={labelStyle}>Queue name</label>
            <input
              type="text"
              value={(worker.queueName as string) ?? ''}
              onChange={(e) =>
                onConfigChange((prev) => ({
                  ...prev,
                  worker: { ...(prev.worker as Record<string, unknown>), queueName: e.target.value || undefined },
                }))
              }
              placeholder="core-task-queue"
              style={inputStyle}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!worker.strictBoot}
              onChange={(e) =>
                onConfigChange((prev) => ({
                  ...prev,
                  worker: { ...(prev.worker as Record<string, unknown>), strictBoot: e.target.checked },
                }))
              }
            />
            <span>Strict boot</span>
          </label>
        </div>
      </section>

      <section style={sectionStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Temporal</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={labelStyle}>Target</label>
            <input
              type="text"
              value={(temporal.target as string) ?? ''}
              onChange={(e) =>
                onConfigChange((prev) => ({
                  ...prev,
                  temporal: { ...(prev.temporal as Record<string, unknown>), target: e.target.value || undefined },
                }))
              }
              placeholder="localhost:7233"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Namespace</label>
            <input
              type="text"
              value={(temporal.namespace as string) ?? ''}
              onChange={(e) =>
                onConfigChange((prev) => ({
                  ...prev,
                  temporal: { ...(prev.temporal as Record<string, unknown>), namespace: e.target.value || undefined },
                }))
              }
              placeholder="default"
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Activity defaults</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={labelStyle}>maxAccumulatedOutputKeys</label>
            <input
              type="number"
              min={0}
              value={(activityPayload.maxAccumulatedOutputKeys as number) ?? 0}
              onChange={(e) =>
                onConfigChange((prev) => {
                  const act = (prev.activity as Record<string, unknown>) ?? {};
                  const payload = (act.payload as Record<string, unknown>) ?? {};
                  return {
                    ...prev,
                    activity: { ...act, payload: { ...payload, maxAccumulatedOutputKeys: e.target.valueAsNumber || 0 } },
                  };
                })
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>maxResultOutputKeys</label>
            <input
              type="number"
              min={0}
              value={(activityPayload.maxResultOutputKeys as number) ?? 0}
              onChange={(e) =>
                onConfigChange((prev) => {
                  const act = (prev.activity as Record<string, unknown>) ?? {};
                  const payload = (act.payload as Record<string, unknown>) ?? {};
                  return {
                    ...prev,
                    activity: { ...act, payload: { ...payload, maxResultOutputKeys: e.target.valueAsNumber || 0 } },
                  };
                })
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Schedule to start (seconds)</label>
            <input
              type="number"
              min={0}
              value={(activityTimeouts.scheduleToStartSeconds as number) ?? 60}
              onChange={(e) =>
                onConfigChange((prev) => {
                  const act = (prev.activity as Record<string, unknown>) ?? {};
                  const timeouts = (act.defaultTimeouts as Record<string, unknown>) ?? {};
                  return {
                    ...prev,
                    activity: { ...act, defaultTimeouts: { ...timeouts, scheduleToStartSeconds: e.target.valueAsNumber || 0 } },
                  };
                })
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Start to close (seconds)</label>
            <input
              type="number"
              min={0}
              value={(activityTimeouts.startToCloseSeconds as number) ?? 30}
              onChange={(e) =>
                onConfigChange((prev) => {
                  const act = (prev.activity as Record<string, unknown>) ?? {};
                  const timeouts = (act.defaultTimeouts as Record<string, unknown>) ?? {};
                  return {
                    ...prev,
                    activity: { ...act, defaultTimeouts: { ...timeouts, startToCloseSeconds: e.target.valueAsNumber || 0 } },
                  };
                })
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Schedule to close (seconds)</label>
            <input
              type="number"
              min={0}
              value={(activityTimeouts.scheduleToCloseSeconds as number) ?? 300}
              onChange={(e) =>
                onConfigChange((prev) => {
                  const act = (prev.activity as Record<string, unknown>) ?? {};
                  const timeouts = (act.defaultTimeouts as Record<string, unknown>) ?? {};
                  return {
                    ...prev,
                    activity: { ...act, defaultTimeouts: { ...timeouts, scheduleToCloseSeconds: e.target.valueAsNumber || 0 } },
                  };
                })
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Retry: maximum attempts</label>
            <input
              type="number"
              min={0}
              value={(activityRetry.maximumAttempts as number) ?? 3}
              onChange={(e) =>
                onConfigChange((prev) => {
                  const act = (prev.activity as Record<string, unknown>) ?? {};
                  const retry = (act.retryPolicy as Record<string, unknown>) ?? {};
                  return {
                    ...prev,
                    activity: { ...act, retryPolicy: { ...retry, maximumAttempts: e.target.valueAsNumber ?? 3 } },
                  };
                })
              }
              style={inputStyle}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
