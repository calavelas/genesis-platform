import { InputError } from '@backstage/errors';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';
const DEFAULT_CASE_BASE_URL = 'https://case.calavelas.net';
const K8S_DNS_LABEL_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

type CreateServicePayload = {
  serviceName: string;
  namespace: string;
  environment: string;
  serviceTemplate: string;
  gitopsTemplate: string;
  gatewayEnabled: boolean;
  branchName?: string;
  dryRun: boolean;
};

type CreateServiceResponse = {
  serviceName: string;
  dryRun: boolean;
  stagingPath: string;
  generatedFiles: Array<{
    path: string;
    size: number;
  }>;
  branchName?: string | null;
  pullRequestUrl?: string | null;
  pullRequestNumber?: number | null;
};

function normalizeApiBaseUrl(value: string | undefined): string {
  const raw = (value || DEFAULT_API_BASE_URL).trim();
  if (!raw) {
    return DEFAULT_API_BASE_URL;
  }
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function normalizeCaseBaseUrl(value: string | undefined): string {
  const raw = (value || DEFAULT_CASE_BASE_URL).trim();
  if (!raw) {
    return DEFAULT_CASE_BASE_URL;
  }
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function toErrorDetail(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === 'string') {
      return detail;
    }
    return JSON.stringify(detail);
  }
  if (typeof payload === 'string') {
    return payload;
  }
  return 'unknown error';
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function assertNonBlank(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new InputError(`${name} is required`);
  }
  return normalized;
}

function assertServiceName(serviceName: string): string {
  const normalized = assertNonBlank('serviceName', serviceName);
  if (normalized.length > 48 || !K8S_DNS_LABEL_RE.test(normalized)) {
    throw new InputError('serviceName must match Kubernetes DNS label format and be <= 48 chars');
  }
  return normalized;
}

export function createEndrCreateServiceAction() {
  return createTemplateAction({
    id: 'endr:create-service',
    description: 'Create ENDR service by calling /api/plex/services and opening a PR.',
    schema: {
      input: {
        apiBaseUrl: z => z.string().optional(),
        caseBaseUrl: z => z.string().optional(),
        serviceName: z => z.string(),
        serviceTemplate: z => z.string(),
        gitopsTemplate: z => z.string(),
        namespace: z => z.string(),
        environment: z => z.string(),
        gatewayEnabled: z => z.boolean().optional(),
        branchName: z => z.string().optional()
      },
      output: {
        serviceName: z => z.string(),
        pullRequestUrl: z => z.string(),
        pullRequestNumber: z => z.number(),
        branchName: z => z.string(),
        serviceUrl: z => z.string(),
        servicePageUrl: z => z.string(),
        historyPageUrl: z => z.string()
      }
    },
    async handler(ctx) {
      const apiBaseUrl = normalizeApiBaseUrl(ctx.input.apiBaseUrl);
      const caseBaseUrl = normalizeCaseBaseUrl(ctx.input.caseBaseUrl);
      const serviceName = assertServiceName(ctx.input.serviceName);
      const serviceTemplate = assertNonBlank('serviceTemplate', ctx.input.serviceTemplate);
      const gitopsTemplate = assertNonBlank('gitopsTemplate', ctx.input.gitopsTemplate);
      const namespace = assertNonBlank('namespace', ctx.input.namespace);
      const environment = assertNonBlank('environment', ctx.input.environment);
      const branchName = ctx.input.branchName?.trim() || undefined;
      const gatewayEnabled = ctx.input.gatewayEnabled ?? true;

      const dryRun = Boolean(ctx.isDryRun);
      const payload: CreateServicePayload = {
        serviceName,
        namespace,
        environment,
        serviceTemplate,
        gitopsTemplate,
        gatewayEnabled,
        dryRun
      };
      if (branchName) {
        payload.branchName = branchName;
      }

      const endpoint = `${apiBaseUrl}/api/plex/services`;
      ctx.logger.info(`Creating ENDR service via ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new InputError(`Unable to create service: ${toErrorDetail(body)}`);
      }

      const result = body as CreateServiceResponse;
      if (!result.dryRun && (!result.pullRequestUrl || !result.pullRequestNumber || !result.branchName)) {
        throw new InputError('PLEX API did not return pullRequestUrl, pullRequestNumber, and branchName');
      }

      const serviceUrl = `https://${encodeURIComponent(serviceName)}.calavelas.net`;
      const servicePageUrl = `${caseBaseUrl}/services/${encodeURIComponent(serviceName)}`;
      const historyPageUrl = `${caseBaseUrl}/history/${encodeURIComponent(serviceName)}`;
      const outputBranchName = result.branchName || (dryRun ? 'dry-run' : '');
      const outputPullRequestUrl = result.pullRequestUrl || (dryRun ? 'about:blank' : '');
      const outputPullRequestNumber = result.pullRequestNumber || 0;

      ctx.output('serviceName', serviceName);
      ctx.output('pullRequestUrl', outputPullRequestUrl);
      ctx.output('pullRequestNumber', outputPullRequestNumber);
      ctx.output('branchName', outputBranchName);
      ctx.output('serviceUrl', serviceUrl);
      ctx.output('servicePageUrl', servicePageUrl);
      ctx.output('historyPageUrl', historyPageUrl);
    }
  });
}
