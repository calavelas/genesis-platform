from __future__ import annotations

import json
import math
import os
import ssl
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib import error, parse, request

from pydantic import BaseModel, Field

from TARS.config.loader import load_idp_config, resolve_config_paths

CASE_PR_TITLE_PREFIX = "CASE - Adding service :"
_GITHUB_API_BASE = "https://api.github.com"
_STATE_VERSION = 1
_STATE_RELATIVE_PATH = Path(".idp") / "plex" / "transactions-state.json"
_STATE_LOCK = threading.Lock()


class TransactionWorkflowRun(BaseModel):
    id: int
    name: str
    title: str
    workflowPath: str
    htmlUrl: str
    event: str
    status: str
    conclusion: str | None
    headBranch: str
    headSha: str
    runNumber: int
    runAttempt: int
    createdAt: str
    updatedAt: str


class TransactionPullRequest(BaseModel):
    number: int
    title: str
    htmlUrl: str
    state: str
    merged: bool
    createdAt: str
    updatedAt: str
    closedAt: str | None
    mergedAt: str | None
    mergeCommitSha: str | None
    headRef: str
    headSha: str
    baseRef: str


class TransactionPipelineRuns(BaseModel):
    prCheck: TransactionWorkflowRun | None = None
    reconcileUpdate: TransactionWorkflowRun | None = None
    svcsBuildDeploy: TransactionWorkflowRun | None = None


class TransactionPipeline(BaseModel):
    status: str
    message: str
    notifications: list[str] = Field(default_factory=list)
    runs: TransactionPipelineRuns


class TransactionTimelineEvent(BaseModel):
    id: str
    title: str
    status: str
    timestamp: str | None = None
    detail: str
    url: str | None = None


class TransactionStatusResponse(BaseModel):
    pullRequest: TransactionPullRequest
    pipeline: TransactionPipeline
    timeline: list[TransactionTimelineEvent] = Field(default_factory=list)
    persistedAt: str | None = None


class HistoryItem(BaseModel):
    number: int
    title: str
    serviceName: str
    htmlUrl: str
    state: str
    merged: bool
    draft: bool
    createdAt: str
    updatedAt: str
    closedAt: str | None
    mergedAt: str | None
    headRef: str
    headSha: str
    baseRef: str
    author: str
    pipelineStatus: str | None = None
    pipelineMessage: str | None = None
    latestWorkflowUrl: str | None = None
    lastSyncedAt: str | None = None


class CaseHistoryResponse(BaseModel):
    sourceRepo: str
    titlePrefix: str
    serviceFilter: str | None = None
    authorFilter: str | None = None
    prStateFilter: str = "all"
    pipelineStatusFilter: str = "all"
    count: int
    items: list[HistoryItem]


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def _normalize(value: str) -> str:
    return value.strip().lower()


def _to_error_detail(payload: Any) -> str:
    if isinstance(payload, dict):
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return "unknown error"


def _build_ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    try:
        import certifi

        context.load_verify_locations(cafile=certifi.where())
    except ModuleNotFoundError:
        pass
    return context


def _github_get(path: str, token: str) -> Any:
    url = f"{_GITHUB_API_BASE}{path}"
    req = request.Request(url, method="GET")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if token:
        req.add_header("Authorization", f"Bearer {token}")

    try:
        with request.urlopen(req, timeout=30, context=_build_ssl_context()) as response:  # noqa: S310
            raw = response.read().decode("utf-8")
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:  # noqa: BLE001
            payload = {"message": raw}
        detail = _to_error_detail(payload)
        raise RuntimeError(f"github api {exc.code} for {path}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"unable to reach GitHub API for {path}: {exc}") from exc

    try:
        return json.loads(raw) if raw else {}
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"invalid github json payload for {path}") from exc


def _resolve_repo_context() -> tuple[Path, str, str, str]:
    paths = resolve_config_paths()
    idp_config = load_idp_config(paths.idpConfigPath)
    owner = idp_config.config.git.owner.strip()
    repo = idp_config.config.git.repo.strip()
    default_branch = (idp_config.config.git.defaultBranch or "main").strip() or "main"
    if not owner or not repo:
        raise ValueError("ENDR.config.git owner/repo are required")
    return Path(paths.repoRoot).resolve(), owner, repo, default_branch


def _resolve_github_token() -> str:
    return (
        os.getenv("CASE_GITHUB_TOKEN", "").strip()
        or os.getenv("GITHUB_TOKEN", "").strip()
        or os.getenv("CASE_AUTOMERGE_TOKEN", "").strip()
    )


def _state_file(repo_root: Path) -> Path:
    return repo_root / _STATE_RELATIVE_PATH


