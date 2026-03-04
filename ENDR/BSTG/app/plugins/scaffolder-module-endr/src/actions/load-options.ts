import { InputError } from '@backstage/errors';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

type TemplateOption = {
  name: string;
  description?: string;
  path?: string;
};

type LoadOptionsResponse = {
  serviceTemplates: TemplateOption[];
  gitopsTemplates: TemplateOption[];
  namespaces: TemplateOption[];
  kubernetesEnvironments: TemplateOption[];
  existingServices: string[];
};

function normalizeApiBaseUrl(value: string | undefined): string {
  const raw = (value || DEFAULT_API_BASE_URL).trim();
  if (!raw) {
    return DEFAULT_API_BASE_URL;
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

export function createEndrLoadOptionsAction() {
  return createTemplateAction({
    id: 'endr:load-options',
    description: 'Load service templates, namespaces, and environments from ENDR PLEX API.',
    schema: {
      input: {
        apiBaseUrl: z =>
          z
            .string({
              description: 'ENDR backend base URL where /api/plex/templates is reachable'
            })
            .optional()
      },
      output: {
        serviceTemplateNames: z => z.string(),
        gitopsTemplateNames: z => z.string(),
        namespaceNames: z => z.string(),
        environmentNames: z => z.string(),
        existingServices: z => z.string()
      }
    },
    async handler(ctx) {
      const apiBaseUrl = normalizeApiBaseUrl(ctx.input.apiBaseUrl);
      const endpoint = `${apiBaseUrl}/api/plex/templates`;
      ctx.logger.info(`Loading ENDR options from ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          accept: 'application/json'
        }
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new InputError(`Unable to load options: ${toErrorDetail(body)}`);
      }

      const options = body as LoadOptionsResponse;
      const serviceTemplateNames = (options.serviceTemplates || []).map(item => item.name).filter(Boolean);
      const gitopsTemplateNames = (options.gitopsTemplates || []).map(item => item.name).filter(Boolean);
      const namespaceNames = (options.namespaces || []).map(item => item.name).filter(Boolean);
      const environmentNames = (options.kubernetesEnvironments || []).map(item => item.name).filter(Boolean);
      const existingServices = (options.existingServices || []).filter(Boolean);

      if (serviceTemplateNames.length === 0 || gitopsTemplateNames.length === 0) {
        throw new InputError('ENDR template catalog is empty. Check ENDR.yaml and /api/plex/templates.');
      }

      ctx.output('serviceTemplateNames', serviceTemplateNames.join(', '));
      ctx.output('gitopsTemplateNames', gitopsTemplateNames.join(', '));
      ctx.output('namespaceNames', namespaceNames.join(', '));
      ctx.output('environmentNames', environmentNames.join(', '));
      ctx.output('existingServices', existingServices.join(', '));
    }
  });
}
