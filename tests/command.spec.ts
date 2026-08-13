import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { FileSettingsProvider } from '@deepseek-ai/dsh-settings-file'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as Yayan from '@deepseek-ai/dsh-plugin-yayan'
import { YAYAN_SECTION } from '@deepseek-ai/dsh-plugin-yayan'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-yayan-command-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function harness(options: { settingsPath?: string } = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  if (options.settingsPath !== undefined) {
    await ctx.plugin(FileSettingsProvider, { path: options.settingsPath, watch: false })
  }
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(SystemPrompt, { persona: 'deployment identity' })
  await ctx.plugin(Yayan, { persona: 'wenyan' })
  return ctx
}

/** The commands executor's stand-in agent: a real session, no running loop. */
function agentOf(ctx: Context, name: string): Agent {
  const session = ctx.sessions.create(SessionId(name))
  return { id: session.id, session } as Agent
}

/** The directive text the next request would carry. */
async function directive(ctx: Context): Promise<string | undefined> {
  const assembly = await ctx.systemPrompt.assemble()
  return assembly.sections.find(section => section.name === YAYAN_SECTION)?.text
}

async function run(ctx: Context, agent: Agent, line: string) {
  const execution = await ctx.commands.execute(agent, line, new AbortController().signal)
  expect(execution).toBeDefined()
  return execution!.result
}

describe('the /yayan command', () => {
  it('reports the current style and switches the live directive without a settings store', async () => {
    const ctx = await harness()
    const agent = agentOf(ctx, 'no-store')

    expect(await directive(ctx)).toContain('文言雅士')
    expect((await run(ctx, agent, '/yayan')).kind).toBe('success')
    expect((await run(ctx, agent, '/yayan')).text).toContain('wenyan')

    const switched = await run(ctx, agent, '/yayan dongbei')
    expect(switched.kind).toBe('success')
    expect(switched.text).toContain('until this process exits')

    const text = await directive(ctx)
    expect(text).toContain('东北老铁')
    expect(text).not.toContain('文言雅士')
  })

  it('rejects an unknown style argument and keeps the current directive', async () => {
    const ctx = await harness()
    const agent = agentOf(ctx, 'unknown')

    const rejected = await run(ctx, agent, '/yayan pirate')
    expect(rejected.kind).toBe('error')
    expect(rejected.text).toContain('Unknown persona "pirate"')

    expect(await directive(ctx)).toContain('文言雅士')
  })

  it('persists the switch through the settings store and applies it to the next assembly', async () => {
    const dir = await tempDir()
    const path = join(dir, 'settings.yaml')
    const ctx = await harness({ settingsPath: path })
    const agent = agentOf(ctx, 'persisted')

    const switched = await run(ctx, agent, '/yayan maoyu')
    expect(switched.kind).toBe('success')
    expect(switched.text).toContain('persisted')

    expect(await readFile(path, 'utf8')).toContain('maoyu')
    expect(await directive(ctx)).toContain('句尾都必须带上「喵」')
    expect((await run(ctx, agent, '/yayan')).text).toContain('maoyu')
  })

  it('reports a failure to persist as an error result and keeps the current directive', async () => {
    const dir = await tempDir()
    // The document's parent is a regular file, so the atomic write cannot land.
    await writeFile(join(dir, 'blocker'), 'not a directory')
    const ctx = await harness({ settingsPath: join(dir, 'blocker', 'settings.yaml') })
    const agent = agentOf(ctx, 'failing-store')

    const failed = await run(ctx, agent, '/yayan dongbei')
    expect(failed.kind).toBe('error')
    expect(failed.text).toContain('Could not persist persona dongbei')

    expect(await directive(ctx)).toContain('文言雅士')
  })
})