def _empty_state() -> dict[str, Any]:
    return {
        "version": _STATE_VERSION,
        "updatedAt": _now_iso(),
        "transactions": {},
    }


def _read_state_unlocked(state_path: Path) -> dict[str, Any]:
    if not state_path.exists():
        return _empty_state()
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return _empty_state()
    if not isinstance(data, dict):
        return _empty_state()
    transactions = data.get("transactions")
    if not isinstance(transactions, dict):
        data["transactions"] = {}
    if not isinstance(data.get("version"), int):
        data["version"] = _STATE_VERSION
    if not isinstance(data.get("updatedAt"), str):
        data["updatedAt"] = _now_iso()
    return data


def _write_state_unlocked(state_path: Path, state: dict[str, Any]) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(state, indent=2, sort_keys=True)
    tmp_path = state_path.with_suffix(".tmp")
    tmp_path.write_text(payload, encoding="utf-8")
    tmp_path.replace(state_path)


def _state_snapshot(repo_root: Path) -> dict[str, Any]:
    state_path = _state_file(repo_root)
    with _STATE_LOCK:
        return _read_state_unlocked(state_path)


def _mutate_state(repo_root: Path, mutator: Any) -> Any:
    state_path = _state_file(repo_root)
    with _STATE_LOCK:
        state = _read_state_unlocked(state_path)
        result = mutator(state)
        state["version"] = _STATE_VERSION
        state["updatedAt"] = _now_iso()
        _write_state_unlocked(state_path, state)
        return result


def _extract_service_name(title: str) -> str:
    if not title.startswith(CASE_PR_TITLE_PREFIX):
        return ""
    return title[len(CASE_PR_TITLE_PREFIX) :].strip()


def _is_case_pr(pr: dict[str, Any]) -> bool:
    title = str(pr.get("title") or "")
    head = pr.get("head", {}) if isinstance(pr.get("head"), dict) else {}
    head_ref = str(head.get("ref") or "")
    return title.startswith(CASE_PR_TITLE_PREFIX) and head_ref.startswith("case/")


def _to_timestamp_ms(value: str | None) -> float:
    if not value:
        return math.nan
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:  # noqa: BLE001
        return math.nan
    return parsed.timestamp() * 1000


def _sortable_timestamp(value: str | None) -> float:
    parsed = _to_timestamp_ms(value)
    if math.isfinite(parsed):
        return parsed
    return float("-inf")


def _is_workflow_path(run: dict[str, Any], workflow_file: str) -> bool:
    path = str(run.get("path") or "")
    return path.endswith(f"/{workflow_file}") or workflow_file in path


def _map_run(run: dict[str, Any] | None) -> TransactionWorkflowRun | None:
    if not isinstance(run, dict):
        return None
    return TransactionWorkflowRun(
        id=int(run.get("id") or 0),
        name=str(run.get("name") or ""),
        title=str(run.get("display_title") or run.get("name") or ""),
        workflowPath=str(run.get("path") or ""),
        htmlUrl=str(run.get("html_url") or ""),
        event=str(run.get("event") or ""),
        status=str(run.get("status") or "unknown"),
        conclusion=(str(run.get("conclusion")) if run.get("conclusion") is not None else None),
        headBranch=str(run.get("head_branch") or ""),
        headSha=str(run.get("head_sha") or ""),
        runNumber=int(run.get("run_number") or 0),
        runAttempt=int(run.get("run_attempt") or 0),
        createdAt=str(run.get("created_at") or ""),
        updatedAt=str(run.get("updated_at") or ""),
    )


def _select_run_after(runs: list[dict[str, Any]], workflow_file: str, threshold_ms: float) -> dict[str, Any] | None:
    for run in runs:
        if not _is_workflow_path(run, workflow_file):
            continue
        created_ms = _to_timestamp_ms(str(run.get("created_at") or ""))
        if math.isfinite(threshold_ms) and math.isfinite(created_ms) and created_ms < threshold_ms:
            continue
        return run
    return None


def _select_run_for_sha(
    runs: list[dict[str, Any]],
    workflow_file: str,
    expected_head_sha: str,
    threshold_ms: float,
) -> dict[str, Any] | None:
    normalized_sha = expected_head_sha.strip()
    if not normalized_sha:
        return None

    for run in runs:
        if not _is_workflow_path(run, workflow_file):
            continue
        if str(run.get("head_sha") or "").strip() != normalized_sha:
            continue
        created_ms = _to_timestamp_ms(str(run.get("created_at") or ""))
        if math.isfinite(threshold_ms) and math.isfinite(created_ms) and created_ms < threshold_ms:
            continue
        return run
    return None


