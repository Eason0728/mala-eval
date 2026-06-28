# 計時同仁評鑑系統

計時同仁「態度 30 分」評鑑網頁 App：同仁匿名互評 → 自動算態度分 → 主管調整 → 查時薪。架構已預留職能 70 分擴充。

## 正式網址（已上線）

- **同仁互評 ＋ 主管管理（同一頁）**：https://eason0728.github.io/mala-eval/
  - 同仁進來直接填互評；主管點頁面底部「主管登入」輸入通行碼即進管理區。
  - （舊網址 `admin.html` 會自動轉址到首頁。）
- 程式碼 repo：https://github.com/Eason0728/mala-eval
- 後端資料：Google Sheet（含「設定」分頁，可改名單／題目／時薪／通行碼）

- 前端：GitHub Pages 靜態頁（`index.html` 互評、`admin.html` 管理）
- 後端：Google Apps Script Web App（`apps-script/Code.gs`）
- 資料庫：Google Sheet
- 計分唯一來源：`js/scoring.js`（Apps Script 不重算分數）

設計與計畫文件見 `docs/superpowers/`。

---

## 一、建立 Google Sheet 並一鍵安裝

1. 開新的 Google 試算表（在瀏覽器網址列輸入 `sheets.new`）。
2. 選「擴充功能 → Apps Script」。
3. 把 `apps-script/Code.gs` 內容整段貼進去，存檔。
4. 編輯器上方函式選單選 **`setupSheet`**，按 **執行**；第一次會跳授權，依指示允許。
   - 完成後會自動建立 4 個分頁、標題列、5 個命名範圍，並把 **6 題態度題與受評名單**填好。
5. 回試算表的「設定」分頁，**改掉通行碼（B2）** 與 **時薪對照表（A24:C28）** 為實際數字。

> 6 題態度題的 5→1 星描述已沿用現有 Google 表單文字，自動填入，不需手打。

---

## 二、部署 Apps Script 為網頁應用程式

1. 在 Apps Script 編輯器「部署 → 新增部署作業 → 類型：網頁應用程式」。
   - 執行身分：**我自己**
   - 誰可以存取：**所有人**
2. 授權後取得 Web App URL（以 `/exec` 結尾），複製。

> **每次修改 `Code.gs` 後**，要「部署 → 管理部署作業 → 編輯 → 版本：新版本」才會生效。

部署 URL：`______________________`（貼在這裡備查）

---

## 三、設定前端

把上一步的 URL 填入 `js/config.js`：

```js
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

---

## 四、發布到 GitHub Pages

1. 建立 GitHub repo，推送本專案。
2. Settings → Pages → Branch 選 `main`（或部署分支）、根目錄 → 儲存。
3. 互評連結：`https://<帳號>.github.io/<repo>/`
4. 管理連結：`https://<帳號>.github.io/<repo>/admin.html`

---

## 五、測試與驗收

```bash
node --test     # 計分/驗證/指紋單元測試（應全綠）
```

端到端驗收：
- 互評頁匿名填 2～3 份（不同裝置/瀏覽器）→「評分紀錄」累積。
- 管理頁輸入通行碼 → 總覽態度分＝互評平均加總、時薪查表正確；無互評者顯示「資料不足」。
- 主管調整 ±值 → 反映到最終總分；總分落在時薪表外顯示「需人工確認」。
- 防重：同裝置重送被擋、重整顯示「本季已完成」。

---

## 六、待回填 / 第二階段

- `CFG_items` 的 6 題完整行為描述、`CFG_wage` 時薪對照表、`CFG_passcode` 通行碼初值。
- **職能 70 分**：於 `設定` 加題項、把職能分寫入資料流；`結果` 與 `js/scoring.js`（`finalSubtotal` 的 `competency` 欄）已預留，接上不需改架構。
