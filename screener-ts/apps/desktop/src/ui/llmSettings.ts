/**
 * The assistant's connection dialog: provider, key, model, and the prices used
 * for the cost estimate.
 *
 * ── WHY THE MODEL LIST IS FETCHED, NOT LISTED ───────────────────────────────
 * Whatever this file believed about model names would be wrong within months, and
 * a stale default 404s on the first message. So when a key is present the dialog
 * asks the provider what the account can actually run and offers exactly that. No
 * key yet, or the list did not load, and the field becomes free text — a typed id
 * still works, and refusing to open would be worse.
 *
 * ── WHY CHANGING PROVIDER REOPENS THE DIALOG ────────────────────────────────
 * Every other field belongs to the provider: its key, its models, its endpoint.
 * `formDialog` is built and populated once (it cannot fetch mid-edit), so the
 * honest behaviour is to save the choice and reopen against that provider — and
 * to SAY SO the moment the dropdown changes, which the live info line does.
 */
import {
  LLM_PROVIDERS,
  findProvider,
  seededPrices,
  type LlmConfig,
  type LlmProviderId,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { t, getLang } from './i18n.js';
import { formDialog, type Field } from './forms.js';
import {
  loadLlmConfig,
  saveLlmConfig,
  getApiKey,
  setApiKey,
  listModels,
  testConnection,
  isConfigured,
} from '../ai/llmClient.js';

/** Subscribers that want to repaint when the connection changes. */
const listeners: Array<() => void> = [];
export function onLlmConfigChange(cb: () => void): void {
  listeners.push(cb);
}
function announce(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* a listener must never break the dialog */
    }
  }
}

const DEFAULT_CONFIG: LlmConfig = { providerId: 'openai', model: '' };