def _select_pipeline_state(
    pull_request: TransactionPullRequest,
    pr_check_run: dict[str, Any] | None,
    reconcile_run: dict[str, Any] | None,
    svcs_run: dict[str, Any] | None,
) -> tuple[str, str, list[str]]:
    notifications: list[str] = []

    if pull_request.merged:
        notifications.append(f"PR #{pull_request.number} has been merged.")
    elif pull_request.state == "open":
        notifications.append(f"PR #{pull_request.number} is open.")
    else:
        notifications.append(f"PR #{pull_request.number} is {pull_request.state}.")

    if pull_request.mergedAt:
        notifications.append(f"Merged at {pull_request.mergedAt}.")

    if not pull_request.merged:
        if not pr_check_run:
            return ("pending", "Waiting for PR reconcile workflow to start.", notifications)
        if str(pr_check_run.get("status") or "") != "completed":
            notifications.append("TARS PR reconcile is running.")
            return ("running", "PR checks are running.", notifications)
        conclusion = str(pr_check_run.get("conclusion") or "")
        if conclusion == "success":
            notifications.append("PR checks passed. Waiting for merge.")
            return ("waiting-merge", "PR checks passed. Waiting for merge.", notifications)
        notifications.append(f"PR checks finished with {conclusion or 'unknown'} state.")
        return ("failed", f"PR checks failed ({conclusion or 'unknown'}).", notifications)

    if not reconcile_run:
        return ("pending", "Waiting for TARS reconcile/update workflow to start.", notifications)

    if str(reconcile_run.get("status") or "") != "completed":
        notifications.append("TARS reconcile/update is running.")
        return ("running", "TARS reconcile/update is running.", notifications)

    reconcile_conclusion = str(reconcile_run.get("conclusion") or "")
    if reconcile_conclusion != "success":
        notifications.append(f"TARS reconcile/update ended with {reconcile_conclusion or 'unknown'} state.")
        return ("failed", f"TARS reconcile/update failed ({reconcile_conclusion or 'unknown'}).", notifications)

    if not svcs_run:
        return ("pending", "Waiting for SVCS build/deploy workflow to start.", notifications)

    if str(svcs_run.get("status") or "") != "completed":
        notifications.append("SVCS build/deploy is running.")
        return ("running", "SVCS build/deploy is running.", notifications)

    svcs_conclusion = str(svcs_run.get("conclusion") or "")
    if svcs_conclusion == "success":
        notifications.append("SVCS build/deploy finished successfully.")
        return ("success", "Pipeline finished successfully.", notifications)

    notifications.append(f"SVCS build/deploy ended with {svcs_conclusion or 'unknown'} state.")
    return ("failed", f"SVCS build/deploy failed ({svcs_conclusion or 'unknown'}).", notifications)


