"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

interface TemplateRef {
  name: string;
  type?: string;
  description?: string;
  path: string;
}

interface IDPConfigResponse {
  idpConfig: {
    templates: {
      service: TemplateRef[];
      gitops: TemplateRef[];
    };
    config: {
      activeCluster: string;
      clusters: Record<string, { name: string }>;
    };
  };
  servicesConfig: {
    services: Array<{ name: string }>;
  };
}

interface CreateServicePayload {
  name: string;
  image?: string;
  port: number;
  namespace: string;
  deployTo: string[];
  ingressEnabled: boolean;
  ingressHost?: string;
  serviceTemplate: string;
  gitopsTemplate: string;
  dryRun: boolean;
  branchName?: string;
}

interface GeneratedFile {
  path: string;
  size: number;
}

interface CreateServiceResult {
  serviceName: string;
  dryRun: boolean;
  stagingPath: string;
  generatedFiles: GeneratedFile[];
  branchName?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
}

type TransactionStatus = "pending" | "success" | "error";
type ActiveTab = "form" | "transactions";

interface TransactionRecord {
  id: string;
  createdAt: string;
  status: TransactionStatus;
  request: CreateServicePayload;
  response?: CreateServiceResult;
  error?: string;
}

interface ServiceFormState {
  serviceName: string;
  namespace: string;
  image: string;
  port: string;
  serviceTemplate: string;
  gitopsTemplate: string;
  ingressEnabled: boolean;
  ingressHost: string;
  branchName: string;
  deployTo: string[];
}

const TX_STORAGE_KEY = "case.service-transactions.v1";
const DNS_LABEL_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function defaultFormState(): ServiceFormState {
  return {
    serviceName: "",
    namespace: "demo",
    image: "",
    port: "8080",
    serviceTemplate: "",
    gitopsTemplate: "",
    ingressEnabled: true,
    ingressHost: "",
    branchName: "",
    deployTo: []
  };
}

function formatTransactionTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function createTransactionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readErrorMessage(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    return JSON.stringify(detail);
  }

  return "request failed";
}

function mergeDefaults(
  current: ServiceFormState,
  config: IDPConfigResponse | null
): ServiceFormState {
  if (!config) {
    return current;
  }

  const serviceTemplates = config.idpConfig.templates.service;
  const gitopsTemplates = config.idpConfig.templates.gitops;
  const clusterAliases = Object.keys(config.idpConfig.config.clusters);
  const defaultCluster = config.idpConfig.config.activeCluster;

  return {
    ...current,
    serviceTemplate: current.serviceTemplate || serviceTemplates[0]?.name || "",
    gitopsTemplate: current.gitopsTemplate || gitopsTemplates[0]?.name || "",
    deployTo:
      current.deployTo.length > 0
        ? current.deployTo
        : defaultCluster
          ? [defaultCluster]
          : clusterAliases.slice(0, 1)
  };
}

function transactionTone(status: TransactionStatus): "good" | "warn" | "bad" {
  if (status === "success") {
    return "good";
  }
  if (status === "pending") {
    return "warn";
  }
  return "bad";
}

