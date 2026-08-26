# operator quickstart — minpaku（民泊）

clone から「物件を登録し、予約を作り、決済を通す」までの手順。**下の各段は
2026-08-15 に実際に踏んで、出力をそのまま貼ってある**（node v26.3.0 / npm 11.16.0 /
pnpm 10.26.2 / macOS arm64）。踏んでいない段はそう明記した —— 読んだだけの手順と
走らせた手順を混ぜない。

作業ディレクトリは §1〜§4 とも:

```bash
cd kotoba
```

---

## 1. 依存を入れる —— 最初の罠はここ

```bash
npm install
```

**このマシンでは、そのままだと落ちる**（実測）:

```
npm error code 1
npm error git dep preparation failed
npm error npm error code EALLOWSCRIPTS
npm error npm error --allow-scripts is not allowed in project-scoped installs.
npm error npm error Add the entries to the "allowScripts" field in package.json, or to .npmrc, instead.
```

**原因はこの repo ではなく、ユーザーの `~/.npmrc` である。** `~/.npmrc` に
`allow-scripts[]=...` が 1 行でも在ると、npm 11 が git 依存を準備するために内側で
起動する install が「project-scoped install なのに `allow-scripts` がある」と判定して
自分で自分を拒否する。`package.json` には `prepare` script が無く、`--ignore-scripts`
を付けても**同じ場所で同じように落ちる**（実測）。

この repo は git 依存を 2 本持つ（`@etzhayyim/sdk` と、devDependency の
`@etzhayyim/sdk-mock`）ので、install は必ずこの経路を通る。**この症状が出るかどうかは
マシンの設定で決まり、repo は無関係**である —— 「minpaku は install できない」と
誤診しない。

回避（ユーザー設定を書き換えずに、その 1 回だけ外す）:

```bash
: > /tmp/empty-npmrc
npm install --userconfig /tmp/empty-npmrc
```

実測 —— 通る:

```
added 135 packages, and audited 136 packages in 2m
found 0 vulnerabilities
```

途中に出る 2 種類の警告は**止まる理由ではない**（実測でこの警告が出たまま §2 も §3 も
緑になる）:

- `npm warn allow-scripts @etzhayyim/base-l2@… (prepare: tsc)` ほか 5 件 —— 依存の
  `tsc` ビルドが走っていないという意味だが、`main` が `.ts` を直接指しており vitest が
  その場でトランスパイルするので、テストには要らない。
- `npm warn gitignore-fallback No .npmignore file found` —— git 依存の梱包時の情報。

**恒久的に直したいなら**、`~/.npmrc` の `allow-scripts[]` を消すのではなく（それは
Claude Code 自身の postinstall のために置かれている）、npm を 11.12 未満に留めるか、
上の `--userconfig` を使う。**この repo 側で直せる問題ではない。**

`package-lock.json` は commit されていないが、git 依存は `package.json` の中で
commit SHA まで固定されている（`#12314a0…` / `#c857ff9…`）ので、install は
再現する。

**この repo には `.gitignore` が無い。** install の直後に `git status` を見ると
`kotoba/node_modules/` と `kotoba/package-lock.json` が未追跡として並ぶ（実測）。
commit するときはパスを明示して stage すること（`git add -A` をしない）。

## 2. テストを通す（ここが唯一の緑判定）

```bash
npm test
```

実測 —— **12 pass / 0 fail**（`--reporter=verbose`）:

```
✓ date helpers > computes whole nights (UTC)
✓ date helpers > validates dates
✓ date helpers > tithe splits 10% with no leak
✓ listing > creates + gets + lists
✓ listing > is idempotent
✓ listing > rejects non-positive price
✓ booking + settlement > creates a booking with computed nights + total
✓ booking + settlement > rejects checkout-before-checkin
✓ booking + settlement > rejects too many guests
✓ booking + settlement > booking on missing listing → listingNotFound
✓ booking + settlement > settles on-chain: tithe split + booking→confirmed
✓ booking + settlement > does not double-settle
Test Files  1 passed (1)
Tests  12 passed (12)
Duration  854ms
```

これが赤い状態で先へ進まない。

**ただしこの緑が言っているのは「純関数と PDS レコードの遷移が正しい」であって
「決済が動く」ではない。** 12 本全部が `MockEtzhayyim`（インメモリ）と
`fakeSettle`（`async () => ({ txHash: "0xstay" })`）に対して走っており、**RPC も
鍵も USDC contract も 1 度も触っていない。** 実チェーンの検証は §6。

```bash
npm run typecheck     # tsc --noEmit → exit 0（実測）
```

## 3. 使う —— 最小の 3 手（実測済みの経路）

`MockEtzhayyim` に対して回せば、実チェーン無しで一連の遷移を見られる。上の 12 本が
まさにこれをやっている:

