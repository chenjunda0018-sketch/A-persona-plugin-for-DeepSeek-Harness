import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { SessionId } from '@deepseek-ai/dsh-session'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as Yayan from '@deepseek-ai/dsh-plugin-yayan'

/** The user's verbatim input; every wire assertion compares against exactly these bytes. */
const USER_TEXT = '帮我看下这段代码哪里有 bug：for (const i = 0; i < n; i--) {}'

/** One wire chat-completions message as the mock provider parsed it. */
interface WireMessage {
  role: string
  content: unknown
}

let context: Context | undefined
const servers: MockLlmServer[] = []

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  await Promise.all(servers.splice(0).map(server => server.close()))
  vi.unstubAllEnvs()
})

async function mockServer(): Promise<MockLlmServer> {
  const server = await startMockLlmServer({ sequence: ['success'], repeatLast: true, successText: '收到，这就去看。' })
  servers.push(server)
  return server
}

async function harness(baseURL: string): Promise<Context> {
  vi.stubEnv('DEEPSEEK_API_KEY', 'mock-key')
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(LlmDeepSeek, { baseURL })
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx
}

/** Drain one hand-built request and return the provider's parsed body, re-serialized byte-for-byte. */
async function wireBody(ctx: Context, server: MockLlmServer): Promise<string> {
  const system = renderPrompt(await ctx.systemPrompt.assemble())
  const assembler = new BlockAssembler()
  const request = {
    provider: 'deepseek-official',
    model: 'mock-model',
    messages: [createUserMessage({ content: [{ type: 'text', text: USER_TEXT }], source: { kind: 'user' } })],
    system,
  }
  for await (const chunk of ctx.llm.stream(request)) assembler.push(chunk)
  return JSON.stringify(server.requests.at(-1)?.body)
}

describe('the yayan style row on the provider wire', () => {
  it('carries the injected directive in the system layer of the request the provider receives', async () => {
    const server = await mockServer()
    context = await harness(server.baseURL)
    await context.plugin(Yayan, { persona: 'maoyu' })

    const agent = context.agentLoop.create(SessionId('yayan-wire'), { provider: 'deepseek-official', model: 'mock-model' })
    const idle = agent.whenIdle()
    agent.followup(createUserMessage({ content: [{ type: 'text', text: USER_TEXT }], source: { kind: 'user' } }))
    await idle

    const body = server.requests[0]?.body as { messages: WireMessage[] }
    expect(body.messages.length).toBeGreaterThan(0)

    // The directive rides in the leading system message — the system layer.
    const [systemWire, ...rest] = body.messages
    expect(systemWire?.role).toBe('system')
    expect(String(systemWire?.content)).toContain('句尾都必须带上「喵」')

    // Injection only: no other wire message carries the directive, and the
    // user's input reaches the provider inside its own message, verbatim.
    for (const message of rest) {
      expect(JSON.stringify(message)).not.toContain('人格设定')
    }
    const userWire = rest.filter(message => message.role === 'user').at(-1)
    expect(String(userWire?.content)).toContain(USER_TEXT)

    // The session history the interface renders is untouched, too.
    const loggedUser = agent.session.deriveMessages().find(message => message.role === 'user')
    expect(loggedUser?.content.filter(block => block.type === 'text').map(block => block.text).join('')).toBe(USER_TEXT)
  })

  it('restores the provider request body byte-for-byte once the row is disabled', async () => {
    const server = await mockServer()
    context = await harness(server.baseURL)

    // Baseline captured with the plugin absent, exactly as if never installed.
    const baseline = await wireBody(context, server)

    const fiber = await context.plugin(Yayan, { persona: 'dongbei' })
    const injected = await wireBody(context, server)
    expect(injected).not.toBe(baseline)
    expect(injected).toContain('东北老铁')

    await fiber.dispose()
    const restored = await wireBody(context, server)
    expect(restored).toBe(baseline)
  })
})
