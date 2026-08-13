import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { describe, expect, it } from 'vitest'
import * as Yayan from '@deepseek-ai/dsh-plugin-yayan'
import { YAYAN_ORDER, YAYAN_SECTION } from '@deepseek-ai/dsh-plugin-yayan'

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, { persona: 'deployment identity' })
  return ctx
}

/** The rendered text of the yayan section, or undefined once unmounted. */
async function personaText(ctx: Context): Promise<string | undefined> {
  const assembly = await ctx.systemPrompt.assemble()
  return assembly.sections.find(section => section.name === YAYAN_SECTION)?.text
}

/** One built-in persona, the substring only its directive carries, and the others' markers. */
const ROUTES = [
  { persona: 'wenyan', marker: '文言雅士', others: ['东北老铁', '「喵」'] },
  { persona: 'dongbei', marker: '东北老铁', others: ['文言雅士', '「喵」'] },
  { persona: 'maoyu', marker: '句尾都必须带上「喵」', others: ['文言雅士', '东北老铁'] },
] as const

describe('the yayan persona row', () => {
  it('routes each configured persona to its own directive', async () => {
    for (const route of ROUTES) {
      const ctx = await harness()

      await ctx.plugin(Yayan, { persona: route.persona })

      const text = await personaText(ctx)
      expect(text, route.persona).toContain(route.marker)
      for (const other of route.others) {
        expect(text, route.persona).not.toContain(other)
      }
    }
  })

  it('defaults to the classical persona when the config omits it', async () => {
    const ctx = await harness()

    await ctx.plugin(Yayan, {})

    expect(await personaText(ctx)).toContain('文言雅士')
  })

  it('rejects an unknown persona at load', async () => {
    const ctx = await harness()

    await expect(ctx.plugin(Yayan, { persona: 'pirate' } as never)).rejects.toThrow(/but got "pirate"/)
  })

  it('renders after the deployment persona, before later sections', async () => {
    const ctx = await harness()
    ctx.systemPrompt.section({ name: 'global:guidance', order: 100, text: 'global guidance' })

    await ctx.plugin(Yayan, { persona: 'wenyan' })

    // The pinned order is the contract: persona (0) < this row < tool guidance (100–199).
    expect(YAYAN_ORDER).toBeGreaterThan(0)
    expect(YAYAN_ORDER).toBeLessThan(100)
    const rendered = renderPrompt(await ctx.systemPrompt.assemble())
    expect(rendered.indexOf('deployment identity')).toBeLessThan(rendered.indexOf('人格设定'))
    expect(rendered.indexOf('人格设定')).toBeLessThan(rendered.indexOf('global guidance'))
  })

  it('removes the section when its fiber unloads, restoring the rendered prompt', async () => {
    const ctx = await harness()
    const baseline = renderPrompt(await ctx.systemPrompt.assemble())

    const fiber = await ctx.plugin(Yayan, { persona: 'maoyu' })
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('句尾都必须带上「喵」')

    await fiber.dispose()

    expect(await personaText(ctx)).toBeUndefined()
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toBe(baseline)
  })
})
