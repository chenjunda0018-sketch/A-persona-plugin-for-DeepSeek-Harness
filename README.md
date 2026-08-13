# dsh-plugin-yayan · 人格插件

[English](#english) | 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的人格插件：开启之后，AI 的所有回复自动切换"人格"。内置 **文言雅士**、**东北老铁**、**会说人话的猫**（每个句子的句尾都必须带"喵"）三种人格，可在配置中切换，也可以在 Web 界面里用 `/yayan` 命令实时切换。

```text
用户：帮我看看这段代码哪里有 bug？

猫咪人格下的回复：
这个循环写反了喵。i 是从 0 开始往上加的，可是条件写成了 i > n 喵，
所以一次都进不去喵。把 > 改成 < 就能跑起来了喵。
```

## 它是怎么工作的

DeepSeek Harness 在每次请求前都会组装系统提示（system prompt），再由适配器序列化为发往 provider 的请求体。本插件通过框架的提示注册表（`ctx.systemPrompt.section()`）注册一个有序段落，段落文本会作为请求体中**第一条 `role: 'system'` 消息**的一部分发给模型——你可以直接在 provider 收到的请求体里抓到这段注入的画风指令。

三条硬约束由机制保证，并有测试逐条验证：

| 约束 | 保证方式 |
|---|---|
| 用户的原始输入一字不改 | 插件只注册系统层段落，从不触碰 messages |
| 界面显示的历史消息不改 | 会话日志与本插件完全解耦 |
| 关闭后零残留 | 段落以可撤销 effect 注册，卸载即由注册表摘除，请求体逐字节复原 |

所有画风指令都要求代码、命令、文件路径、网址与专有名词保持原样，保证换画风之后的回复依然可执行。

## 安装

### 方式一：安装到某个 dsh profile（推荐）

```bash
dsh plugin --profile web add github:<your-name>/dsh-plugin-yayan
```

安装后默认关闭。编辑该 profile 的 `cordis.patch.yml`（或用户层的 `~/.dsh/profiles/<name>/cordis.patch.yml`），去掉 `disabled: true` 即开启：

```yaml
- insert:
    - id: yayan
      name: '@deepseek-ai/dsh-plugin-yayan'
      disabled: true # 删除本行或改为 false 即开启
      config:
        persona: maoyu
```

### 方式二：放进 deepseek-harness 源码工作区

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cp -r dsh-plugin-yayan deepseek-harness/packages/preset/plugin-yayan
cd deepseek-harness
pnpm install && pnpm run build
```

随后在任意 profile 的 patch 层里加上与方式一相同的 insert 行。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `persona` | `wenyan` | 注入哪种内置人格：`wenyan`（文言雅士）、`dongbei`（东北老铁）或 `maoyu`（会说人话的猫） |

`persona` 是组合层的基础值；`/yayan` 命令的切换在运行期覆盖它。

## `/yayan` 命令：在页面里切换

插件向宿主注册了一条斜杠命令，Web 输入框中键入 `/` 即可在弹窗中看到它：

| 输入 | 效果 |
|---|---|
| `/yayan` | 查看当前画风 |
| `/yayan maoyu` | 切换到猫咪人格，自下一个请求起生效 |
| `/yayan wenyan` / `/yayan dongbei` | 切换到文言雅士 / 东北老铁 |
| `/yayan pirate` | 报错并列出合法选项，画风不变 |

组合了设置服务（dsh 默认组合）时，切换会持久化到 `~/.dsh/settings.yaml` 的 `plugin-yayan` 命名空间，重启后保持；没有设置服务时自动退化为进程内切换。切换结果以消息流的形式显示在会话里。

## 测试

`tests/` 下共 11 条单元测试，全部通过，覆盖三条关键路径：

- **开启时请求体含注入指令** —— 起 HTTP mock server 走真实 DeepSeek 适配器，从 provider 实际收到的请求体中抓到注入文本，同时断言用户消息逐字未改、会话历史未动；
- **关闭时请求体逐字节不变** —— 对照"从未安装"与"挂载后卸载"两种状态，序列化后的请求体完全一致；
- **三种人格正确路由** —— 每种人格的卡片文本互斥命中，非法取值在加载时即被 schema 拒绝；
- **`/yayan` 命令** —— 切换即时生效、写入落盘、持久化失败时回退并报错。

在 deepseek-harness 工作区内运行：`pnpm vitest run packages/preset/plugin-yayan`。

## 目录结构

```text
├── src/
│   ├── index.ts        # 插件本体：人格卡、提示段落注册、/yayan 命令、设置持久化
│   └── invariant.ts    # 包不变量伴随文件（dsh 包规范要求）
├── tests/              # vitest 单元测试（3 个文件 11 条用例）
├── lib/                # 构建产物（随仓库分发，git 安装可直接使用）
├── cordis.patch.yml    # bundle 安装方式的默认 patch 层（默认 disabled）
├── package.json
└── LICENSE             # MIT
```

## 说明

- 包名沿用 deepseek-harness 插件生态的 `@deepseek-ai/dsh-*` 约定；如果你要发布自己的分支，请同步修改 `package.json` 中的 `name` 与 `repository`。
- 人格卡是提示文本，属于引导而非强制：模型在极少数情况下（如 provider 拒答路径）可能掉回原人格。

## License

[MIT](LICENSE)

---

<a id="english"></a>

# dsh-plugin-yayan (English)

A persona plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): once enabled, every model reply follows a selectable persona — a Classical Chinese scholar (`wenyan`), a warm-hearted Northeastern buddy (`dongbei`), or a talking cat (`maoyu`, every sentence ends with 喵). Switch personas in config or live from the web composer via the `/yayan` command.

The plugin injects exactly one ordered section through the harness prompt registry, so the persona card rides in the leading `role: 'system'` message of the request body the provider receives. User messages and session history are never touched; unloading the row restores request bodies byte-for-byte. Every persona card keeps code, commands, paths, and URLs verbatim so a persona's replies stay executable.

Install into a profile with `dsh plugin --profile web add github:<your-name>/dsh-plugin-yayan` (disabled by default — drop the `disabled` field to enable), or drop the package into `packages/preset/plugin-yayan` of a harness checkout. MIT licensed.
