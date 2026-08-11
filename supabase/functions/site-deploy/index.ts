import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const coolifyUrl = (Deno.env.get('COOLIFY_API_URL') ?? '').replace(/\/+$/, '');
const coolifyToken = Deno.env.get('COOLIFY_API_TOKEN') ?? '';
const siteUuid = Deno.env.get('COOLIFY_SITE_UUID') ?? '';
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

type Deployment = {
  id: string;
  provider_deployment_id: string | null;
  status: 'queued' | 'running';
  created_at: string;
};

const coolifyHeaders = { Authorization: `Bearer ${coolifyToken}`, Accept: 'application/json' };

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function coolifyStatus(status: string): 'running' | 'succeeded' | 'failed' | 'cancelled' {
  const normalized = status.toLowerCase();
  if (['finished', 'succeeded', 'success', 'completed'].includes(normalized)) return 'succeeded';
  if (normalized.includes('cancel')) return 'cancelled';
  if (['failed', 'error'].includes(normalized)) return 'failed';
  return 'running';
}

async function finishDeployment(
  deployment: Deployment,
  status: 'succeeded' | 'failed' | 'cancelled' | 'timed_out',
  errorSummary: string | null = null
): Promise<void> {
  const { error } = await db.rpc('finalize_public_site_deployment', {
    p_deployment_id: deployment.id,
    p_status: status,
    p_error_summary: errorSummary?.slice(0, 500) ?? null,
  });
  if (error) throw error;
}

async function reconcile(deployment: Deployment): Promise<boolean> {
  if (!deployment.provider_deployment_id) {
    if (Date.now() - new Date(deployment.created_at).getTime() > 5 * 60_000) {
      await finishDeployment(deployment, 'failed', 'Deploy trigger did not return an identifier.');
      return true;
    }
    return false;
  }
  if (Date.now() - new Date(deployment.created_at).getTime() > 45 * 60_000) {
    await finishDeployment(deployment, 'timed_out', 'Coolify deployment exceeded 45 minutes.');
    return true;
  }

  const response = await fetch(
    `${coolifyUrl}/api/v1/deployments/${encodeURIComponent(deployment.provider_deployment_id)}`,
    { headers: coolifyHeaders, signal: AbortSignal.timeout(20_000) }
  );
  if (!response.ok) throw new Error(`coolify_status_${response.status}`);
  const payload = (await response.json()) as { status?: string };
  const status = coolifyStatus(payload.status ?? 'running');
  if (status === 'running') return false;
  await finishDeployment(
    deployment,
    status,
    status === 'succeeded' ? null : `Coolify status: ${payload.status ?? status}`
  );
  return true;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!serviceKey || token !== serviceKey) return json({ error: 'service_role_required' }, 401);
  if (!coolifyUrl || !coolifyToken || !siteUuid) {
    return json({ error: 'coolify_configuration_missing' }, 503);
  }

  try {
    const { data: activeRows, error: activeError } = await db
      .from('public_site_deployments')
      .select('id, provider_deployment_id, status, created_at')
      .in('status', ['queued', 'running'])
      .order('created_at')
      .limit(1);
    if (activeError) throw activeError;
    const active = activeRows?.[0] as Deployment | undefined;
    if (active && !(await reconcile(active))) {
      return json({ ok: true, deployment_id: active.id, status: active.status });
    }

    const { data: claim, error: claimError } = await db.rpc('claim_public_site_deployment');
    if (claimError) throw claimError;
    if (!claim) return json({ ok: true, status: 'idle' });
    const deploymentId = (claim as { deployment_id: string }).deployment_id;
    const deployment: Deployment = {
      id: deploymentId,
      provider_deployment_id: null,
      status: 'queued',
      created_at: new Date().toISOString(),
    };

    const deployResponse = await fetch(`${coolifyUrl}/api/v1/deploy`, {
      method: 'POST',
      headers: { ...coolifyHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: siteUuid, force: true }),
      signal: AbortSignal.timeout(20_000),
    });
    const deployPayload = (await deployResponse.json().catch(() => ({}))) as {
      deployments?: Array<{ deployment_uuid?: string }>;
      deployment_uuid?: string;
      message?: string;
    };
    const providerId =
      deployPayload.deployments?.[0]?.deployment_uuid ?? deployPayload.deployment_uuid ?? null;
    if (!deployResponse.ok || !providerId) {
      const message = deployPayload.message ?? `coolify_deploy_${deployResponse.status}`;
      await finishDeployment(deployment, 'failed', message);
      return json({ error: message, deployment_id: deploymentId }, 502);
    }

    const { error: updateError } = await db
      .from('public_site_deployments')
      .update({
        provider_deployment_id: providerId,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', deploymentId);
    if (updateError) throw updateError;
    return json({ ok: true, deployment_id: deploymentId, provider_deployment_id: providerId });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'site_deploy_failed' }, 500);
  }
});