```ts
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import { createListing, createBooking, settleBooking, getBooking } from "../src/index.js";

const e = new MockEtzhayyim({ did: "did:web:minpaku.etzhayyim.com" });

// 1) 物件（100 USDC/泊 = micros で "100000000"）
await createListing(e, {
  listingId: "L-1", hostDid: "did:web:alice.etzhayyim.com",
  title: "Kyoto machiya", pricePerNightMicros: "100000000", maxGuests: 4,
});

// 2) 予約（泊数と合計は入力ではなく計算される）
const b = await createBooking(e, {
  bookingId: "B-1", listingId: "L-1", guestDid: "did:web:bob.etzhayyim.com",
  checkIn: "2026-07-01", checkOut: "2026-07-04",
});
// b.nights = 3, b.totalMicros = "300000000", status = "pending_payment"

// 3) 決済（settle は注入する。実チェーンは §6）
const s = await settleBooking(e, fakeSettle, { bookingId: "B-1", to: "0x7777…" });
// s.titheMicros = "30000000", s.netMicros = "270000000", booking → "confirmed"
```

金額はすべて **USDC の micros（10⁻⁶）を 10 進文字列で**渡す。`"100000000"` は
100 USDC であって 100 micros ではない。日付は `YYYY-MM-DD` で、`nightsBetween` は
UTC で丸ごとの泊数を数える（`2026-7-1` のようなゼロ埋め無しは `invalidDate` で弾かれる）。

## 4. 罠 1 —— `listingId` / `bookingId` は大文字小文字を潰す

rkey と DID は ID を小文字化して作られる（`listingRkey` / `listingDid`）が、
レコード側の `listingId` は入力のまま保存される。**したがって `L-1` と `l-1` は
同じ 1 件になる。** 実測:

```
createListing({listingId:"L-1", host:alice, title:"Alice machiya"})
  → created        did:web:minpaku.etzhayyim.com:listing:l-1
createListing({listingId:"l-1", host:bob,   title:"Bob apartment"})
  → alreadyExists  did:web:minpaku.etzhayyim.com:listing:l-1
getListing("l-1").title → "Alice machiya"
getListing("L-1").title → "Alice machiya"
```

**Bob の登録は黙って捨てられ、Bob には Alice のレコードの DID が返る。**
`alreadyExists` は「あなたが前に登録した」という意味に読めるが、実際には
**別人の物件**でありうる。

→ ID を機械生成するなら、**大文字小文字で区別される ID 空間を使わない**
（base62 の nanoid をそのまま `listingId` にすると衝突する）。小文字 + 数字 +
ハイフンに閉じるか、生成側で小文字化してから渡す。

## 5. appview（2026-08-26、Svelte → ClojureScript 移行後）

**2026-08-26 に旧 Svelte 5 + Vite scaffold を撤去し、
`appview/minpaku-frontend-mp7k9x2w/cljs/`（shadow-cljs + reagent 1.2.0 +
re-frame 1.4.3 + jp-go-dds）に置き換えた。** 旧 scaffold は `pnpm install` が
`@etzhayyim/design-system@workspace:*`（この repo に無い workspace root を
指す）で **`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`** で落ち、standalone では
install すら通らなかった（実測はこの節の履歴に残る git log 参照）。新しい
cljs scaffold は `deps.edn` の git 依存 + npm の `shadow-cljs` だけで完結し、
その問題を構造的に持たない。

```bash
cd appview/minpaku-frontend-mp7k9x2w/cljs
npm install
npx shadow-cljs compile app     # → public/js/app.js
npx shadow-cljs compile test && node out/tests.js
```

画面は `<h1>minpaku-frontend-mp7k9x2w</h1>` 相当（`dds/heading` 1 枚 + tagline）
のままの scaffold —— **今日このコードで確かめられる新機能は無い。**
`kotoba/src/` の listing/booking/payment ロジックとは無関係（今回の移行対象は
appview のみ）。

`kotodama.jsonld` が宣言している経路（`minpaku.etzhayyim.com` /
`mp7k9x2w.etzhayyim.com` への routes、`/wasm/component.wasm`、`staticDir`
は今回 `/wasm/cljs/public` に更新）も同様に、この tree の中には対応物が無い。
**2026-08-15 実測、どちらのホストも DNS で解決しない**:

```
$ host minpaku.etzhayyim.com     → NXDOMAIN
$ host mp7k9x2w.etzhayyim.com    → NXDOMAIN
$ host etzhayyim.com             → 104.21.51.111
```

## 6. 実チェーン決済を通す前に読むこと（**この段は未実走**）

以下は鍵と RPC が要るので**踏んでいない**。踏まずに分かること（コード読解）だけを書く。

### 6a. 何を渡すのか

