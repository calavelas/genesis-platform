"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  count: number;
  items: CaseHistoryItem[];
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

export function HistoryPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<CaseHistoryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/plex/history?limit=100", { cache: "no-store" })
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

  const items = history?.items ?? [];

  return (
    <section className="panel service-table-wrap" aria-label="history-table">
      <table className="service-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>PR</th>
            <th>Status</th>
            <th>Author</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Merged</th>
            <th>Head Branch</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
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
              <td>{item.author}</td>
              <td>{formatTimestamp(item.createdAt)}</td>
              <td>{formatTimestamp(item.updatedAt)}</td>
              <td>{formatTimestamp(item.mergedAt)}</td>
              <td>
                <code>{item.headRef}</code>
              </td>
            </tr>
          ))}

          {items.length === 0 && (
            <tr>
              <td colSpan={8} className="empty-cell">
                No CASE-created service pull requests found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