export function ServiceCreatePanel() {
  const [config, setConfig] = useState<IDPConfigResponse | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState("");
  const [formState, setFormState] = useState<ServiceFormState>(defaultFormState);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("form");
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TX_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as TransactionRecord[];
      if (Array.isArray(parsed)) {
        setTransactions(parsed);
      }
    } catch {
      setTransactions([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    let canceled = false;
    setConfigLoading(true);
    setConfigError("");

    fetch("/api/idp/config", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok) {
          throw new Error(readErrorMessage(body));
        }
        if (!canceled) {
          const typed = body as IDPConfigResponse;
          setConfig(typed);
          setFormState((current) => mergeDefaults(current, typed));
        }
      })
      .catch((error) => {
        if (!canceled) {
          const detail = error instanceof Error ? error.message : "unable to load IDP config";
          setConfigError(detail);
        }
      })
      .finally(() => {
        if (!canceled) {
          setConfigLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, []);

  const serviceTemplates = config?.idpConfig.templates.service ?? [];
  const gitopsTemplates = config?.idpConfig.templates.gitops ?? [];
  const clusterAliases = useMemo(
    () => Object.keys(config?.idpConfig.config.clusters ?? {}),
    [config]
  );
  const knownServices = useMemo(() => {
    return new Set((config?.servicesConfig.services ?? []).map((service) => service.name.toLowerCase()));
  }, [config]);

  const hostnamePreview = useMemo(() => {
    if (formState.ingressHost.trim()) {
      return formState.ingressHost.trim();
    }
    if (formState.serviceName.trim()) {
      return `${formState.serviceName.trim()}.svcs.calavelas.net`;
    }
    return "servicename.svcs.calavelas.net";
  }, [formState.ingressHost, formState.serviceName]);

  function setField<K extends keyof ServiceFormState>(field: K, value: ServiceFormState[K]) {
    setFormState((current) => ({
      ...current,
      [field]: value
    }));
  }

  function toggleDeployTarget(alias: string) {
    setFormState((current) => {
      const selected = current.deployTo.includes(alias);
      if (selected) {
        return {
          ...current,
          deployTo: current.deployTo.filter((item) => item !== alias)
        };
      }
      return {
        ...current,
        deployTo: [...current.deployTo, alias]
      };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const serviceName = formState.serviceName.trim();
    if (!serviceName) {
      setFormError("Service name is required.");
      return;
    }
    if (serviceName.length > 48 || !DNS_LABEL_RE.test(serviceName)) {
      setFormError("Service name must match Kubernetes DNS label format.");
      return;
    }
    if (knownServices.has(serviceName.toLowerCase())) {
      setFormError(`Service '${serviceName}' already exists in SVCS.yaml.`);
      return;
    }

    const parsedPort = Number.parseInt(formState.port, 10);
    if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setFormError("Port must be between 1 and 65535.");
      return;
    }

    if (!formState.serviceTemplate) {
      setFormError("Service template is required.");
      return;
    }
    if (!formState.gitopsTemplate) {
      setFormError("GitOps template is required.");
      return;
    }
    if (formState.deployTo.length === 0) {
      setFormError("Select at least one deploy target.");
      return;
    }

    const payload: CreateServicePayload = {
      name: serviceName,
      namespace: formState.namespace.trim() || "demo",
      port: parsedPort,
      deployTo: formState.deployTo,
      ingressEnabled: formState.ingressEnabled,
      serviceTemplate: formState.serviceTemplate,
      gitopsTemplate: formState.gitopsTemplate,
      dryRun: false
    };

    if (formState.image.trim()) {
      payload.image = formState.image.trim();
    }
    if (formState.ingressHost.trim()) {
      payload.ingressHost = formState.ingressHost.trim();
    }
    if (formState.branchName.trim()) {
      payload.branchName = formState.branchName.trim();
    }

    const txId = createTransactionId();
    const createdAt = new Date().toISOString();

    setTransactions((current) => [
      {
        id: txId,
        createdAt,
        status: "pending",
        request: payload
      },
      ...current
    ]);
    setActiveTab("transactions");
    setSubmitting(true);

    try {
      const response = await fetch("/api/idp/services", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readErrorMessage(body));
      }

      const result = body as CreateServiceResult;
      setTransactions((current) =>
        current.map((tx) =>
          tx.id === txId
            ? {
                ...tx,
                status: "success",
                response: result
              }
            : tx
        )
      );

      setFormState((current) => ({
        ...current,
        serviceName: "",
        image: "",
        ingressHost: "",
        branchName: ""
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "submission failed";
      setTransactions((current) =>
        current.map((tx) =>
          tx.id === txId
            ? {
                ...tx,
                status: "error",
                error: message
              }
            : tx
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel service-create-panel">
      <div className="panel-heading">
        <h2>Create Service</h2>
        <span className="chip muted">Scaffold + PR</span>
      </div>

      <div className="tab-row" role="tablist" aria-label="service-create-tabs">
        <button
          type="button"
          className={`tab-button ${activeTab === "form" ? "active" : ""}`}
          onClick={() => setActiveTab("form")}
          role="tab"
          aria-selected={activeTab === "form"}
        >
          Form
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "transactions" ? "active" : ""}`}
          onClick={() => setActiveTab("transactions")}
          role="tab"
          aria-selected={activeTab === "transactions"}
        >
          Transactions ({transactions.length})
        </button>
      </div>

      {activeTab === "form" && (
        <>
          {configLoading && <p className="embed-note">Loading templates from ENDR.yaml...</p>}
          {configError && (
            <p className="form-error" role="alert">
              {configError}
            </p>
          )}

          {!configLoading && !configError && (
            <form className="service-form" onSubmit={submit}>
              <label>
                Service Name
                <input
                  type="text"
                  value={formState.serviceName}
                  onChange={(event) => setField("serviceName", event.target.value)}
                  placeholder="cooper"
                  autoComplete="off"
                  required
                />
              </label>

              <label>
                Namespace
                <input
                  type="text"
                  value={formState.namespace}
                  onChange={(event) => setField("namespace", event.target.value)}
                  placeholder="demo"
                  autoComplete="off"
                />
              </label>

              <label>
                Image (Optional)
                <input
                  type="text"
                  value={formState.image}
                  onChange={(event) => setField("image", event.target.value)}
                  placeholder="calavelas/cooper:git-abcd123"
                  autoComplete="off"
                />
              </label>

              <label>
                Port
                <input
                  type="number"
                  value={formState.port}
                  min={1}
                  max={65535}
                  onChange={(event) => setField("port", event.target.value)}
                />
              </label>

              <label>
                Service Template
                <select
                  value={formState.serviceTemplate}
                  onChange={(event) => setField("serviceTemplate", event.target.value)}
                  required
                >
                  {serviceTemplates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                GitOps Template
                <select
                  value={formState.gitopsTemplate}
                  onChange={(event) => setField("gitopsTemplate", event.target.value)}
                  required
                >
                  {gitopsTemplates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="field-group">
                <legend>Deploy To</legend>
                <div className="check-grid">
                  {clusterAliases.map((alias) => (
                    <label key={alias} className="check-item">
                      <input
                        type="checkbox"
                        checked={formState.deployTo.includes(alias)}
                        onChange={() => toggleDeployTarget(alias)}
                      />
                      <span>{alias}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="check-item">
                <input
                  type="checkbox"
                  checked={formState.ingressEnabled}
                  onChange={(event) => setField("ingressEnabled", event.target.checked)}
                />
                <span>Enable HTTPRoute ingress</span>
              </label>

              <label>
                Ingress Host (Optional)
                <input
                  type="text"
                  value={formState.ingressHost}
                  onChange={(event) => setField("ingressHost", event.target.value)}
                  placeholder={hostnamePreview}
                  autoComplete="off"
                />
              </label>

              <label>
                Branch Name (Optional)
                <input
                  type="text"
                  value={formState.branchName}
                  onChange={(event) => setField("branchName", event.target.value)}
                  placeholder="idp/cooper-20260303180000"
                  autoComplete="off"
                />
              </label>

              <p className="embed-note">
                Default hostname will be <code>{hostnamePreview}</code>. Submit will fetch latest <code>SVCS.yaml</code>, update
                it, and open a PR.
              </p>

              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="form-actions">
                <button type="submit" className="open-link" disabled={submitting}>
                  {submitting ? "Submitting..." : "Create PR"}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {activeTab === "transactions" && (
        <section className="transaction-list">
          {transactions.length === 0 && <p className="embed-note">No transactions yet.</p>}

          {transactions.map((tx) => (
            <article key={tx.id} className="transaction-card">
              <header>
                <strong>{tx.request.name}</strong>
                <span className={`status-pill tone-${transactionTone(tx.status)}`}>{tx.status}</span>
              </header>
              <p className="embed-note">{formatTransactionTime(tx.createdAt)}</p>

              <dl className="kv-list transaction-kv">
                <div>
                  <dt>Namespace</dt>
                  <dd>{tx.request.namespace}</dd>
                </div>
                <div>
                  <dt>Templates</dt>
                  <dd>
                    {tx.request.serviceTemplate} / {tx.request.gitopsTemplate}
                  </dd>
                </div>
                <div>
                  <dt>DeployTo</dt>
                  <dd>{tx.request.deployTo.join(", ")}</dd>
                </div>
                <div>
                  <dt>Host</dt>
                  <dd>{tx.request.ingressHost || `${tx.request.name}.svcs.calavelas.net`}</dd>
                </div>
                {tx.response?.pullRequestUrl && (
                  <div>
                    <dt>PR</dt>
                    <dd>
                      <a className="entity-link" href={tx.response.pullRequestUrl} target="_blank" rel="noreferrer">
                        {tx.response.pullRequestUrl}
                      </a>
                    </dd>
                  </div>
                )}
                {tx.response?.branchName && (
                  <div>
                    <dt>Branch</dt>
                    <dd>
                      <code>{tx.response.branchName}</code>
                    </dd>
                  </div>
                )}
                {tx.response && (
                  <div>
                    <dt>Generated</dt>
                    <dd>{tx.response.generatedFiles.length} files</dd>
                  </div>
                )}
              </dl>

              {tx.error && (
                <p className="form-error" role="alert">
                  {tx.error}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