```ts
import { donateSettlementExecutor } from "./src/settlement.js";

const settle = donateSettlementExecutor({
  rpcUrl: "https://…",              // Base L2 RPC（省略時は SDK の既定）
  privateKey: "0x…",                // EOA。これか sponsored のどちらかが必須
  // sponsored: {...},              // ERC-4337 経路は SDK 側で v0.2 stub。下記
  // tokenContract: "0x…",          // 省略時 USDC_BASE
});
await settleBooking(e, settle, { bookingId: "B-1", to: hostPayoutAddress });
```

`privateKey` も `sponsored` も無いと `donate()` が throw する。`sponsored` を渡しても
**SDK は「v0.2 stub」と警告して EOA 経路に落ちる**（`donate.ts` が自分でそう書いている）。

### 6b. tithe はオンチェーンでは分割されない

`settleBooking` が `settle()` に渡すのは **`split.gross`**（net ではない）で、
`donate()` → `PayClient.pay()` は `USDC.transfer(to, amount)` を 1 回呼ぶだけである。
`@etzhayyim/sdk` に `TitheRouter` の ABI もアドレスも無く、`DONATE.md` が
"Tithe Router (**v0.2**)" / "Future Work: TitheRouter integration witness + split
verification" と書いている。しかもその設計は `purpose === "tithe"` のときに router を
宛先にする前提だが、**minpaku が送る purpose は `internal-purchase`** である。

→ **総額がそのままホストの payout アドレスへ行き、10% は payment レコードの
`titheMicros` という数字としてだけ残る。** Public Fund への送金は起きない。
実鍵を挿す前に、この差を運用側で埋めるのか（例: 2 回送金する / router を実装する）を
決めること。

### 6c. tithe は切り捨てで、少額では 0 になる

`(gross × 100) / 1000` の整数除算。実測（micros）:

| gross | tithe | net |
|---:|---:|---:|
| 1 | **0** | 1 |
| 9 | **0** | 9 |
| 10 | 1 | 9 |
| 999 | 99 | 900 |
| 1000 | 100 | 900 |
| 1234567 | 123456 | 1111111 |

`tithe + net === gross` は全ケースで成立する（取りこぼしは出ない）。ただし
**10 micros（= 0.00001 USDC）未満の予約は tithe が 0** になる。

## 7. 罠 2 —— 決済の途中で PDS 書き込みが失敗すると、二重に課金しうる

`settleBooking` の順序は **①チェーン送金 → ②payment レコード書き込み →
③booking を confirmed に更新** で、トランザクションではない。**③が失敗すると、
チェーンでは送金済みなのに booking は `pending_payment` のまま残る。**
そこへ再実行すると、`status !== "pending_payment"` の番人が発火しないので
**もう 1 回チェーンに送る。**

実測（mock の 2 回目の write を throw させ、settle 呼び出し回数を数えた）:

```
threw: PDS write failed
1 回目のあと      : chainCalls = 1   booking.status = pending_payment
2 回目を実行      : status = settled  chainCalls = 2      ← 二重送金
```

### 見分け方（実測済み）

同じ状態を作って読むと、**payment レコードは残っている**:

```
payment record present = true   txHash = 0xdeadbeef
booking status = pending_payment   booking txHash = (none)
```

→ **「payment レコードが在り txHash も付いているのに、booking が
`pending_payment` のまま」なら、それは未払いではなく送金済みである。**
`settleBooking` をもう一度叩く前にこれを見る。復旧は booking レコードを
`confirmed` + `txHash` で直接書き戻す（`settleBooking` を通さない）。

```ts
import { PAYMENT_COLLECTION, paymentRkey, BOOKING_COLLECTION, bookingRkey } from "./src/types.js";
const pay = await e.read({ collection: PAYMENT_COLLECTION, rkey: paymentRkey(id) });
```

## 8. 今日ここまでで確かめられること / 確かめられないこと

| | 状態 |
|---|---|
| 依存が入る（`--userconfig` 経由） | **実測で緑**（§1） |
| listing / booking / tithe の算術と遷移 | **実測で緑**（12/12、§2） |
| `tsc --noEmit` | **実測で緑**（§2） |
| `listingId` の大文字小文字衝突 | **実測**（§4、両方向） |
| tithe の切り捨てと保存則 | **実測**（§6c、8 ケース） |
| 部分失敗による二重送金と、その見分け方 | **実測**（§7、chain 呼び出し回数を数えた） |
| appview が standalone で install できない | **実測**（§5） |
| 配信ホストの DNS | **実測**（§5、NXDOMAIN） |
| tithe が送金されないこと | **コード読解のみ** — SDK の `donate` / `pay` / `DONATE.md` を読んだ結果であって、チェーンに送って確かめてはいない（§6b） |
| 実 USDC の送金・ガス・revert 時の挙動 | **未実測** — 鍵も RPC も無い |
| appview の画面 | **未実測** — 画面がまだ無い（§5） |
