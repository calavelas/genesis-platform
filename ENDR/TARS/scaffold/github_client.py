from __future__ import annotations

import base64
import json
import ssl
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request


class GitHubAPIError(RuntimeError):
    """Raised when GitHub API requests fail."""


@dataclass(slots=True)
class PullRequestInfo:
    number: int
    url: str
    html_url: str


class GitHubClient:
    def __init__(self, token: str, owner: str, repo: str, api_base: str = "https://api.github.com") -> None:
        if not token:
            raise ValueError("token is required")
        self.token = token
        self.owner = owner
        self.repo = repo
        self.api_base = api_base.rstrip("/")
        self.ssl_context = self._build_ssl_context()

    @staticmethod
    def _build_ssl_context() -> ssl.SSLContext:
        context = ssl.create_default_context()
        try:
            import certifi

            context.load_verify_locations(cafile=certifi.where())
        except ModuleNotFoundError:
            pass
        return context

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        expected_statuses: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        url = path if path.startswith("http") else f"{self.api_base}{path}"
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")

        max_redirects = 5
        redirect_codes = {301, 302, 307, 308}

        for _ in range(max_redirects + 1):
            req = request.Request(url=url, data=body, method=method)
            req.add_header("Authorization", f"Bearer {self.token}")
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("X-GitHub-Api-Version", "2022-11-28")
            if body is not None:
                req.add_header("Content-Type", "application/json")

            try:
                with request.urlopen(req, timeout=30, context=self.ssl_context) as response:  # noqa: S310
                    raw = response.read().decode("utf-8")
                    data = json.loads(raw) if raw else {}
                    if response.status not in expected_statuses:
                        raise GitHubAPIError(
                            f"unexpected status {response.status} for {method} {path}: {data}"
                        )
                    return data
            except error.HTTPError as exc:
                raw = exc.read().decode("utf-8", errors="replace")
                try:
                    data = json.loads(raw) if raw else {}
                except Exception:  # noqa: BLE001
                    data = {"message": raw}

                if exc.code in redirect_codes:
                    redirect_url = exc.headers.get("Location", "")
                    if not redirect_url and isinstance(data, dict):
                        redirect_url = str(data.get("url", "")).strip()
                    if redirect_url:
                        url = redirect_url
                        continue

                raise GitHubAPIError(
                    f"github api error {exc.code} for {method} {path}: {data}"
                ) from exc
            except error.URLError as exc:
                raise GitHubAPIError(f"unable to reach GitHub API: {exc}") from exc

        raise GitHubAPIError(f"too many redirects for {method} {path}")

    def get_ref_sha(self, branch: str) -> str:
        path = f"/repos/{self.owner}/{self.repo}/git/ref/heads/{parse.quote(branch, safe='')}"
        data = self._request("GET", path)
        return data["object"]["sha"]

    def branch_exists(self, branch: str) -> bool:
        try:
            self.get_ref_sha(branch)
            return True
        except GitHubAPIError:
            return False

    def create_branch(self, branch: str, from_sha: str) -> None:
        path = f"/repos/{self.owner}/{self.repo}/git/refs"
        payload = {"ref": f"refs/heads/{branch}", "sha": from_sha}
        self._request("POST", path, payload, expected_statuses=(201,))

    def _get_content_sha(self, branch: str, file_path: str) -> str | None:
        encoded_path = parse.quote(file_path, safe="/")
        path = f"/repos/{self.owner}/{self.repo}/contents/{encoded_path}?ref={parse.quote(branch, safe='')}"
        try:
            data = self._request("GET", path)
            if isinstance(data, dict):
                return data.get("sha")
            return None
        except GitHubAPIError:
            return None

    def get_file_content(self, branch: str, file_path: str) -> bytes | None:
        encoded_path = parse.quote(file_path, safe="/")
        path = f"/repos/{self.owner}/{self.repo}/contents/{encoded_path}?ref={parse.quote(branch, safe='')}"
        try:
            data = self._request("GET", path)
        except GitHubAPIError as exc:
            if "error 404" in str(exc):
                return None
            raise

        if not isinstance(data, dict):
            raise GitHubAPIError(f"unexpected content response for {file_path}")

        content = data.get("content")
        encoding = data.get("encoding")
        if not isinstance(content, str) or encoding != "base64":
            raise GitHubAPIError(f"unexpected encoding for {file_path}: {encoding}")

        normalized = content.replace("\n", "")
        try:
            return base64.b64decode(normalized.encode("ascii"))
        except Exception as exc:  # noqa: BLE001
            raise GitHubAPIError(f"invalid base64 payload for {file_path}") from exc

    def create_or_update_file(
        self,
        branch: str,
        file_path: str,
        content_bytes: bytes,
        commit_message: str,
    ) -> None:
        content_b64 = base64.b64encode(content_bytes).decode("ascii")
        existing_sha = self._get_content_sha(branch, file_path)
        payload: dict[str, Any] = {
            "message": commit_message,
            "content": content_b64,
            "branch": branch,
        }
        if existing_sha:
            payload["sha"] = existing_sha

        encoded_path = parse.quote(file_path, safe="/")
        path = f"/repos/{self.owner}/{self.repo}/contents/{encoded_path}"
        self._request("PUT", path, payload, expected_statuses=(200, 201))

    def delete_file(
        self,
        branch: str,
        file_path: str,
        commit_message: str,
    ) -> bool:
        existing_sha = self._get_content_sha(branch, file_path)
        if not existing_sha:
            return False

        payload: dict[str, Any] = {
            "message": commit_message,
            "sha": existing_sha,
            "branch": branch,
        }
        encoded_path = parse.quote(file_path, safe="/")
        path = f"/repos/{self.owner}/{self.repo}/contents/{encoded_path}"
        self._request("DELETE", path, payload, expected_statuses=(200,))
        return True

    def create_pull_request(self, title: str, body: str, head: str, base: str) -> PullRequestInfo:
        path = f"/repos/{self.owner}/{self.repo}/pulls"
        payload = {"title": title, "body": body, "head": head, "base": base}
        data = self._request("POST", path, payload, expected_statuses=(201,))
        return PullRequestInfo(number=data["number"], url=data["url"], html_url=data["html_url"])
