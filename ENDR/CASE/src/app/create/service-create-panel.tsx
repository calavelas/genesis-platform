"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

interface TemplateOption {
  name: string;
  description?: string;
}

interface CreateOptionsResponse {
  serviceTemplates: TemplateOption[];
  gitopsTemplates: TemplateOption[];
  namespaces: TemplateOption[];
  kubernetesEnvironments: TemplateOption[];
  existingServices: string[];
}

interface CreateServicePayload {
  serviceName: string;
  namespace: string;
  environment: string;
  serviceTemplate: string;
  gitopsTemplate: string;
}

interface CreateServiceResult {
  serviceName: string;
  dryRun: boolean;
  stagingPath: string;
  generatedFiles: Array<{ path: string; size: number }>;
  branchName?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
}

const DNS_LABEL_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

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

export function CreateServicePanel() {
  const [options, setOptions] = useState<CreateOptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [namespace, setNamespace] = useState("");
  const [environment, setEnvironment] = useState("");
  const [serviceTemplate, setServiceTemplate] = useState("");
  const [gitopsTemplate, setGitopsTemplate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [result, setResult] = useState<CreateServiceResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/plex/templates", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok) {
          throw new Error(readErrorMessage(body));
        }

        if (!cancelled) {
          const value = body as CreateOptionsResponse;
          setOptions(value);
          setNamespace(value.namespaces[0]?.name ?? "");
          setEnvironment(value.kubernetesEnvironments[0]?.name ?? "");
          setServiceTemplate(value.serviceTemplates[0]?.name ?? "");
          setGitopsTemplate(value.gitopsTemplates[0]?.name ?? "");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const detail = error instanceof Error ? error.message : "unable to load templates";
          setLoadError(detail);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const existingServices = useMemo(() => {
    return new Set((options?.existingServices ?? []).map((name) => name.toLowerCase()));
  }, [options]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setResult(null);

    const normalizedServiceName = serviceName.trim();
    if (!normalizedServiceName) {
      setFormError("Service name is required.");
      return;
    }
    if (normalizedServiceName.length > 48 || !DNS_LABEL_RE.test(normalizedServiceName)) {
      setFormError("Service name must match Kubernetes DNS label format.");
      return;
    }
    if (existingServices.has(normalizedServiceName.toLowerCase())) {
      setFormError(`Service '${normalizedServiceName}' already exists.`);
      return;
    }
    if (!serviceTemplate) {
      setFormError("Service template is required.");
      return;
    }
    if (!namespace) {
      setFormError("Namespace is required.");
      return;
    }
    if (!environment) {
      setFormError("Environment is required.");
      return;
    }
    if (!gitopsTemplate) {
      setFormError("GitOps template is required.");
      return;
    }

    const payload: CreateServicePayload = {
      serviceName: normalizedServiceName,
      namespace,
      environment,
      serviceTemplate,
      gitopsTemplate
    };

    setSubmitting(true);
    try {
      const response = await fetch("/api/plex/services", {
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

      const created = body as CreateServiceResult;
      setResult(created);
      setServiceName("");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "submit failed";
      setFormError(detail);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="panel create-panel">
        <p className="embed-note">Loading template options...</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="panel create-panel">
        <p className="form-error" role="alert">
          {loadError}
        </p>
      </section>
    );
  }

  return (
    <section className="panel create-panel">
      <h2>Create Service</h2>
      <p className="embed-note">
        This updates only <code>SVCS.yaml</code>; gateway hostname is always generated as <code>&lt;service&gt;.svcs.calavelas.net</code>.
      </p>

      <form className="create-form" onSubmit={onSubmit}>
        <label>
          Service Name
          <input
            type="text"
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            placeholder="cooper"
            autoComplete="off"
            required
          />
        </label>

        <label>
          Service Template
          <select value={serviceTemplate} onChange={(event) => setServiceTemplate(event.target.value)} required>
            {options?.serviceTemplates.map((template) => (
              <option key={template.name} value={template.name}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          GitOps Template
          <select value={gitopsTemplate} onChange={(event) => setGitopsTemplate(event.target.value)} required>
            {options?.gitopsTemplates.map((template) => (
              <option key={template.name} value={template.name}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Namespace
          <select value={namespace} onChange={(event) => setNamespace(event.target.value)} required>
            {options?.namespaces.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Environment (Kubernetes)
          <select value={environment} onChange={(event) => setEnvironment(event.target.value)} required>
            {options?.kubernetesEnvironments.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="form-actions">
          <button type="submit" className="open-link" disabled={submitting}>
            {submitting ? "Submitting..." : "Create Service"}
          </button>
        </div>
      </form>

      {result && (
        <section className="create-result" aria-live="polite">
          <h3>Transaction Result</h3>
          <dl className="kv-list">
            <div>
              <dt>Service</dt>
              <dd>{result.serviceName}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>
                <code>{result.branchName ?? "n/a"}</code>
              </dd>
            </div>
            <div>
              <dt>Generated Files</dt>
              <dd>{result.generatedFiles.length}</dd>
            </div>
            <div>
              <dt>Pull Request</dt>
              <dd>
                {result.pullRequestUrl ? (
                  <a className="entity-link" href={result.pullRequestUrl} target="_blank" rel="noreferrer">
                    {result.pullRequestUrl}
                  </a>
                ) : (
                  "n/a"
                )}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </section>
  );
}
