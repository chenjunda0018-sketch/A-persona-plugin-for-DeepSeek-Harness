/**
 * A persona preset as a composable row.
 *
 * While mounted, this row contributes exactly one persona directive to the
 * system prompt layer, so every request the provider receives carries the
 * directive in its leading system message and the model answers in that
 * persona. The user's messages and the session history the interface renders
 * are never rewritten — the row injects a prompt section and nothing else.
 * Disposing the row removes the section through the prompt registry's own
 * disposal, restoring request bodies byte-for-byte.
 *
 * The persona is the row's config (`persona`), overridable at runtime through
 * the `/yayan` command: it persists under the `plugin-yayan` settings
 * namespace when a settings provider is composed and switches in memory
 * otherwise. Because the section text is evaluated at each assembly, a switch
 * applies to the next request without reloading the row.
 *
 * Like every opt-in row, it ships outside the deployment's default
 * composition: a deployment adds a `cordis.yml` row (optionally starting
 * `disabled: true`) to switch it on.
 *
 * @module @deepseek-ai/dsh-plugin-yayan
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Section name this row owns in the prompt registry. */
export const YAYAN_SECTION = 'yayan:persona'

/**
 * Render order: after the deployment persona (`0`), before tool guidance
 * (`100`–`199`), so the directive rides with identity rather than tools.
 */
export const YAYAN_ORDER = 50

/** One built-in persona. */
export type Persona = 'wenyan' | 'dongbei' | 'maoyu'

/**
 * The model-facing persona card each built-in contributes: an identity, its
 * speech register, and a quirk. Every card keeps code, commands, paths, URLs,
 * and proper nouns verbatim so a persona's reply stays executable.
 */
const PERSONA_DIRECTIVES: Readonly<Record<Persona, string>> = {
  wenyan: '人格设定：你是一位温文尔雅的文言雅士，自本条起以文言文作答，称谓古雅、行文简净。代码、命令、文件路径、网址与专有名词须保持原样，不得译改。',
  dongbei: '人格设定：你是一位热心肠的东北老铁，自本条起以东北话作答，语气热情直爽、接地气，像唠家常一样把事儿说明白。代码、命令、文件路径、网址与专有名词须保持原样，不得改写。',
  maoyu: '人格设定：你是一只能说人话的猫，自本条起以猫语作答，好奇亲人、偶尔想挠沙发，且每个句子的句尾都必须带上「喵」。代码、命令、文件路径、网址与专有名词须保持原样，不得改写。',
}

/** The persona an omitted config resolves to. */
const DEFAULT_PERSONA: Persona = 'wenyan'

/** The settings namespace the live persona persists under. */
const YAYAN_SETTINGS_NAMESPACE = settingsNamespace('plugin-yayan')

/** The personas the `/yayan` command accepts, in their documented order. */
const PERSONA_CHOICES = 'wenyan | dongbei | maoyu'

/** Whether one command argument names a built-in persona. */
function isPersona(value: string): value is Persona {
  return value === 'wenyan' || value === 'dongbei' || value === 'maoyu'
}

/** Cordis plugin name. */
export const name = 'plugin-yayan'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/** Plugin config: which built-in persona to inject. */
export interface Config {
  /** Built-in persona; omitted config resolves to {@link DEFAULT_PERSONA}. */
  persona?: Persona
}

/** Runtime schema for the persona row. */
export const Config: z<Config> = z.object({
  persona: z.union(['wenyan', 'dongbei', 'maoyu'] as const).default(DEFAULT_PERSONA),
})

/**
 * Register the persona directive and its `/yayan` switch for the mounting
 * context's scope.
 * @param ctx - context exposing the prompt registry.
 * @param config - the built-in persona whose directive this row contributes.
 */
export function apply(ctx: Context, config: Config): void {
  /** The persona this row starts from: explicit config resolved through the default. */
  const initial: Persona = config.persona ?? DEFAULT_PERSONA
  /** Composition entry: the settings base layer and the no-store fallback value. */
  const entry: Config = { persona: initial }
  /** Holder mutated by the command while no settings provider is composed. */
  const fallback: { persona: Persona } = { persona: initial }
  /** The section reads through this: the settings scope once mounted, else the fallback. */
  let source: () => Config = () => fallback

  installSettingsSection(ctx, YAYAN_SETTINGS_NAMESPACE, Config, entry, {
    setSource: (current) => {
      source = current
    },
    // The section text resolves `source` at each assembly, so nothing else derives.
    onChange: () => {},
  })

  ctx.effect(() => ctx.systemPrompt.section({
    name: YAYAN_SECTION,
    order: YAYAN_ORDER,
    text: () => PERSONA_DIRECTIVES[source().persona ?? DEFAULT_PERSONA],
  }), 'yayan.section()')

  // The command child activates only when a command registry is composed.
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'yayan',
      description: `Show or switch the persona (${PERSONA_CHOICES})`,
      input: { hint: `<${PERSONA_CHOICES}>` },
      handler: async ({ rawInput }): Promise<CommandResult> => {
        const requested = rawInput.trim()
        if (requested === '') {
          return { kind: 'success', text: `Persona: ${source().persona ?? DEFAULT_PERSONA} (${PERSONA_CHOICES}).` }
        }
        if (!isPersona(requested)) {
          return { kind: 'error', text: `Unknown persona "${requested}" (${PERSONA_CHOICES}).` }
        }
        const settings = commandCtx.get('settings')
        if (settings === undefined) {
          fallback.persona = requested
          return { kind: 'success', text: `Persona switched to ${requested} (until this process exits; no settings store is composed).` }
        }
        try {
          await settings.update(YAYAN_SETTINGS_NAMESPACE, { persona: requested })
          return { kind: 'success', text: `Persona switched to ${requested} (persisted).` }
        } catch (error) {
          return { kind: 'error', text: `Could not persist persona ${requested}: ${error instanceof Error ? error.message : String(error)}` }
        }
      },
    })
  })
}