def _timeline_for_status(status: TransactionStatusResponse, submitted_at: str | None) -> list[TransactionTimelineEvent]:
    events: list[TransactionTimelineEvent] = []
    if submitted_at:
        events.append(
            TransactionTimelineEvent(
                id="case-submit",
                title="Submitted From CASE",
                status="success",
                timestamp=submitted_at,
                detail="CASE created branch and pull request request.",
                url=status.pullRequest.htmlUrl or None,
            )
        )

    events.append(
        TransactionTimelineEvent(
            id="pr-opened",
            title="PR Opened",
            status="success",
            timestamp=status.pullRequest.createdAt,
            detail="Pull request opened from CASE UI.",
            url=status.pullRequest.htmlUrl or None,
        )
    )

    pr_check = status.pipeline.runs.prCheck
    if not pr_check:
        events.append(
            TransactionTimelineEvent(
                id="checks-passed",
                title="Checks Passed",
                status="pending",
                detail="Waiting for PR check workflow to start.",
            )
        )
    elif pr_check.status != "completed":
        events.append(
            TransactionTimelineEvent(
                id="checks-passed",
                title="Checks Passed",
                status="running",
                timestamp=pr_check.updatedAt or pr_check.createdAt,
                detail="PR check workflow is running.",
                url=pr_check.htmlUrl or None,
            )
        )
    elif pr_check.conclusion == "success":
        events.append(
            TransactionTimelineEvent(
                id="checks-passed",
                title="Checks Passed",
                status="success",
                timestamp=pr_check.updatedAt or pr_check.createdAt,
                detail="PR check workflow completed successfully.",
                url=pr_check.htmlUrl or None,
            )
        )
    else:
        events.append(
            TransactionTimelineEvent(
                id="checks-passed",
                title="Checks Passed",
                status="failed",
                timestamp=pr_check.updatedAt or pr_check.createdAt,
                detail=f"PR check workflow failed ({pr_check.conclusion or 'unknown'}).",
                url=pr_check.htmlUrl or None,
            )
        )

    if status.pullRequest.merged:
        events.append(
            TransactionTimelineEvent(
                id="pr-merged",
                title="PR Merged",
                status="success",
                timestamp=status.pullRequest.mergedAt,
                detail="Pull request merged into main.",
                url=status.pullRequest.htmlUrl or None,
            )
        )
    else:
        events.append(
            TransactionTimelineEvent(
                id="pr-merged",
                title="PR Merged",
                status="pending",
                detail="Waiting for pull request merge.",
                url=status.pullRequest.htmlUrl or None,
            )
        )

    reconcile_run = status.pipeline.runs.reconcileUpdate
    if not status.pullRequest.merged:
        events.append(
            TransactionTimelineEvent(
                id="reconcile",
                title="Reconcile",
                status="pending",
                detail="Reconcile starts after PR merge.",
            )
        )
    elif not reconcile_run:
        events.append(
            TransactionTimelineEvent(
                id="reconcile",
                title="Reconcile",
                status="pending",
                detail="Waiting for TARS reconcile/update workflow.",
            )
        )
    elif reconcile_run.status != "completed":
        events.append(
            TransactionTimelineEvent(
                id="reconcile",
                title="Reconcile",
                status="running",
                timestamp=reconcile_run.updatedAt or reconcile_run.createdAt,
                detail="TARS reconcile/update workflow is running.",
                url=reconcile_run.htmlUrl or None,
            )
        )
    elif reconcile_run.conclusion == "success":
        events.append(
            TransactionTimelineEvent(
                id="reconcile",
                title="Reconcile",
                status="success",
                timestamp=reconcile_run.updatedAt or reconcile_run.createdAt,
                detail="TARS reconcile/update workflow completed successfully.",
                url=reconcile_run.htmlUrl or None,
            )
        )
    else:
        events.append(
            TransactionTimelineEvent(
                id="reconcile",
                title="Reconcile",
                status="failed",
                timestamp=reconcile_run.updatedAt or reconcile_run.createdAt,
                detail=f"TARS reconcile/update failed ({reconcile_run.conclusion or 'unknown'}).",
                url=reconcile_run.htmlUrl or None,
            )
        )

    svcs_run = status.pipeline.runs.svcsBuildDeploy
    if not status.pullRequest.merged:
        events.append(
            TransactionTimelineEvent(
                id="build-deploy",
                title="Build and Deploy",
                status="pending",
                detail="Build/deploy starts after reconcile.",
            )
        )
    elif not reconcile_run or (reconcile_run.status == "completed" and reconcile_run.conclusion != "success"):
        events.append(
            TransactionTimelineEvent(
                id="build-deploy",
                title="Build and Deploy",
                status="pending",
                detail="Waiting for reconcile success.",
            )
        )
    elif not svcs_run:
        events.append(
            TransactionTimelineEvent(
                id="build-deploy",
                title="Build and Deploy",
                status="pending",
                detail="Waiting for SVCS build/deploy workflow.",
            )
        )
    elif svcs_run.status != "completed":
        events.append(
            TransactionTimelineEvent(
                id="build-deploy",
                title="Build and Deploy",
                status="running",
                timestamp=svcs_run.updatedAt or svcs_run.createdAt,
                detail="SVCS build/deploy workflow is running.",
                url=svcs_run.htmlUrl or None,
            )
        )
    elif svcs_run.conclusion == "success":
        events.append(
            TransactionTimelineEvent(
                id="build-deploy",
                title="Build and Deploy",
                status="success",
                timestamp=svcs_run.updatedAt or svcs_run.createdAt,
                detail="SVCS build/deploy workflow completed successfully.",
                url=svcs_run.htmlUrl or None,
            )
        )
    else:
        events.append(
            TransactionTimelineEvent(
                id="build-deploy",
                title="Build and Deploy",
                status="failed",
                timestamp=svcs_run.updatedAt or svcs_run.createdAt,
                detail=f"SVCS build/deploy failed ({svcs_run.conclusion or 'unknown'}).",
                url=svcs_run.htmlUrl or None,
            )
        )

    return events


def _latest_workflow_url(status: TransactionStatusResponse | None) -> str | None:
    if not status:
        return None
    runs = status.pipeline.runs
    for run in (runs.svcsBuildDeploy, runs.reconcileUpdate, runs.prCheck):
        if run and run.htmlUrl:
            return run.htmlUrl
    return None


