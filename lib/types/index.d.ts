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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Section name this row owns in the prompt registry. */
export declare const YAYAN_SECTION = "yayan:persona";
/**
 * Render order: after the deployment persona (`0`), before tool guidance
 * (`100`–`199`), so the directive rides with identity rather than tools.
 */
export declare const YAYAN_ORDER = 50;
/** One built-in persona. */
export type Persona = 'wenyan' | 'dongbei' | 'maoyu';
/** Cordis plugin name. */
export declare const name = "plugin-yayan";
/** The prompt registry this row contributes to. */
export declare const inject: string[];
/** Plugin config: which built-in persona to inject. */
export interface Config {
    /** Built-in persona; omitted config resolves to {@link DEFAULT_PERSONA}. */
    persona?: Persona;
}
/** Runtime schema for the persona row. */
export declare const Config: z<Config>;
/**
 * Register the persona directive and its `/yayan` switch for the mounting
 * context's scope.
 * @param ctx - context exposing the prompt registry.
 * @param config - the built-in persona whose directive this row contributes.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map