"use client";

import Link from "next/link";
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
  pipelineStatus?: string | null;
}

interface CaseHistoryResponse {
  sourceRepo: string;
  titlePrefix: string;
  serviceFilter?: string | null;
  authorFilter?: string | null;
  prStateFilter?: string;
  pipelineStatusFilter?: string;
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
  if (!normalized) {
    return "Unknown";
  }
  if (normalized === "waiting-merge") {
    return "Waiting Merge";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function matchesPrState(item: CaseHistoryItem, filter: string): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "merged") {
    return item.merged;
  }
  if (filter === "open") {
    return item.state === "open";
  }
  if (filter === "closed") {
    return item.state === "closed" && !item.merged;
  }
  return true;
}

function pipelineForItem(item: CaseHistoryItem, transaction: TransactionStatusResult | undefined): string {
  if (transaction) {
    return transaction.pipeline.status;
  }
  return item.pipelineStatus?.trim() || "unknown";
}

export function HistoryPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<CaseHistoryResponse | null>(null);
  const [transactionMap, setTransactionMap] = useState<Record<number, TransactionStatusResult>>({});
  const [transactionError, setTransactionError] = useState("");
  const [prStateFilter, setPrStateFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [authorFilter, setAuthorFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/plex/history?limit=120", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok) {
          throw new Error(readErrorMessage(body));
        }
        if (!cancelled) {
          setHistory(body as CaseHistoryResponse);
          setError("");
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
  }, []);

  const items = history?.items ?? [];

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const targets = items.slice(0, 40);

    const loadTransactions = async () => {
      try {
        const responses = await Promise.all(
          targets.map(async (item) => {
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
          const detail = err instanceof Error ? err.message : "unable to load transaction statuses";
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

  const authors = useMemo(() => {
    return [...new Set(items.map((item) => item.author).filter((value) => value && value.trim()))].sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!matchesPrState(item, prStateFilter)) {
        return false;
      }
      if (authorFilter !== "all" && item.author !== authorFilter) {
        return false;
      }
      if (pipelineFilter !== "all") {
        const pipelineStatus = pipelineForItem(item, transactionMap[item.number]).trim().toLowerCase();
        if (pipelineStatus !== pipelineFilter) {
          return false;
        }
      }
      return true;
    });
  }, [authorFilter, items, pipelineFilter, prStateFilter, transactionMap]);

  if (loading) {
    return (
      <section className="panel">
        <p className="embed-note">Loading create service history...</p>
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

  return (
    <>
      <section className="panel history-filter-panel">
        <div className="history-filter-grid">
          <label>
            PR State
            <select value={prStateFilter} onChange={(event) => setPrStateFilter(event.target.value)}>
              <option value="all">all</option>
              <option value="open">open</option>
              <option value="merged">merged</option>
              <option value="closed">closed (not merged)</option>
            </select>
          </label>

          <label>
            Pipeline Status
            <select value={pipelineFilter} onChange={(event) => setPipelineFilter(event.target.value)}>
              <option value="all">all</option>
              <option value="success">success</option>
              <option value="running">running</option>
              <option value="pending">pending</option>
              <option value="waiting-merge">waiting-merge</option>
              <option value="failed">failed</option>
              <option value="unknown">unknown</option>
            </select>
          </label>

          <label>
            Author
            <select value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)}>
              <option value="all">all</option>
              {authors.map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="embed-note">
          Showing <strong>{filteredItems.length}</strong> of <strong>{items.length}</strong> CASE-created service PRs.
        </p>

        {transactionError && (
          <p className="form-error" role="alert">
            {transactionError}
          </p>
        )}
      </section>

      <section className="panel service-table-wrap" aria-label="history-table">
        <table className="service-table history-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>PR</th>
              <th>PR Status</th>
              <th>Pipeline</th>
              <th>Author</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Merged</th>
              <th>Workflows</th>
              <th>Links</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const transaction = transactionMap[item.number];
              const pipelineStatus = pipelineForItem(item, transaction);
              const runs = transaction?.pipeline.runs;
              return (
                <tr key={item.number}>
                  <td>
                    {item.serviceName ? (
                      <Link className="entity-link" href={`/history/${encodeURIComponent(item.serviceName)}`}>
                        {item.serviceName}
                      </Link>
                    ) : (
                      "n/a"
                    )}
                  </td>
                  <td>
                    <a className="entity-link" href={item.htmlUrl} target="_blank" rel="noreferrer">
                      #{item.number}
                    </a>
                  </td>
                  <td>
                    <span className={`status-pill tone-${prTone(item)}`}>{prLabel(item)}</span>
                  </td>
                  <td>
                    <span className={`status-pill tone-${pipelineTone(pipelineStatus)}`}>
                      {formatPipelineStatus(pipelineStatus)}
                    </span>
                  </td>
                  <td>{item.author}</td>
                  <td>{formatTimestamp(item.createdAt)}</td>
                  <td>{formatTimestamp(item.updatedAt)}</td>
                  <td>{formatTimestamp(item.mergedAt)}</td>
                  <td>
                    <div className="history-link-set">
                      {runs?.prCheck?.htmlUrl ? (
                        <a className="entity-link" href={runs.prCheck.htmlUrl} target="_blank" rel="noreferrer">
                          PR
                        </a>
                      ) : (
                        <span className="embed-note">PR n/a</span>
                      )}
                      {runs?.reconcileUpdate?.htmlUrl ? (
                        <a className="entity-link" href={runs.reconcileUpdate.htmlUrl} target="_blank" rel="noreferrer">
                          Reconcile
                        </a>
                      ) : (
                        <span className="embed-note">Rec n/a</span>
                      )}
                      {runs?.svcsBuildDeploy?.htmlUrl ? (
                        <a className="entity-link" href={runs.svcsBuildDeploy.htmlUrl} target="_blank" rel="noreferrer">
                          Build
                        </a>
                      ) : (
                        <span className="embed-note">Build n/a</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {item.serviceName ? (
                      <div className="history-link-set">
                        <Link className="entity-link" href={`/services/${encodeURIComponent(item.serviceName)}`}>
                          Service
                        </Link>
                        <a
                          className="entity-link"
                          href={`https://${encodeURIComponent(item.serviceName)}.calavelas.net`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Access
                        </a>
                      </div>
                    ) : (
                      "n/a"
                    )}
                  </td>
                </tr>
              );
            })}

            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={10} className="empty-cell">
                  No CASE-created service pull requests match current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
