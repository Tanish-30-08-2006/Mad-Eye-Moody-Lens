import { useEffect, useState } from "react";
import {
  AuthType,
  ExternalProviderConfig,
  ImageTransport,
  testExternalProvider,
} from "../services/externalProvider";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: ExternalProviderConfig;
  onSave: (config: ExternalProviderConfig) => void;
  onClear: () => void;
  invitationMessage?: string | null;
}

export function ExternalProviderModal({
  isOpen,
  onClose,
  config,
  onSave,
  onClear,
  invitationMessage,
}: Props) {
  const [form, setForm] = useState<ExternalProviderConfig>(config);
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync form when modal opens or config changes
  useEffect(() => {
    if (isOpen) {
      setForm(config);
      setError(null);
      setTestResult(null);
      setShowKey(false);
    }
  }, [isOpen, config]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = <K extends keyof ExternalProviderConfig>(
    key: K,
    value: ExternalProviderConfig[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setTestResult(null);
  };

  const handleTest = async () => {
    setError(null);
    setTestResult(null);
    setTesting(true);
    try {
      const res = await testExternalProvider(form);
      setTestResult({ ok: true, message: res.message });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    try {
      onSave(form);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to remove your external provider credentials and reset settings?")) {
      onClear();
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card">
        <header className="modal-card__head">
          <div>
            <span className="label" style={{ color: "var(--primary)" }}>Settings · External Integration</span>
            <h3 id="modal-title" style={{ margin: "4px 0 0", fontFamily: "var(--serif)", fontSize: 24 }}>
              External AI Provider
            </h3>
          </div>
          <button className="link-btn" onClick={onClose} aria-label="Close modal" style={{ fontSize: 20 }}>
            ✕
          </button>
        </header>

        <div className="modal-card__body">
          {invitationMessage && (
            <div className="alert alert--info" role="status">
              <strong>Notice</strong>
              {invitationMessage}
            </div>
          )}

          <p className="note" style={{ margin: 0 }}>
            Configure your own external AI image analysis API (e.g. BitMind Oracle, HuggingFace, or a custom REST model).
            Your API key remains securely in your browser and is <strong>never sent to the Mad-Eye Moody Lens backend</strong>.
          </p>

          {error && (
            <div className="alert" role="alert">
              <strong>Configuration Error</strong>
              {error}
            </div>
          )}

          {testResult && (
            <div className={`alert ${testResult.ok ? "alert--success" : ""}`} role="status">
              <strong>{testResult.ok ? "Connection Verified" : "Connection Failed"}</strong>
              {testResult.message}
            </div>
          )}

          <div className="form-group">
            <label className="label" htmlFor="prov-name">Provider Display Name</label>
            <input
              id="prov-name"
              className="form-input"
              type="text"
              placeholder="e.g. BitMind Oracle or Custom Detector"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="prov-endpoint">API Endpoint URL (HTTPS)</label>
            <input
              id="prov-endpoint"
              className="form-input"
              type="url"
              placeholder="https://api.your-provider.com/v1/detect"
              value={form.endpoint}
              onChange={(e) => handleChange("endpoint", e.target.value)}
            />
            <span className="form-help">Must be an absolute HTTPS URL (or HTTP localhost for local development).</span>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label" htmlFor="prov-auth">Authentication Type</label>
              <select
                id="prov-auth"
                className="form-input"
                value={form.authType}
                onChange={(e) => handleChange("authType", e.target.value as AuthType)}
              >
                <option value="bearer">Bearer Token (Authorization: Bearer ...)</option>
                <option value="header">Custom API-Key Header</option>
                <option value="none">No Authentication (Public API)</option>
              </select>
            </div>

            {form.authType === "header" && (
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label" htmlFor="prov-auth-header">Header Name</label>
                <input
                  id="prov-auth-header"
                  className="form-input"
                  type="text"
                  placeholder="x-api-key"
                  value={form.authHeaderName}
                  onChange={(e) => handleChange("authHeaderName", e.target.value)}
                />
              </div>
            )}
          </div>

          {form.authType !== "none" && (
            <div className="form-group">
              <label className="label" htmlFor="prov-key">API Key / Token</label>
              <div className="input-with-button">
                <input
                  id="prov-key"
                  className="form-input mono"
                  type={showKey ? "text" : "password"}
                  placeholder="Enter your provider API key"
                  value={form.apiKey}
                  onChange={(e) => handleChange("apiKey", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn btn--ghost input-addon-btn"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  <span>{showKey ? "Hide" : "Show"}</span>
                </button>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label" htmlFor="prov-transport">Image Transport Format</label>
              <select
                id="prov-transport"
                className="form-input"
                value={form.imageTransport}
                onChange={(e) => handleChange("imageTransport", e.target.value as ImageTransport)}
              >
                <option value="multipart">Multipart Form-Data (Recommended)</option>
                <option value="base64_json">Base64 Data URI in JSON</option>
                <option value="binary">Raw Binary Image Stream</option>
              </select>
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label className="label" htmlFor="prov-imgfield">Image Field Name</label>
              <input
                id="prov-imgfield"
                className="form-input"
                type="text"
                placeholder="file or image"
                value={form.imageField}
                onChange={(e) => handleChange("imageField", e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label" htmlFor="prov-model">Model ID (Optional)</label>
              <input
                id="prov-model"
                className="form-input"
                type="text"
                placeholder="e.g. bitmind-v1"
                value={form.modelId}
                onChange={(e) => handleChange("modelId", e.target.value)}
              />
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label className="label" htmlFor="prov-modelfield">Model Field Name (in body/headers)</label>
              <input
                id="prov-modelfield"
                className="form-input"
                type="text"
                placeholder="model or X-Model-ID"
                value={form.modelField}
                onChange={(e) => handleChange("modelField", e.target.value)}
              />
            </div>
          </div>

          {/* Advanced Response Mapping Accordion */}
          <div className="accordion-section">
            <button
              type="button"
              className="accordion-toggle"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              aria-expanded={advancedOpen}
            >
              <span>{advancedOpen ? "▼" : "▶"} Advanced Response Mapping & Headers</span>
            </button>

            {advancedOpen && (
              <div className="accordion-content">
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label" htmlFor="path-isai">Boolean AI Path (JSON)</label>
                    <input
                      id="path-isai"
                      className="form-input mono"
                      type="text"
                      placeholder="isAI or data.is_fake"
                      value={form.isAIPath}
                      onChange={(e) => handleChange("isAIPath", e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label" htmlFor="path-label">Label Path (JSON)</label>
                    <input
                      id="path-label"
                      className="form-input mono"
                      type="text"
                      placeholder="label or prediction.label"
                      value={form.labelPath}
                      onChange={(e) => handleChange("labelPath", e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label" htmlFor="labels-ai">AI-indicating Labels</label>
                    <input
                      id="labels-ai"
                      className="form-input"
                      type="text"
                      placeholder="fake, ai, synthetic"
                      value={form.aiLabels}
                      onChange={(e) => handleChange("aiLabels", e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label" htmlFor="labels-real">Authentic-indicating Labels</label>
                    <input
                      id="labels-real"
                      className="form-input"
                      type="text"
                      placeholder="real, human, genuine"
                      value={form.realLabels}
                      onChange={(e) => handleChange("realLabels", e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label" htmlFor="path-conf">Confidence Path (JSON)</label>
                    <input
                      id="path-conf"
                      className="form-input mono"
                      type="text"
                      placeholder="confidence or score"
                      value={form.confidencePath}
                      onChange={(e) => handleChange("confidencePath", e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="label" htmlFor="path-exp">Explanation Path (JSON)</label>
                    <input
                      id="path-exp"
                      className="form-input mono"
                      type="text"
                      placeholder="explanation or reasoning"
                      value={form.explanationPath}
                      onChange={(e) => handleChange("explanationPath", e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label" htmlFor="extra-headers">Additional Request Headers (JSON)</label>
                  <textarea
                    id="extra-headers"
                    className="form-input mono"
                    rows={2}
                    placeholder='{"X-Client-ID": "custom-app"}'
                    value={form.additionalHeaders}
                    onChange={(e) => handleChange("additionalHeaders", e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(form.rememberKey)}
                onChange={(e) => handleChange("rememberKey", e.target.checked)}
              />
              <span>Remember configuration in this browser (localStorage)</span>
            </label>
            <span className="form-help">
              If unchecked, credentials persist only in this session/tab and are cleared when the tab closes.
            </span>
          </div>
        </div>

        <footer className="modal-card__foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleTest}
            disabled={testing || !form.endpoint}
          >
            <span>{testing ? "Testing..." : "Test Connection"}</span>
          </button>

          {config.endpoint && (
            <button
              type="button"
              className="link-btn"
              onClick={handleClear}
              style={{ color: "var(--fake)", marginLeft: 8 }}
            >
              Clear credentials
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              <span>Cancel</span>
            </button>
            <button type="button" className="btn" onClick={handleSave}>
              <span>Save Configuration</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