def _build_status_from_github(
    owner: str,
    repo: str,
    default_branch: str,
    token: str,
    pull_request_number: int,
) -> TransactionStatusResponse:
    pull_request = _github_get(
        f"/repos/{parse.quote(owner, safe='')}/{parse.quote(repo, safe='')}/pulls/{pull_request_number}",
        token,
    )
    if not isinstance(pull_request, dict):
        raise RuntimeError(f"invalid pull request payload for #{pull_request_number}")

    head = pull_request.get("head", {}) if isinstance(pull_request.get("head"), dict) else {}
    base = pull_request.get("base", {}) if isinstance(pull_request.get("base"), dict) else {}

    pull = TransactionPullRequest(
        number=int(pull_request.get("number") or pull_request_number),
        title=str(pull_request.get("title") or ""),
        htmlUrl=str(pull_request.get("html_url") or ""),
        state=str(pull_request.get("state") or "unknown"),
        merged=bool(pull_request.get("merged")),
        createdAt=str(pull_request.get("created_at") or ""),
        updatedAt=str(pull_request.get("updated_at") or ""),
        closedAt=(str(pull_request.get("closed_at")) if pull_request.get("closed_at") else None),
        mergedAt=(str(pull_request.get("merged_at")) if pull_request.get("merged_at") else None),
        mergeCommitSha=(str(pull_request.get("merge_commit_sha")) if pull_request.get("merge_commit_sha") else None),
        headRef=str(head.get("ref") or ""),
        headSha=str(head.get("sha") or ""),
        baseRef=str(base.get("ref") or ""),
    )

    pr_runs_payload = _github_get(
        "/repos/"
        f"{parse.quote(owner, safe='')}/{parse.quote(repo, safe='')}"
        f"/actions/runs?event=pull_request&branch={parse.quote(pull.headRef, safe='')}&per_page=30",
        token,
    )
    main_runs_payload = _github_get(
        "/repos/"
        f"{parse.quote(owner, safe='')}/{parse.quote(repo, safe='')}"
        f"/actions/runs?branch={parse.quote(default_branch, safe='')}&per_page=60",
        token,
    )

    pr_runs = pr_runs_payload.get("workflow_runs", []) if isinstance(pr_runs_payload, dict) else []
    main_runs = main_runs_payload.get("workflow_runs", []) if isinstance(main_runs_payload, dict) else []
    if not isinstance(pr_runs, list):
        pr_runs = []
    if not isinstance(main_runs, list):
        main_runs = []
    pr_runs = [run for run in pr_runs if isinstance(run, dict)]
    main_runs = [run for run in main_runs if isinstance(run, dict)]
    pr_runs.sort(key=lambda run: _sortable_timestamp(str(run.get("created_at") or "")), reverse=True)
    main_runs.sort(key=lambda run: _sortable_timestamp(str(run.get("created_at") or "")), reverse=True)

    pr_check_run = _select_run_after(pr_runs, "tars-pr.yml", float("-inf"))

    reconcile_run: dict[str, Any] | None = None
    merged_threshold_ms = float("-inf")
    merged_at_ms = _to_timestamp_ms(pull.mergedAt)
    if math.isfinite(merged_at_ms):
        # Small tolerance for API timestamp variance while keeping stale runs out.
        merged_threshold_ms = merged_at_ms - 30_000

    if pull.mergeCommitSha:
        reconcile_run = _select_run_for_sha(
            main_runs,
            "tars-build.yml",
            pull.mergeCommitSha,
            merged_threshold_ms,
        )
    elif not reconcile_run:
        reconcile_run = _select_run_after(main_runs, "tars-build.yml", merged_threshold_ms)

    svcs_run: dict[str, Any] | None = None
    if reconcile_run:
        svcs_threshold_ms = merged_threshold_ms
        reconcile_created_ms = _to_timestamp_ms(str(reconcile_run.get("created_at") or ""))
        if math.isfinite(reconcile_created_ms):
            # SVCS build/deploy should start after current reconcile/update run starts.
            svcs_threshold_ms = reconcile_created_ms + 1_000

        reconcile_head_sha = str(reconcile_run.get("head_sha") or "").strip()
        if reconcile_head_sha:
            svcs_run = _select_run_for_sha(
                main_runs,
                "svcs-build.yml",
                reconcile_head_sha,
                svcs_threshold_ms,
            )
        if not svcs_run:
            svcs_run = _select_run_after(main_runs, "svcs-build.yml", svcs_threshold_ms)

    pipeline_status, pipeline_message, notifications = _select_pipeline_state(
        pull,
        pr_check_run,
        reconcile_run,
        svcs_run,
    )

    return TransactionStatusResponse(
        pullRequest=pull,
        pipeline=TransactionPipeline(
            status=pipeline_status,
            message=pipeline_message,
            notifications=notifications,
            runs=TransactionPipelineRuns(
                prCheck=_map_run(pr_check_run),
                reconcileUpdate=_map_run(reconcile_run),
                svcsBuildDeploy=_map_run(svcs_run),
            ),
        ),
        timeline=[],
        persistedAt=None,
    )