/** A number the user typed, or undefined for "unknown" — never a guessed 0. */
function optionalNumber(raw: string | undefined): number | undefined {
  const v = Number((raw ?? '').trim());
  return (raw ?? '').trim() && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** The provider's own note plus the links worth having in reach. */
function providerBlurb(providerId: string): string {
  const p = findProvider(providerId);
  if (!p) return '';
  const vi = getLang() === 'vi';
  const bits: string[] = [];
  if (p.note) bits.push(vi ? p.note.vi : p.note.en);
  if (p.trainsOnFreeTier && !p.note) {
    bits.push(
      vi
        ? 'Bậc miễn phí có thể dùng dữ liệu của bạn để huấn luyện.'
        : 'The free tier may train on the data you send.',
    );
  }
  const links: string[] = [];
  if (p.keysUrl)
    links.push(`<a href="${p.keysUrl}" target="_blank" rel="noopener">${t('ai.getkey')} ↗</a>`);
  if (p.pricingUrl)
    links.push(`<a href="${p.pricingUrl}" target="_blank" rel="noopener">${t('ai.pricing')} ↗</a>`);
  if (links.length) bits.push(links.join(' · '));
  return bits.join('<br>');
}

/**
 * Open the dialog. Loops rather than recursing, so switching provider three times
 * does not build a stack of half-finished dialogs.
 */
export async function openLlmSettings(ctx: AppContext): Promise<void> {
  let cfg: LlmConfig = (await loadLlmConfig(ctx)) ?? DEFAULT_CONFIG;
  if (!findProvider(cfg.providerId)) cfg = { ...DEFAULT_CONFIG };

  for (;;) {
    const provider = findProvider(cfg.providerId)!;
    const key = await getApiKey(ctx, cfg.providerId);

    // Only worth asking when there is something to authenticate with. Providers
    // that need no key (a local model) are asked too — that is where the list is
    // most useful, since only the machine itself knows what is pulled.
    const models = key || !provider.keyRequired ? await listModels(cfg, key) : [];
    const seeded = seededPrices(cfg);

    const fields: Field[] = [
      {
        key: 'provider',
        label: t('ai.provider'),
        type: 'select',
        value: cfg.providerId,
        options: LLM_PROVIDERS.map((p) => ({ value: p.id, label: p.label })),
      },
    ];

    if (provider.keyRequired || !provider.directOnly) {
      fields.push({
        key: 'apikey',
        label: t('ai.key'),
        // Shown in the clear on purpose: it is stored in the clear either way, and a
        // masked field turns "is my key still here?" into a guess. Empty clears it.
        value: key,
        placeholder: t('ai.key.placeholder'),
      });
    }
    if (provider.baseUrlRequired) {
      fields.push({
        key: 'baseurl',
        label: t('ai.baseurl'),
        value: cfg.baseUrl ?? provider.upstream,
        // The example, not `upstream`, so a provider with no default host still shows
        // the SHAPE of what is wanted — the API root ending in /v1, not the
        // /chat/completions URL, which is the mistake this placeholder prevents.
        placeholder: provider.baseUrlExample ?? provider.upstream,
      });
      // Only asked where it cannot be known: behind a user-supplied endpoint there is
      // no way to tell which name the models accept, and the wrong one 400s every
      // call. A vendor we route to directly has this pinned in the registry.
      fields.push({
        key: 'tokenfield',
        label: t('ai.tokenfield'),
        type: 'select',
        value: cfg.tokenLimitField ?? 'max_tokens',
        options: [
          { value: 'max_tokens', label: 'max_tokens' },
          { value: 'max_completion_tokens', label: 'max_completion_tokens' },
        ],
      });
    }

    if (models.length) {
      // The current model may be absent from the list (renamed, or region-gated).
      // Keep it as an option regardless, so opening the dialog cannot silently
      // switch a working configuration to something else.
      const options = (cfg.model && !models.includes(cfg.model) ? [cfg.model, ...models] : models).map(
        (m) => ({ value: m, label: m }),
      );
      fields.push({
        key: 'model',
        label: t('ai.model'),
        type: 'select',
        value: cfg.model || options[0]!.value,
        options,
      });
    } else {
      fields.push({
        key: 'model',
        label: t('ai.model.manual'),
        value: cfg.model,
        placeholder: 'gpt-5',
      });
    }

    fields.push(
      {
        key: 'pin',
        label: t('ai.price.in'),
        type: 'number',
        value: cfg.inputPerMTok?.toString() ?? '',
        placeholder: seeded.input?.toString() ?? '—',
      },
      {
        key: 'pout',
        label: t('ai.price.out'),
        type: 'number',
        value: cfg.outputPerMTok?.toString() ?? '',
        placeholder: seeded.output?.toString() ?? '—',
      },
      { key: 'blurb', type: 'info', label: '', value: providerBlurb(cfg.providerId) },
      {
        key: 'help',
        type: 'info',
        label: '',
        // The Ask ChatGPT reminder only appears while there is no key: the point of
        // saying it is that the app is useful before you pay for anything.
        value: `${t('ai.key.local')}<br><br>${t('ai.price.help')}${
          key ? '' : `<br><br>${t('ai.free')}`
        }`,
      },
    );

    const res = await formDialog(t('ai.settings.title'), fields, {
      onChange: (values) =>
        values.provider !== cfg.providerId ? { blurb: t('ai.provider.switch') } : undefined,
    });
    if (!res) return; // cancelled — nothing saved, including the provider choice

    // Provider switched: persist just that, then reopen so the key, the model list
    // and the endpoint all belong to the provider now selected.
    if (res.provider !== cfg.providerId) {
      cfg = { providerId: res.provider as LlmProviderId, model: '' };
      await saveLlmConfig(ctx, cfg);
      continue;
    }

    if (res.apikey !== undefined) await setApiKey(ctx, cfg.providerId, res.apikey);

    cfg = {
      providerId: cfg.providerId,
      model: (res.model ?? '').trim(),
      ...(provider.baseUrlRequired && res.baseurl ? { baseUrl: res.baseurl.trim() } : {}),
      ...(provider.baseUrlRequired && res.tokenfield === 'max_completion_tokens'
        ? { tokenLimitField: 'max_completion_tokens' as const }
        : {}),
      ...(optionalNumber(res.pin) !== undefined ? { inputPerMTok: optionalNumber(res.pin) } : {}),
      ...(optionalNumber(res.pout) !== undefined ? { outputPerMTok: optionalNumber(res.pout) } : {}),
    };
    await saveLlmConfig(ctx, cfg);
    announce();

    // A key was just entered but no model could be listed before: try again now, so
    // the user is not sent round the dialog a second time to pick one.
    const newKey = await getApiKey(ctx, cfg.providerId);
    if (!cfg.model && (newKey || !provider.keyRequired)) {
      const found = await listModels(cfg, newKey);
      if (found.length) continue; // reopen, this time with a populated dropdown
    }
    if (!cfg.model) {
      alert(t('ai.model.missing'));
      return;
    }
    if (!newKey && provider.keyRequired) return; // key removed on purpose: nothing to test

    await reportProbe(cfg, newKey);
    return;
  }
}

/**
 * Test the saved configuration and say what happened.
 *
 * The provider's own error text is appended for the two verdicts where it is
 * actionable: "no access to that model" and "unreachable" both have upstream
 * detail that turns a shrug into a fix. It cannot contain the key — the key is
 * only ever a request header.
 */
async function reportProbe(cfg: LlmConfig, apiKey: string): Promise<void> {
  const r = await testConnection(cfg, apiKey);
  switch (r.verdict) {
    case 'ok':
      alert(`${t('ai.test.ok')}  ${cfg.model}`);
      return;
    case 'bad-key':
      alert(t('ai.test.badkey'));
      return;
    case 'no-access':
      alert(`${t('ai.test.noaccess')}\n\n${r.detail ?? ''}`.trim());
      return;
    case 'unreachable':
      alert(`${t('ai.test.unreachable')}\n\n${r.detail ?? ''}`.trim());
      return;
  }
}

/** Whether a usable connection is configured, for badges elsewhere in the UI. */
export async function llmStatus(
  ctx: AppContext,
): Promise<{ configured: boolean; label: string | null }> {
  const cfg = await loadLlmConfig(ctx);
  if (!cfg) return { configured: false, label: null };
  const key = await getApiKey(ctx, cfg.providerId);
  // Deliberately `isConfigured` rather than a second copy of the same three checks:
  // this badge and the chat panel disagreeing about whether the assistant is ready is
  // exactly the bug a duplicated rule produces.
  const configured = isConfigured(cfg, !!key);
  return { configured, label: configured ? cfg.model : null };
}
