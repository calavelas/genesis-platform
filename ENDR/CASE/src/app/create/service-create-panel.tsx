"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

interface TemplateOption {
  name: string;
  description?: string;
  path?: string;
  previewFiles?: string[];
  previewNote?: string;
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
  gatewayEnabled: boolean;
  dryRun?: boolean;
}

interface CreateServiceResult {
  serviceName: string;
  dryRun: boolean;
  stagingPath: string;
  generatedFiles: Array<{
    path: string;
    size: number;
    content?: string | null;
    contentEncoding?: string | null;
    contentTruncated?: boolean;
  }>;
  branchName?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
}

interface TransactionWorkflowRun {
  id: number;
  name: string;
  title: string;
  workflowPath: string;
  htmlUrl: string;
  event: string;
  status: string;
  conclusion: string | null;
  headBranch: string;
  headSha: string;
  runNumber: number;
  runAttempt: number;
  createdAt: string;
  updatedAt: string;
}

interface TransactionStatusResult {
  pullRequest: {
    number: number;
    title: string;
    htmlUrl: string;
    state: string;
    merged: boolean;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    mergedAt: string | null;
    mergeCommitSha: string | null;
    headRef: string;
    headSha: string;
    baseRef: string;
  };
  pipeline: {
    status: "pending" | "running" | "success" | "failed" | "waiting-merge";
    message: string;
    notifications: string[];
    runs: {
      prCheck: TransactionWorkflowRun | null;
      reconcileUpdate: TransactionWorkflowRun | null;
      svcsBuildDeploy: TransactionWorkflowRun | null;
    };
  };
}

interface PlexUniverseSnapshot {
  generatedAt: string;
  warnings: string[];
  services: Array<{
    name: string;
    syncStatus: string;
    healthStatus: string;
  }>;
}

interface TemplateFileResult {
  templateType: "service" | "gitops";
  templateName: string;
  filePath: string;
  size: number;
  content: string;
  contentEncoding?: string | null;
  truncated?: boolean;
}

interface FileViewerState {
  sourceLabel: string;
  path: string;
  size: number;
  content: string;
  contentEncoding?: string | null;
  truncated?: boolean;
}

type PipelineStageStatus = "pending" | "running" | "success" | "failed";

interface PipelineStageView {
  key: "pr-check" | "reconcile" | "svcs-build";
  label: string;
  status: PipelineStageStatus;
  detail: string;
  run: TransactionWorkflowRun | null;
}

const DNS_LABEL_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function buildServicePagePath(serviceName: string): string {
  return `/application-services/${encodeURIComponent(serviceName.trim())}`;
}

function buildLocalServicePageUrl(serviceName: string): string {
  return `http://localhost:3000${buildServicePagePath(serviceName)}`;
}

