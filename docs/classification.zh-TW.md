# Reset 訊號判讀規則

本文件說明 `src/events.ts` 的判讀目的與主要規則。實際執行以程式碼與測試為準。

## 1. 資料來源

監控器由 FxEmbed 取得 Tibo（@thsottiaux）的公開貼文，只將 Tibo 本人發布的內容正規化為待判讀貼文。

每筆貼文至少保留：

- X 貼文 ID
- 原文
- 發文時間
- 原始 X URL
- 必要的媒體資訊

## 2. 是否為 reset 訊號

只有含有 `reset` / `resets` / `resetting` 等關鍵字的內容會進入 reset 判讀。

另外會排除明顯與使用額度無關的語境，例如 password、factory、router、database reset。

## 3. 狀態分類

### completed

表示貼文明確描述重置已完成，例如：

- reset completed
- reset done
- reset propagated
- reset applied
- reset landed
- all reset

若無更精確的完成時間，會使用貼文發文時間作為 `observed` 時間；這只代表「Tibo 在此時公告已完成」，不代表每個帳戶實際到帳時間完全相同。

### scheduled

表示貼文明確承諾未來會重置，而且時間解析器可以安全取得：

- 明確時間
- 時間範圍
- 日期

例如 tomorrow 10am PST、within 2 hours、by midnight today。

### announced

表示已形成明確重置承諾，但無法安全取得時間。

### uncertain / mention

包括：

- 問句
- 希望、可能、假設
- 否定
- 請求
- 一般聊天提到 reset
- 無法確認是否真的會執行的內容

此類資料可以保留在監控狀態中，但不應直接視為已確認的 Global Reset。

## 4. 時間解析

時間解析由 `chrono-node` 與 `luxon` 協助處理，並刻意採保守策略。

輸出種類：

- `exact`：單一可確定時間。
- `window`：時間範圍。
- `date`：只有日期。
- `observed`：完成事件使用公告發文時間。
- `unknown`：無法安全判定。

若原文未提供足夠時區資訊、同一句包含多個候選時間、或存在歧義，原則上輸出 `unknown`，不自行猜測。

## 5. 公開輸出

`src/public-status.ts` 會將內部狀態整理為 `monitor-state/status.json`，主要包含：

- monitor：監控器最後檢查與成功時間
- latestObservedPost：最近觀察到的 Tibo 貼文
- latest.reset：最近的 reset 訊號
- latest.bankCredit：最近的 bank credit 訊號
- recent：最近的訊號清單

瀏覽器擴充功能可以再依自己的顯示需求，從這份 JSON 做第二層篩選。

## 6. 回歸測試

`tests/` 內保存真實或代表性的句型，避免修正某一種說法後破壞其他既有判讀。

新增判讀規則時，應同步增加 regression test。