def _upsert_status(repo_root: Path, status: TransactionStatusResponse, submitted_at: str | None = None) -> None:
    now = _now_iso()
    pr_key = str(status.pullRequest.number)
    status.timeline = _timeline_for_status(status, submitted_at)
    status.persistedAt = now

    def _mutator(state: dict[str, Any]) -> None:
        transactions = state.setdefault("transactions", {})
        if not isinstance(transactions, dict):
            state["transactions"] = {}
            transactions = state["transactions"]
        existing = transactions.get(pr_key, {})
        if not isinstance(existing, dict):
            existing = {}

        resolved_submitted_at = submitted_at or str(existing.get("submittedAt") or "").strip() or None
        if resolved_submitted_at:
            status.timeline = _timeline_for_status(status, resolved_submitted_at)

        transactions[pr_key] = {
            "serviceName": _extract_service_name(status.pullRequest.title),
            "author": str(existing.get("author") or "unknown"),
            "submittedAt": resolved_submitted_at,
            "lastSyncedAt": now,
            "status": status.model_dump(mode="json"),
        }

    _mutate_state(repo_root, _mutator)


def _record_to_status(record: dict[str, Any]) -> TransactionStatusResponse | None:
    if not isinstance(record, dict):
        return None
    payload = record.get("status")
    if not isinstance(payload, dict):
        return None
    try:
        status = TransactionStatusResponse.model_validate(payload)
    except Exception:  # noqa: BLE001
        return None
    return status


def record_case_submission(
    *,
    service_name: str,
    pull_request_number: int,
    pull_request_url: str,
    branch_name: str | None = None,
) -> None:
    if pull_request_number <= 0:
        return

    repo_root, _owner, _repo, _default_branch = _resolve_repo_context()
    now = _now_iso()
    safe_service_name = service_name.strip()
    safe_branch_name = (branch_name or "").strip()

    placeholder = TransactionStatusResponse(
        pullRequest=TransactionPullRequest(
            number=pull_request_number,
            title=f"{CASE_PR_TITLE_PREFIX} {safe_service_name}",
            htmlUrl=pull_request_url.strip(),
            state="open",
            merged=False,
            createdAt=now,
            updatedAt=now,
            closedAt=None,
            mergedAt=None,
            mergeCommitSha=None,
            headRef=safe_branch_name,
            headSha="",
            baseRef="main",
        ),
        pipeline=TransactionPipeline(
            status="pending",
            message="Waiting for PR reconcile workflow to start.",
            notifications=[f"PR #{pull_request_number} is open."],
            runs=TransactionPipelineRuns(),
        ),
        timeline=[],
        persistedAt=now,
    )

    def _mutator(state: dict[str, Any]) -> None:
        transactions = state.setdefault("transactions", {})
        if not isinstance(transactions, dict):
            state["transactions"] = {}
            transactions = state["transactions"]
        record = transactions.get(str(pull_request_number), {})
        if not isinstance(record, dict):
            record = {}
        submitted_at = str(record.get("submittedAt") or "").strip() or now
        placeholder.timeline = _timeline_for_status(placeholder, submitted_at)
        placeholder.persistedAt = now
        transactions[str(pull_request_number)] = {
            "serviceName": safe_service_name,
            "author": str(record.get("author") or os.getenv("CASE_GITHUB_ACTOR", "").strip() or "unknown"),
            "submittedAt": submitted_at,
            "lastSyncedAt": now,
            "status": placeholder.model_dump(mode="json"),
        }

    _mutate_state(repo_root, _mutator)


def get_case_transaction_status(pull_request_number: int) -> TransactionStatusResponse:
    if pull_request_number <= 0:
        raise ValueError("pullRequestNumber must be a positive integer")

    repo_root, owner, repo, default_branch = _resolve_repo_context()
    token = _resolve_github_token()

    submitted_at: str | None = None
    snapshot = _state_snapshot(repo_root)
    existing = snapshot.get("transactions", {}).get(str(pull_request_number), {})
    if isinstance(existing, dict):
        submitted_raw = str(existing.get("submittedAt") or "").strip()
        submitted_at = submitted_raw or None

    try:
        status = _build_status_from_github(
            owner=owner,
            repo=repo,
            default_branch=default_branch,
            token=token,
            pull_request_number=pull_request_number,
        )
        _upsert_status(repo_root, status, submitted_at=submitted_at)
        return status
    except Exception as exc:  # noqa: BLE001
        snapshot = _state_snapshot(repo_root)
        record = snapshot.get("transactions", {}).get(str(pull_request_number), {})
        status = _record_to_status(record if isinstance(record, dict) else {})
        if status:
            return status
        raise RuntimeError(f"unable to resolve transaction status: {exc}") from exc


