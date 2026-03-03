"use client";

import { useEffect, useMemo, useState } from "react";

interface CaseHistoryItem {
  number: number;
  title: string;
  serviceName: string;
  htmlUrl: string;
  state: string;
  merged: boolean;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  headRef: string;
  headSha: string;
  baseRef: string;
  author: string;
}

interface CaseHistoryResponse {
  sourceRepo: string;
  titlePrefix: string;
  serviceFilter: string | null;
  count: number;
  items: CaseHistoryItem[];
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

interface TransactionTimelineEvent {
  id: string;
  title: string;
  status: string;
  timestamp: string | null;
  detail: string;
  url: string | null;
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
  timeline: TransactionTimelineEvent[];
  persistedAt?: string | null;
}

interface ServiceHistoryPanelProps {
  serviceName: string;
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

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function prTone(item: CaseHistoryItem): "good" | "warn" | "neutral" {
  if (item.merged) {
    return "good";
  }
  if (item.state === "open") {
    return "warn";
  }
  return "neutral";
}

function prLabel(item: CaseHistoryItem): string {
  if (item.merged) {
    return "merged";
  }
  if (item.draft && item.state === "open") {
    return "draft";
  }
  return item.state || "unknown";
}

function pipelineTone(status: string): "good" | "warn" | "bad" | "neutral" {
  const normalized = status.trim().toLowerCase();
  if (normalized === "success") {
    return "good";
  }
  if (normalized === "running" || normalized === "waiting-merge") {
    return "warn";
  }
  if (normalized === "failed") {
    return "bad";
  }
  return "neutral";
}

function formatPipelineStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "waiting-merge") {
    return "Waiting Merge";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatWorkflowRunStatus(run: TransactionWorkflowRun | null): string {
  if (!run) {
    return "not started";
  }
  if (run.status !== "completed") {
    return run.status;
  }
  return run.conclusion ? `completed (${run.conclusion})` : "completed";
}

export function ServiceHistoryPanel({ serviceName }: ServiceHistoryPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<CaseHistoryResponse | null>(null);
  const [transactionMap, setTransactionMap] = useState<Record<number, TransactionStatusResult>>({});
  const [transactionError, setTransactionError] = useState("");

  const items = history?.items ?? [];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setHistory(null);
    setTransactionMap({});
    setTransactionError("");

    const params = new URLSearchParams({
      limit: "50",
      service: serviceName
    });

    fetch(`/api/plex/history?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok) {
          throw new Error(readErrorMessage(body));
        }
        if (!cancelled) {
          setHistory(body as CaseHistoryResponse);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const detail = err instanceof Error ? err.message : "unable to load CASE history";
          setError(detail);
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
  }, [serviceName]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const statusesToQuery = items.slice(0, 12);

    const loadTransactions = async () => {
      try {
        const responses = await Promise.all(
          statusesToQuery.map(async (item) => {
            const response = await fetch(`/api/plex/transactions/${item.number}`, { cache: "no-store" });
            const body = (await response.json().catch(() => ({}))) as unknown;
            if (!response.ok) {
              throw new Error(`#${item.number}: ${readErrorMessage(body)}`);
            }
            return { number: item.number, status: body as TransactionStatusResult };
          })
        );

        if (!cancelled) {
          const nextMap: Record<number, TransactionStatusResult> = {};
          for (const entry of responses) {
            nextMap[entry.number] = entry.status;
          }
          setTransactionMap(nextMap);
          setTransactionError("");
        }
      } catch (err) {
        if (!cancelled) {
          const detail = err instanceof Error ? err.message : "unable to load transaction status";
          setTransactionError(detail);
        }
      }
    };

    void loadTransactions();

    if (items.some((item) => item.state === "open")) {
      timer = setInterval(() => {
        void loadTransactions();
      }, 20_000);
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [items]);

  const latest = items[0] ?? null;
  const latestTransaction = latest ? transactionMap[latest.number] : null;
  const hasServiceMismatch = useMemo(
    () => items.some((item) => normalize(item.serviceName) !== normalize(serviceName)),
    [items, serviceName]
  );

  if (loading) {
    return (
      <section className="panel">
        <p className="embed-note">Loading service history...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <p className="form-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!latest) {
    return (
      <section className="panel">
        <p className="embed-note">No create service history found for service <code>{serviceName}</code>.</p>
      </section>
    );
  }

  return (
    <>
      <section className="detail-grid" aria-label="service-history-summary">
        <article className="panel detail-panel">
          <h2>Latest Pull Request</h2>
          <dl className="kv-list">
            <div>
              <dt>PR</dt>
              <dd>
                <a className="entity-link" href={latest.htmlUrl} target="_blank" rel="noreferrer">
                  #{latest.number}
                </a>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`status-pill tone-${prTone(latest)}`}>{prLabel(latest)}</span>
              </dd>
            </div>
            <div>
              <dt>Author</dt>
              <dd>{latest.author}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatTimestamp(latest.createdAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatTimestamp(latest.updatedAt)}</dd>
            </div>
            <div>
              <dt>Merged</dt>
              <dd>{formatTimestamp(latest.mergedAt)}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>
                <code>{latest.headRef}</code>
              </dd>
            </div>
            <div>
              <dt>Head SHA</dt>
              <dd>
                <code>{latest.headSha.slice(0, 12)}</code>
              </dd>
            </div>
          </dl>
        </article>

        <article className="panel detail-panel">
          <h2>Latest Pipeline</h2>
          {latestTransaction ? (
            <>
              <dl className="kv-list">
                <div>
                  <dt>State</dt>
                  <dd>
                    <span className={`status-pill tone-${pipelineTone(latestTransaction.pipeline.status)}`}>
                      {formatPipelineStatus(latestTransaction.pipeline.status)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Summary</dt>
                  <dd>{latestTransaction.pipeline.message}</dd>
                </div>
              </dl>
              <ul className="transaction-workflows">
                {[
                  { label: "PR Check", run: latestTransaction.pipeline.runs.prCheck },
                  { label: "TARS Reconcile/Update", run: latestTransaction.pipeline.runs.reconcileUpdate },
                  { label: "SVCS Build/Deploy", run: latestTransaction.pipeline.runs.svcsBuildDeploy }
                ].map(({ label, run }) => (
                  <li key={label}>
                    <span>{label}</span>
                    {run?.htmlUrl ? (
                      <a className="entity-link" href={run.htmlUrl} target="_blank" rel="noreferrer">
                        {formatWorkflowRunStatus(run)}
                      </a>
                    ) : (
                      <span>{formatWorkflowRunStatus(run)}</span>
                    )}
                    <span>{formatTimestamp(run?.updatedAt || null)}</span>
                  </li>
                ))}
              </ul>
              {latestTransaction.pipeline.notifications.length > 0 && (
                <ul className="transaction-notifications">
                  {latestTransaction.pipeline.notifications.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              {latestTransaction.timeline.length > 0 && (
                <ul className="history-timeline-list">
                  {latestTransaction.timeline.map((event) => (
                    <li key={event.id}>
                      <span className={`status-pill tone-${pipelineTone(event.status)}`}>{event.title}</span>
                      <span>{event.detail}</span>
                      <span>{formatTimestamp(event.timestamp)}</span>
                      {event.url ? (
                        <a className="entity-link" href={event.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        <span className="embed-note">n/a</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="embed-note">Pipeline detail is loading...</p>
          )}
        </article>
      </section>

      {transactionError && (
        <section className="panel">
          <p className="form-error" role="alert">
            {transactionError}
          </p>
        </section>
      )}

      {hasServiceMismatch && (
        <section className="warning-box" aria-live="polite">
          <h2>Warning</h2>
          <ul>
            <li>Some results returned from GitHub do not match this service filter exactly.</li>
          </ul>
        </section>
      )}

      <section className="panel service-table-wrap" aria-label="service-history-table">
        <table className="service-table">
          <thead>
            <tr>
              <th>PR</th>
              <th>Title</th>
              <th>PR Status</th>
              <th>Pipeline</th>
              <th>Author</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Merged</th>
              <th>Head Branch</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const status = transactionMap[item.number];
              return (
                <tr key={item.number}>
                  <td>
                    <a className="entity-link" href={item.htmlUrl} target="_blank" rel="noreferrer">
                      #{item.number}
                    </a>
                  </td>
                  <td>{item.title}</td>
                  <td>
                    <span className={`status-pill tone-${prTone(item)}`}>{prLabel(item)}</span>
                  </td>
                  <td>
                    {status ? (
                      <span className={`status-pill tone-${pipelineTone(status.pipeline.status)}`}>
                        {formatPipelineStatus(status.pipeline.status)}
                      </span>
                    ) : (
                      "loading..."
                    )}
                  </td>
                  <td>{item.author}</td>
                  <td>{formatTimestamp(item.createdAt)}</td>
                  <td>{formatTimestamp(item.updatedAt)}</td>
                  <td>{formatTimestamp(item.mergedAt)}</td>
                  <td>
                    <code>{item.headRef}</code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
