# GPT Usage Reset Signal

Public monitor for ChatGPT / Codex usage-reset signals.

This repository monitors public posts from Tibo (@thsottiaux) through FxEmbed, classifies reset-related announcements, and publishes a machine-readable status projection for use by browser extensions and other clients.

## Architecture

```text
Tibo public X posts
      ↓
FxEmbed
      ↓
GitHub Actions
      ↓
event classification
      ↓
monitor-state/status.json
      ↓
AI Usage Sidebar / other clients
```

The default source is FxEmbed, so the monitor does not require an X login, X cookies, or an X API token.

Runtime state is written to the `monitor-state` branch. The public consumer endpoint is:

```text
https://raw.githubusercontent.com/aminoacid72/GPT-usage-reset-signal/monitor-state/status.json
```

## Attribution and license

This project is an independent derivative of:

- [AllenXiao95/codex-reset-signal](https://github.com/AllenXiao95/codex-reset-signal)
- which identifies [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal) as an earlier upstream project

The upstream MIT license and copyright notice are preserved verbatim in [LICENSE](LICENSE). This repository continues to be distributed under the MIT License.

This project is unofficial and is not affiliated with or endorsed by OpenAI, X, FxEmbed, AllenXiao95, or UynajGI.

## Defaults

- X account: `@thsottiaux`
- source provider: `fxembed`
- keyword: `reset`
- display timezone: `Asia/Taipei`
- GitHub Actions schedule: approximately every 5 minutes

## Development

Core monitoring and event-classification code is derived from the upstream project and will be modified for this repository's usage-reset requirements.

## License

MIT. See [LICENSE](LICENSE).