def _history_item_from_pr(pr: dict[str, Any], record: dict[str, Any] | None = None) -> HistoryItem:
    head = pr.get("head", {}) if isinstance(pr.get("head"), dict) else {}
    base = pr.get("base", {}) if isinstance(pr.get("base"), dict) else {}
    user = pr.get("user", {}) if isinstance(pr.get("user"), dict) else {}

    pipeline_status = None
    pipeline_message = None
    latest_workflow_url = None
    last_synced_at = None
    if isinstance(record, dict):
        status = _record_to_status(record)
        if status:
            pipeline_status = status.pipeline.status
            pipeline_message = status.pipeline.message
            latest_workflow_url = _latest_workflow_url(status)
        last_synced_at = str(record.get("lastSyncedAt") or "").strip() or None

    return HistoryItem(
        number=int(pr.get("number") or 0),
        title=str(pr.get("title") or ""),
        serviceName=_extract_service_name(str(pr.get("title") or "")),
        htmlUrl=str(pr.get("html_url") or ""),
        state=str(pr.get("state") or "unknown"),
        merged=bool(pr.get("merged_at")),
        draft=bool(pr.get("draft")),
        createdAt=str(pr.get("created_at") or ""),
        updatedAt=str(pr.get("updated_at") or ""),
        closedAt=(str(pr.get("closed_at")) if pr.get("closed_at") else None),
        mergedAt=(str(pr.get("merged_at")) if pr.get("merged_at") else None),
        headRef=str(head.get("ref") or ""),
        headSha=str(head.get("sha") or ""),
        baseRef=str(base.get("ref") or ""),
        author=str(user.get("login") or "unknown"),
        pipelineStatus=pipeline_status,
        pipelineMessage=pipeline_message,
        latestWorkflowUrl=latest_workflow_url,
        lastSyncedAt=last_synced_at,
    )


def _matches_pr_state(item: HistoryItem, pr_state: str) -> bool:
    normalized = _normalize(pr_state)
    if not normalized or normalized == "all":
        return True
    if normalized == "merged":
        return item.merged
    if normalized == "open":
        return item.state == "open"
    if normalized == "closed":
        return item.state == "closed" and not item.merged
    return True


def _matches_pipeline_status(item: HistoryItem, pipeline_status: str) -> bool:
    normalized = _normalize(pipeline_status)
    if not normalized or normalized == "all":
        return True
    actual = _normalize(item.pipelineStatus or "unknown")
    return actual == normalized


def _history_from_state(
    *,
    source_repo: str,
    state: dict[str, Any],
    limit: int,
    service_filter: str,
    author_filter: str,
    pr_state: str,
    pipeline_status: str,
) -> CaseHistoryResponse:
    transactions = state.get("transactions", {})
    if not isinstance(transactions, dict):
        transactions = {}

    items: list[HistoryItem] = []
    for _pr_key, record in transactions.items():
        if not isinstance(record, dict):
            continue
        status = _record_to_status(record)
        if not status:
            continue
        pull = status.pullRequest
        service_name = _extract_service_name(pull.title)
        author = str(record.get("author") or "unknown")
        merged = pull.merged
        draft = False
        item = HistoryItem(
            number=pull.number,
            title=pull.title,
            serviceName=service_name,
            htmlUrl=pull.htmlUrl,
            state=pull.state,
            merged=merged,
            draft=draft,
            createdAt=pull.createdAt,
            updatedAt=pull.updatedAt,
            closedAt=pull.closedAt,
            mergedAt=pull.mergedAt,
            headRef=pull.headRef,
            headSha=pull.headSha,
            baseRef=pull.baseRef,
            author=author,
            pipelineStatus=status.pipeline.status,
            pipelineMessage=status.pipeline.message,
            latestWorkflowUrl=_latest_workflow_url(status),
            lastSyncedAt=str(record.get("lastSyncedAt") or "").strip() or None,
        )
        if service_filter and _normalize(item.serviceName) != _normalize(service_filter):
            continue
        if author_filter and _normalize(item.author) != _normalize(author_filter):
            continue
        if not _matches_pr_state(item, pr_state):
            continue
        if not _matches_pipeline_status(item, pipeline_status):
            continue
        items.append(item)

    items.sort(key=lambda item: _sortable_timestamp(item.createdAt), reverse=True)
    items = items[:limit]
    return CaseHistoryResponse(
        sourceRepo=source_repo,
        titlePrefix=CASE_PR_TITLE_PREFIX,
        serviceFilter=service_filter or None,
        authorFilter=author_filter or None,
        prStateFilter=pr_state or "all",
        pipelineStatusFilter=pipeline_status or "all",
        count=len(items),
        items=items,
    )