function buildServicePublicUrl(serviceName: string): string {
  return `https://${encodeURIComponent(serviceName.trim())}.calavelas.net`;
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

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function pipelineTone(status: TransactionStatusResult["pipeline"]["status"]): "good" | "warn" | "bad" | "neutral" {
  if (status === "success") {
    return "good";
  }
  if (status === "running" || status === "waiting-merge") {
    return "warn";
  }
  if (status === "failed") {
    return "bad";
  }
  return "neutral";
}

function formatPipelineStatus(status: TransactionStatusResult["pipeline"]["status"]): string {
  if (status === "waiting-merge") {
    return "Waiting Merge";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatWorkflowRunStatus(run: TransactionWorkflowRun | null): string {
  if (!run) {
    return "pending";
  }
  if (run.status !== "completed") {
    return run.status.replace(/_/g, " ");
  }
  if (run.conclusion === "success") {
    return "success";
  }
  return run.conclusion ? `failed (${run.conclusion})` : "failed";
}

function stageTone(status: PipelineStageStatus): "good" | "warn" | "bad" | "neutral" {
  if (status === "success") {
    return "good";
  }
  if (status === "running") {
    return "warn";
  }
  if (status === "failed") {
    return "bad";
  }
  return "neutral";
}

function formatStageStatus(status: PipelineStageStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function runStageFromWorkflow(run: TransactionWorkflowRun | null): PipelineStageStatus {
  if (!run) {
    return "pending";
  }
  if (run.status !== "completed") {
    return "running";
  }
  return run.conclusion === "success" ? "success" : "failed";
}

function buildPipelineStages(status: TransactionStatusResult): PipelineStageView[] {
  const prRun = status.pipeline.runs.prCheck;
  const prStage = runStageFromWorkflow(prRun);
  let prDetail = "Waiting for PR check workflow to start.";
  if (prStage === "running") {
    prDetail = "PR check workflow is running.";
  } else if (prStage === "success") {
    prDetail = "PR check workflow completed successfully.";
  } else if (prStage === "failed") {
    prDetail = `PR check workflow failed (${prRun?.conclusion || "unknown"}).`;
  }

  const reconcileRun = status.pipeline.runs.reconcileUpdate;
  let reconcileStage: PipelineStageStatus = "pending";
  let reconcileDetail = "Starts after PR merge.";
  if (status.pullRequest.merged) {
    reconcileStage = runStageFromWorkflow(reconcileRun);
    if (reconcileStage === "pending") {
      reconcileDetail = "Waiting for TARS reconcile/update workflow.";
    } else if (reconcileStage === "running") {
      reconcileDetail = "TARS reconcile/update workflow is running.";
    } else if (reconcileStage === "success") {
      reconcileDetail = "TARS reconcile/update workflow completed successfully.";
    } else {
      reconcileDetail = `TARS reconcile/update failed (${reconcileRun?.conclusion || "unknown"}).`;
    }
  }

  const svcsRun = status.pipeline.runs.svcsBuildDeploy;
  let svcsStage: PipelineStageStatus = "pending";
  let svcsDetail = "Starts after PR merge.";
  if (status.pullRequest.merged) {
    if (reconcileStage !== "success") {
      svcsStage = "pending";
      svcsDetail = "Waiting for reconcile success.";
    } else {
      svcsStage = runStageFromWorkflow(svcsRun);
      if (svcsStage === "pending") {
        svcsDetail = "Waiting for SVCS build/deploy workflow.";
      } else if (svcsStage === "running") {
        svcsDetail = "SVCS build/deploy workflow is running.";
      } else if (svcsStage === "success") {
        svcsDetail = "SVCS build/deploy workflow completed successfully.";
      } else {
        svcsDetail = `SVCS build/deploy failed (${svcsRun?.conclusion || "unknown"}).`;
      }
    }
  }

  return [
    {
      key: "pr-check",
      label: "PR Check",
      status: prStage,
      detail: prDetail,
      run: prRun
    },
    {
      key: "reconcile",
      label: "TARS Reconcile/Update",
      status: reconcileStage,
      detail: reconcileDetail,
      run: reconcileRun
    },
    {
      key: "svcs-build",
      label: "SVCS Build/Deploy",
      status: svcsStage,
      detail: svcsDetail,
      run: svcsRun
    }
  ];
}

function isSvcsBuildSuccessful(status: TransactionStatusResult | null): boolean {
  if (!status) {
    return false;
  }
  if (status.pipeline.status === "success") {
    return true;
  }
  const run = status.pipeline.runs.svcsBuildDeploy;
  if (!run) {
    return false;
  }
  return run.status === "completed" && run.conclusion === "success";
}

function hasServiceInUniverse(universe: PlexUniverseSnapshot, serviceName: string): boolean {
  const expected = serviceName.trim().toLowerCase();
  if (!expected) {
    return false;
  }
  return universe.services.some((service) => service.name.trim().toLowerCase() === expected);
}

function buildPreviewSignature(payload: CreateServicePayload): string {
  return JSON.stringify({
    serviceName: payload.serviceName.trim(),
    namespace: payload.namespace.trim(),
    environment: payload.environment.trim(),
    serviceTemplate: payload.serviceTemplate.trim(),
    gitopsTemplate: payload.gitopsTemplate.trim(),
    gatewayEnabled: payload.gatewayEnabled
  });
}

export function CreateServicePanel() {
  const resultSectionRef = useRef<HTMLElement | null>(null);
  const [options, setOptions] = useState<CreateOptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [namespace, setNamespace] = useState("");
  const [environment, setEnvironment] = useState("");
  const [serviceTemplate, setServiceTemplate] = useState("");
  const [gitopsTemplate, setGitopsTemplate] = useState("");
  const [gatewayEnabled, setGatewayEnabled] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [previewResult, setPreviewResult] = useState<CreateServiceResult | null>(null);
  const [lastPreviewSignature, setLastPreviewSignature] = useState<string | null>(null);
  const [fileViewer, setFileViewer] = useState<FileViewerState | null>(null);
  const [fileViewerLoading, setFileViewerLoading] = useState(false);
  const [fileViewerError, setFileViewerError] = useState("");
  const [templatePreviewCollapsed, setTemplatePreviewCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [fileViewerCollapsed, setFileViewerCollapsed] = useState(false);
  const [result, setResult] = useState<CreateServiceResult | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatusResult | null>(null);
  const [transactionStatusError, setTransactionStatusError] = useState("");
  const [catalogRefreshStatus, setCatalogRefreshStatus] = useState<"idle" | "refreshing" | "success" | "failed">("idle");
  const [catalogRefreshError, setCatalogRefreshError] = useState("");
  const [catalogRefreshNote, setCatalogRefreshNote] = useState("");
  const [catalogRefreshAttempts, setCatalogRefreshAttempts] = useState(0);
  const [serviceVisibleInCatalog, setServiceVisibleInCatalog] = useState(false);

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

  useEffect(() => {
    const prNumber = result?.pullRequestNumber;
    if (!prNumber) {
      setTransactionStatus(null);
      setTransactionStatusError("");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/plex/transactions/${prNumber}`, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok) {
          throw new Error(readErrorMessage(body));
        }
        if (!cancelled) {
          setTransactionStatus(body as TransactionStatusResult);
          setTransactionStatusError("");
        }
      } catch (error) {
        if (!cancelled) {
          const detail = error instanceof Error ? error.message : "unable to load transaction status";
          setTransactionStatusError(detail);
        }
      }
    };

    void pollStatus();
    timer = setInterval(() => {
      void pollStatus();
    }, 20_000);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [result?.pullRequestNumber]);

  useEffect(() => {
    setCatalogRefreshStatus("idle");
    setCatalogRefreshError("");
    setCatalogRefreshNote("");
    setCatalogRefreshAttempts(0);
    setServiceVisibleInCatalog(false);
  }, [result?.pullRequestNumber, result?.serviceName]);

  useEffect(() => {
    const service = result?.serviceName?.trim();
    if (
      !service ||
      !isSvcsBuildSuccessful(transactionStatus) ||
      serviceVisibleInCatalog ||
      catalogRefreshStatus === "refreshing" ||
      catalogRefreshStatus === "failed"
    ) {
      return;
    }

    let cancelled = false;
    const maxAttempts = 10;
    const intervalMs = 5_000;

    const refreshUniverseUntilVisible = async () => {
      setCatalogRefreshStatus("refreshing");
      setCatalogRefreshError("");

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (cancelled) {
          return;
        }
        setCatalogRefreshAttempts(attempt);
        setCatalogRefreshNote(`Refreshing service catalog (${attempt}/${maxAttempts})...`);

        try {
          const response = await fetch(`/api/plex?t=${Date.now()}`, { cache: "no-store" });
          const body = (await response.json().catch(() => ({}))) as unknown;
          if (!response.ok) {
            throw new Error(readErrorMessage(body));
          }

          const universe = body as PlexUniverseSnapshot;
          if (hasServiceInUniverse(universe, service)) {
            if (!cancelled) {
              setServiceVisibleInCatalog(true);
              setCatalogRefreshStatus("success");
              setCatalogRefreshError("");
              setCatalogRefreshNote(`Service visible in catalog (${new Date(universe.generatedAt).toLocaleString()}).`);
            }
            return;
          }
        } catch (error) {
          if (!cancelled) {
            const detail = error instanceof Error ? error.message : "unable to refresh service catalog";
            setCatalogRefreshError(detail);
          }
        }

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }

      if (!cancelled) {
        setCatalogRefreshStatus("failed");
        setCatalogRefreshNote("Service is not visible in catalog yet. Retry refresh after ArgoCD sync settles.");
      }
    };

    void refreshUniverseUntilVisible();
    return () => {
      cancelled = true;
    };
  }, [catalogRefreshStatus, result?.serviceName, serviceVisibleInCatalog, transactionStatus]);

  const selectedServiceTemplate = useMemo(
    () => options?.serviceTemplates.find((template) => template.name === serviceTemplate) ?? null,
    [options, serviceTemplate]
  );
  const selectedGitopsTemplate = useMemo(
    () => options?.gitopsTemplates.find((template) => template.name === gitopsTemplate) ?? null,
    [options, gitopsTemplate]
  );
  const currentPreviewSignature = useMemo(
    () =>
      JSON.stringify({
        serviceName: serviceName.trim(),
        namespace: namespace.trim(),
        environment: environment.trim(),
        serviceTemplate: serviceTemplate.trim(),
        gitopsTemplate: gitopsTemplate.trim(),
        gatewayEnabled
      }),
    [environment, gatewayEnabled, gitopsTemplate, namespace, serviceName, serviceTemplate]
  );
  const isPreviewCurrent = Boolean(previewResult && lastPreviewSignature && lastPreviewSignature === currentPreviewSignature);
  const pipelineStages = useMemo(
    () => (transactionStatus ? buildPipelineStages(transactionStatus) : []),
    [transactionStatus]
  );

  function buildPayloadFromForm(): CreateServicePayload | null {
    const normalizedServiceName = serviceName.trim();
    if (!normalizedServiceName) {
      setFormError("Service name is required.");
      return null;
    }
    if (normalizedServiceName.length > 48 || !DNS_LABEL_RE.test(normalizedServiceName)) {
      setFormError("Service name must match Kubernetes DNS label format.");
      return null;
    }
    if (!serviceTemplate) {
      setFormError("Service template is required.");
      return null;
    }
    if (!namespace) {
      setFormError("Namespace is required.");
      return null;
    }
    if (!environment) {
      setFormError("Environment is required.");
      return null;
    }
    if (!gitopsTemplate) {
      setFormError("GitOps template is required.");
      return null;
    }
    return {
      serviceName: normalizedServiceName,
      namespace,
      environment,
      serviceTemplate,
      gitopsTemplate,
      gatewayEnabled
    };
  }

  function onOpenGeneratedFile(file: CreateServiceResult["generatedFiles"][number]) {
    if (typeof file.content !== "string") {
      setFileViewerError(`Generated file content is unavailable: ${file.path}`);
      return;
    }
    setFileViewerError("");
    setFileViewerLoading(false);
    setFileViewer({
      sourceLabel: "Generated Output",
      path: file.path,
      size: file.size,
      content: file.content,
      contentEncoding: file.contentEncoding,
      truncated: file.contentTruncated
    });
  }

  async function onOpenTemplateFile(
    templateType: "service" | "gitops",
    templateName: string,
    filePath: string
  ) {
    const normalizedTemplateName = templateName.trim();
    const normalizedFilePath = filePath.trim();
    if (!normalizedTemplateName || !normalizedFilePath) {
      return;
    }

    setFileViewerLoading(true);
    setFileViewerError("");
    try {
      const params = new URLSearchParams({
        templateType,
        templateName: normalizedTemplateName,
        filePath: normalizedFilePath
      });
      const response = await fetch(`/api/plex/template-file?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readErrorMessage(body));
      }

      const file = body as TemplateFileResult;
      setFileViewer({
        sourceLabel: templateType === "service" ? "Service Template" : "GitOps Template",
        path: `${normalizedTemplateName}/${file.filePath}`,
        size: file.size,
        content: file.content,
        contentEncoding: file.contentEncoding,
        truncated: file.truncated
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unable to load template file";
      setFileViewerError(detail);
    } finally {
      setFileViewerLoading(false);
    }
  }

  async function onGeneratePreview() {
    setFormError("");
    setResult(null);
    setTransactionStatus(null);
    setTransactionStatusError("");
    setCatalogRefreshStatus("idle");
    setCatalogRefreshError("");
    setCatalogRefreshNote("");
    setCatalogRefreshAttempts(0);
    setServiceVisibleInCatalog(false);
    setLastPreviewSignature(null);
    setFileViewer(null);
    setFileViewerLoading(false);
    setFileViewerError("");

    const payload = buildPayloadFromForm();
    if (!payload) {
      return;
    }

    setPreviewing(true);
    try {
      const response = await fetch("/api/plex/services", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...payload,
          dryRun: true
        })
      });

      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new Error(readErrorMessage(body));
      }

      setPreviewResult(body as CreateServiceResult);
      setLastPreviewSignature(buildPreviewSignature(payload));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "preview failed";
      setFormError(detail);
    } finally {
      setPreviewing(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFormError("");
    setResult(null);
    setTransactionStatus(null);
    setTransactionStatusError("");
    setCatalogRefreshStatus("idle");
    setCatalogRefreshError("");
    setCatalogRefreshNote("");
    setCatalogRefreshAttempts(0);
    setServiceVisibleInCatalog(false);

    const payload = buildPayloadFromForm();
    if (!payload) {
      return;
    }
    const payloadSignature = buildPreviewSignature(payload);
    if (!previewResult || lastPreviewSignature !== payloadSignature) {
      setFormError("Generate Preview for current form values before creating service.");
      return;
    }

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
      resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setServiceName("");
      setPreviewResult(null);
      setLastPreviewSignature(null);
      setFileViewer(null);
      setFileViewerLoading(false);
      setFileViewerError("");
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
    <section className="create-layout">
      <section className="panel create-panel">
        <h2 className="section-header-brand">Create Service</h2>
        <p className="embed-note">
          This updates only <code>SVCS.yaml</code>; when gateway is enabled, the route is generated as{" "}
          <code>&lt;service&gt;.calavelas.net</code>.
        </p>

        <form className="create-form" onSubmit={onSubmit}>
          <div className="create-form-grid">
            <label className="field-span-2">
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

            <div className="field-span-2 create-template-preview-block">
              <div className="panel-header-row">
                <p className="create-template-preview-title">Template Preview</p>
                <button
                  type="button"
                  className="open-link compact subtle"
                  onClick={() => setTemplatePreviewCollapsed((value) => !value)}
                  aria-expanded={!templatePreviewCollapsed}
                >
                  {templatePreviewCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>

              {templatePreviewCollapsed ? (
                <p className="embed-note">Template preview is collapsed.</p>
              ) : (
                <section className="create-template-preview">
                  <article className="create-template-card">
                    <h3>Service Template Preview</h3>
                    <p className="embed-note">
                      <strong>{selectedServiceTemplate?.name ?? "n/a"}</strong>
                    </p>
                    {selectedServiceTemplate?.description && <p className="embed-note">{selectedServiceTemplate.description}</p>}
                    {selectedServiceTemplate?.path && (
                      <p className="embed-note">
                        Path: <code>{selectedServiceTemplate.path}</code>
                      </p>
                    )}
                    <ul className="template-file-list">
                      {(selectedServiceTemplate?.previewFiles ?? []).map((file) => (
                        <li key={`service-${file}`} className="template-file-item">
                          <div className="template-file-row">
                            <code>{file}</code>
                            <button
                              type="button"
                              className="open-link compact subtle"
                              onClick={() => void onOpenTemplateFile("service", selectedServiceTemplate?.name ?? "", file)}
                              disabled={fileViewerLoading}
                            >
                              View
                            </button>
                          </div>
                        </li>
                      ))}
                      {(selectedServiceTemplate?.previewFiles ?? []).length === 0 && <li>no template files found</li>}
                    </ul>
                    {selectedServiceTemplate?.previewNote && <p className="embed-note">{selectedServiceTemplate.previewNote}</p>}
                  </article>

                  <article className="create-template-card">
                    <h3>GitOps Template Preview</h3>
                    <p className="embed-note">
                      <strong>{selectedGitopsTemplate?.name ?? "n/a"}</strong>
                    </p>
                    {selectedGitopsTemplate?.description && <p className="embed-note">{selectedGitopsTemplate.description}</p>}
                    {selectedGitopsTemplate?.path && (
                      <p className="embed-note">
                        Path: <code>{selectedGitopsTemplate.path}</code>
                      </p>
                    )}
                    <ul className="template-file-list">
                      {(selectedGitopsTemplate?.previewFiles ?? []).map((file) => (
                        <li key={`gitops-${file}`} className="template-file-item">
                          <div className="template-file-row">
                            <code>{file}</code>
                            <button
                              type="button"
                              className="open-link compact subtle"
                              onClick={() => void onOpenTemplateFile("gitops", selectedGitopsTemplate?.name ?? "", file)}
                              disabled={fileViewerLoading}
                            >
                              View
                            </button>
                          </div>
                        </li>
                      ))}
                      {(selectedGitopsTemplate?.previewFiles ?? []).length === 0 && <li>no template files found</li>}
                    </ul>
                    {selectedGitopsTemplate?.previewNote && <p className="embed-note">{selectedGitopsTemplate.previewNote}</p>}
                  </article>
                </section>
              )}
            </div>

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

            <div className="field-span-2 create-toggle">
              <label className="create-toggle-row">
                <input
                  type="checkbox"
                  checked={gatewayEnabled}
                  onChange={(event) => setGatewayEnabled(event.target.checked)}
                />
                <span>Enable Gateway</span>
              </label>
              <p className="create-toggle-help">
                Expose this service through Gateway API at <code>https://&lt;service&gt;.calavelas.net</code>.
              </p>
            </div>
          </div>

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="form-actions">
            <button type="button" className="open-link subtle" onClick={onGeneratePreview} disabled={previewing || submitting}>
              {previewing ? "Generating..." : "Generate Preview"}
            </button>
            <button type="submit" className="open-link" disabled={submitting || previewing || !isPreviewCurrent}>
              {submitting ? "Submitting..." : "Create Service"}
            </button>
          </div>
          {!isPreviewCurrent && (
            <p className="embed-note">Generate Preview with current values before creating the service.</p>
          )}
        </form>
      </section>

      <section className="panel create-side" aria-live="polite">
        <div className="panel-header-row">
          <h2 className="section-header-brand">Generate Preview</h2>
          <button
            type="button"
            className="open-link compact subtle"
            onClick={() => setPreviewCollapsed((value) => !value)}
            aria-expanded={!previewCollapsed}
          >
            {previewCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
        {previewCollapsed ? (
          <section className="create-result create-result-placeholder">
            <h3>Preview Collapsed</h3>
            <p className="embed-note">
              {previewResult
                ? `${previewResult.generatedFiles.length} generated files ready.`
                : "Run Generate Preview to inspect generated output and template files."}
            </p>
          </section>
        ) : (
          <>
            {previewResult ? (
              <section className="create-result">
                <h3>Generated Output</h3>
                <p className="embed-note">
                  <strong>{previewResult.generatedFiles.length}</strong> files will be generated from selected templates.
                </p>
                <ul className="create-preview-list">
                  {previewResult.generatedFiles.map((file) => (
                    <li key={file.path} className="create-preview-item">
                      <div className="create-preview-file-row">
                        <code>{file.path}</code>
                        <span>{file.size} bytes</span>
                        {typeof file.content === "string" ? (
                          <button
                            type="button"
                            className="open-link compact subtle"
                            onClick={() => onOpenGeneratedFile(file)}
                          >
                            View
                          </button>
                        ) : (
                          <span className="embed-note">preview unavailable</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <section className="create-result create-result-placeholder">
                <h3>Generated Output</h3>
                <p className="embed-note">Click <strong>Generate Preview</strong> to inspect files before creating the service.</p>
              </section>
            )}
          </>
        )}
      </section>

      <section className="panel file-viewer-panel" aria-live="polite">
        <div className="panel-header-row">
          <h2 className="section-header-brand">File Viewer</h2>
          <button
            type="button"
            className="open-link compact subtle"
            onClick={() => setFileViewerCollapsed((value) => !value)}
            aria-expanded={!fileViewerCollapsed}
          >
            {fileViewerCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
        {fileViewerCollapsed ? (
          <section className="create-result create-result-placeholder">
            <h3>Viewer Collapsed</h3>
            <p className="embed-note">
              {fileViewer ? (
                <>
                  Selected file: <code>{fileViewer.path}</code>
                </>
              ) : (
                <>Use <strong>View</strong> from Template Preview or Generated Output to inspect file content here.</>
              )}
            </p>
          </section>
        ) : fileViewerLoading ? (
          <section className="create-result create-result-placeholder">
            <h3>Loading File</h3>
            <p className="embed-note">Fetching selected file content...</p>
          </section>
        ) : fileViewerError ? (
          <section className="create-result create-result-placeholder">
            <h3>File Load Error</h3>
            <p className="form-error" role="alert">
              {fileViewerError}
            </p>
          </section>
        ) : fileViewer ? (
          <section className="create-result">
            <h3>{fileViewer.sourceLabel}</h3>
            <p className="embed-note">
              <code>{fileViewer.path}</code> • {fileViewer.size} bytes
            </p>
            <pre className="file-viewer-content">
              <code>{fileViewer.content}</code>
            </pre>
            {fileViewer.truncated && (
              <p className="embed-note">Preview truncated to first 128 KB.</p>
            )}
          </section>
        ) : (
          <section className="create-result create-result-placeholder">
            <h3>No File Selected</h3>
            <p className="embed-note">Use <strong>View</strong> from Template Preview or Generated Output to inspect file content here.</p>
          </section>
        )}
      </section>

      <section ref={resultSectionRef} className="panel transaction-panel" aria-live="polite">
        <h2 className="section-header-brand">Result</h2>
        <p className="embed-note">After submit, CASE opens a branch and PR to append your service config in <code>SVCS.yaml</code>.</p>

        {result ? (
          <section className="create-result">
            <h3>Result</h3>
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
                <dt>Service Page</dt>
                <dd>
                  {serviceVisibleInCatalog ? (
                    <a
                      className="entity-link"
                      href={buildLocalServicePageUrl(result.serviceName)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {buildLocalServicePageUrl(result.serviceName)}
                    </a>
                  ) : isSvcsBuildSuccessful(transactionStatus) ? (
                    <>waiting for catalog refresh...</>
                  ) : (
                    <>available after SVCS Build/Deploy succeeds</>
                  )}
                </dd>
              </div>
              <div>
                <dt>Service URL</dt>
                <dd>
                  <a
                    className="entity-link"
                    href={buildServicePublicUrl(result.serviceName)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {buildServicePublicUrl(result.serviceName)}
                  </a>
                </dd>
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
              <div>
                <dt>PR Status</dt>
                <dd>{transactionStatus ? (transactionStatus.pullRequest.merged ? "merged" : transactionStatus.pullRequest.state) : "loading..."}</dd>
              </div>
              <div>
                <dt>Pipeline</dt>
                <dd>
                  {transactionStatus ? (
                    <span className={`status-pill tone-${pipelineTone(transactionStatus.pipeline.status)}`}>
                      {formatPipelineStatus(transactionStatus.pipeline.status)}
                    </span>
                  ) : (
                    "loading..."
                  )}
                </dd>
              </div>
            </dl>

            {transactionStatus && (
              <section className="transaction-live">
                <p className="embed-note">{transactionStatus.pipeline.message}</p>
                {isSvcsBuildSuccessful(transactionStatus) && (
                  <p className="embed-note">
                    {catalogRefreshStatus === "refreshing" && catalogRefreshNote}
                    {catalogRefreshStatus === "success" && catalogRefreshNote}
                    {catalogRefreshStatus === "failed" && (catalogRefreshNote || "Service catalog refresh did not complete yet.")}
                    {catalogRefreshStatus === "idle" && "Waiting to refresh service catalog."}
                    {catalogRefreshAttempts > 0 && catalogRefreshStatus === "refreshing" && ` Attempts: ${catalogRefreshAttempts}.`}
                  </p>
                )}
                {catalogRefreshError && (
                  <p className="form-error" role="alert">
                    {catalogRefreshError}
                  </p>
                )}
                {catalogRefreshStatus === "failed" && (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="open-link compact subtle"
                      onClick={() => {
                        setCatalogRefreshStatus("idle");
                        setCatalogRefreshError("");
                        setCatalogRefreshNote("");
                        setCatalogRefreshAttempts(0);
                      }}
                    >
                      Retry Catalog Refresh
                    </button>
                  </div>
                )}
                {transactionStatus.pipeline.notifications.length > 0 && (
                  <ul className="transaction-notifications">
                    {transactionStatus.pipeline.notifications.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
                <div className="pipeline-stages" role="list" aria-label="pipeline-stages">
                  {pipelineStages.map((stage) => {
                    const runTimestamp = stage.run?.updatedAt || stage.run?.createdAt || null;
                    return (
                      <article key={stage.key} className="pipeline-stage-item" role="listitem">
                        <div className="pipeline-stage-header">
                          <strong>{stage.label}</strong>
                          <span className={`status-pill tone-${stageTone(stage.status)}`}>{formatStageStatus(stage.status)}</span>
                        </div>
                        <p className="embed-note">{stage.detail}</p>
                        <div className="pipeline-stage-meta">
                          {stage.run?.htmlUrl ? (
                            <a className="entity-link" href={stage.run.htmlUrl} target="_blank" rel="noreferrer">
                              {formatWorkflowRunStatus(stage.run)}
                            </a>
                          ) : (
                            <span className="embed-note">run link available after workflow starts</span>
                          )}
                          <span className="embed-note">{runTimestamp ? formatTimestamp(runTimestamp) : "not started"}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {transactionStatusError && (
              <p className="form-error" role="alert">
                {transactionStatusError}
              </p>
            )}
          </section>
        ) : (
          <section className="create-result create-result-placeholder">
            <h3>Result</h3>
            <p className="embed-note">Submit the form to view the branch, PR link, and service endpoints.</p>
          </section>
        )}
      </section>
    </section>
  );
}
