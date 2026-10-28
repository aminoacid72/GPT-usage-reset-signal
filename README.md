# GPT Usage Reset Signal

以公開資料監控 ChatGPT / Codex 使用額度重置（reset）訊號，主要供本人的 AI Usage Sidebar 使用。

本專案會透過 FxEmbed 讀取 Tibo（@thsottiaux）的公開 X 貼文，並以 codex-resets.com 的公開 status API 補強 scheduled／watch／completed 訊號；兩者整理後產生可供瀏覽器擴充功能讀取的 `status.json`。FxEmbed/X 仍是獨立備援來源，codex-resets.com 失效時不會中斷監控。

> 本專案為非官方工具，與 OpenAI、X、FxEmbed、AllenXiao95 或 UynajGI 均無隸屬或背書關係。

## 運作方式

```text
Tibo 的公開 X 貼文          codex-resets.com
        ↓                         ↓
      FxEmbed               status API 補強
        └──────────┬──────────────┘
                   ↓
              GitHub Actions
   約每 5 分鐘執行
        ↓
   重置訊號判讀
        ↓
monitor-state/status.json
        ↓
AI Usage Sidebar / 其他讀取端
```

預設原始貼文來源為 FxEmbed，因此不需要登入 X，也不需要保存 X Cookie 或 X API Token。codex-resets.com 僅作為免 API key 的補強來源；其資料為社群自動分類，並非 OpenAI 官方承諾。

公開 JSON：

```text
https://raw.githubusercontent.com/aminoacid72/GPT-usage-reset-signal/monitor-state/status.json
```

執行狀態與公開輸出放在獨立的 `monitor-state` branch；程式碼本體放在 `main`。

公開 JSON 另提供 `resetHint`：優先為明確的 scheduled reset，其次為 active watch 的推測時間窗，再其次為最近 48 小時內已完成的 regular reset。banked reset 不會被當成自動 usage reset。

使用 codex-resets.com 資料時，顯示端應保留來源標示與連結：https://codex-resets.com/

## 判讀概要

主要判讀邏輯位於 `src/events.ts`。

程式會把含有 reset 關鍵字的貼文拆成句子，依語意規則分成：

- `completed`：明確表示已完成重置，例如 reset completed、reset propagated、reset applied。
- `scheduled`：明確表示未來將重置，且可解析出時間、日期或時間範圍。
- `announced`：明確表示會重置，但無法安全判定時間。
- `uncertain` / `mention`：問句、假設、請求、否定、一般討論或其他不足以確認重置的文字。

時間解析會區分：

- `exact`：可確定單一時間。
- `window`：時間範圍。
- `date`：只能確定日期。
- `observed`：以公告發文時間作為「已完成」的觀察時間。
- `unknown`：無法安全解析，不自行捏造時間。

詳細規則請見 [docs/classification.zh-TW.md](docs/classification.zh-TW.md)。

## Repository 結構

- `.github/workflows/monitor.yml`：GitHub Actions 定時監控工作。
- `src/fxembed-client.ts`：向 FxEmbed 取得 Tibo 公開貼文。
- `src/events.ts`：reset 語意分類與時間解析核心。
- `src/monitor.ts`：整體監控流程、狀態更新與重新投影。
- `src/public-status.ts`：產生公開的 `status.json`。
- `src/feed.ts`：產生 RSS `feed.xml`。
- `src/state.ts`：保存游標、已看過貼文與監控狀態。
- `history/seed.json`：上游提供的歷史種子資料。
- `tests/`：判讀、FxEmbed、監控與公開輸出的回歸測試。
- `monitor-state` branch：執行中的 `state.json`、`status.json`、`feed.xml`。

## 預設設定

- 監控帳號：`@thsottiaux`
- 資料來源：`fxembed`
- 關鍵字：`reset`
- 顯示時區：`Asia/Taipei`
- GitHub Actions：大約每 5 分鐘執行一次

## 授權與來源

本專案是下列專案的獨立衍生版本：

- [AllenXiao95/codex-reset-signal](https://github.com/AllenXiao95/codex-reset-signal)
- 該專案另註明源自 [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal)

依原專案 MIT License 要求，本 repository 保留原始 MIT 授權與 copyright notice，完整內容見 [LICENSE](LICENSE)。

本專案仍以 MIT License 發布。

## License

MIT — see [LICENSE](LICENSE).