def get_case_history(
    *,
    limit: int = 50,
    service_filter: str = "",
    author_filter: str = "",
    pr_state: str = "all",
    pipeline_status: str = "all",
) -> CaseHistoryResponse:
    safe_limit = max(1, min(limit, 200))
    safe_service_filter = service_filter.strip()
    safe_author_filter = author_filter.strip()
    safe_pr_state = pr_state.strip() or "all"
    safe_pipeline_status = pipeline_status.strip() or "all"

    repo_root, owner, repo, default_branch = _resolve_repo_context()
    source_repo = f"{owner}/{repo}"
    token = _resolve_github_token()
    snapshot = _state_snapshot(repo_root)
    transactions = snapshot.get("transactions", {})
    if not isinstance(transactions, dict):
        transactions = {}

    try:
        pulls: list[dict[str, Any]] = []
        for page in range(1, 4):
            payload = _github_get(
                "/repos/"
                f"{parse.quote(owner, safe='')}/{parse.quote(repo, safe='')}"
                f"/pulls?state=all&sort=created&direction=desc&per_page=100&page={page}",
                token,
            )
            if not isinstance(payload, list):
                break
            page_items = [pr for pr in payload if isinstance(pr, dict)]
            if not page_items:
                break
            pulls.extend(page_items)
            if len(pulls) >= safe_limit * 2:
                break
    except Exception:  # noqa: BLE001
        return _history_from_state(
            source_repo=source_repo,
            state=snapshot,
            limit=safe_limit,
            service_filter=safe_service_filter,
            author_filter=safe_author_filter,
            pr_state=safe_pr_state,
            pipeline_status=safe_pipeline_status,
        )

    filtered_raw = [pr for pr in pulls if _is_case_pr(pr)]
    filtered_items: list[HistoryItem] = []

    for pr in filtered_raw:
        item = _history_item_from_pr(pr, transactions.get(str(pr.get("number") or "")))
        if safe_service_filter and _normalize(item.serviceName) != _normalize(safe_service_filter):
            continue
        if safe_author_filter and _normalize(item.author) != _normalize(safe_author_filter):
            continue
        if not _matches_pr_state(item, safe_pr_state):
            continue
        if not _matches_pipeline_status(item, safe_pipeline_status):
            continue
        filtered_items.append(item)
        if len(filtered_items) >= safe_limit:
            break

    # Refresh open or unknown records so History status/filters stay useful.
    refresh_candidates: list[int] = []
    now_ms = _to_timestamp_ms(_now_iso())
    for item in filtered_items:
        if len(refresh_candidates) >= 12:
            break
        record = transactions.get(str(item.number))
        last_synced = _to_timestamp_ms(str(record.get("lastSyncedAt") or "")) if isinstance(record, dict) else math.nan
        stale = not math.isfinite(last_synced) or (math.isfinite(now_ms) and now_ms - last_synced > 2 * 60_000)
        if item.state == "open" or item.pipelineStatus is None or stale:
            refresh_candidates.append(item.number)

    if refresh_candidates:
        for pr_number in refresh_candidates:
            try:
                get_case_transaction_status(pr_number)
            except Exception:  # noqa: BLE001
                pass
        snapshot = _state_snapshot(repo_root)
        transactions = snapshot.get("transactions", {}) if isinstance(snapshot.get("transactions"), dict) else {}
        refreshed_items: list[HistoryItem] = []
        for pr in filtered_raw:
            item = _history_item_from_pr(pr, transactions.get(str(pr.get("number") or "")))
            if safe_service_filter and _normalize(item.serviceName) != _normalize(safe_service_filter):
                continue
            if safe_author_filter and _normalize(item.author) != _normalize(safe_author_filter):
                continue
            if not _matches_pr_state(item, safe_pr_state):
                continue
            if not _matches_pipeline_status(item, safe_pipeline_status):
                continue
            refreshed_items.append(item)
            if len(refreshed_items) >= safe_limit:
                break
        filtered_items = refreshed_items

    return CaseHistoryResponse(
        sourceRepo=source_repo,
        titlePrefix=CASE_PR_TITLE_PREFIX,
        serviceFilter=safe_service_filter or None,
        authorFilter=safe_author_filter or None,
        prStateFilter=safe_pr_state,
        pipelineStatusFilter=safe_pipeline_status,
        count=len(filtered_items),
        items=filtered_items,
    )
