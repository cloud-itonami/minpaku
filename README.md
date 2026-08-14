# minpaku（民泊）— 短期宿泊の listing・予約・オンチェーン決済

**この repo が実際に持っているのは、民泊（短期宿泊）の物件を登録し、予約を作り、
その支払いを Base L2 の USDC で決済する 6 モジュール・567 行の TypeScript である。**
物件と予約は AT Protocol の PDS レコードとして書かれる（Postgres も RisingWave も
Stripe も無い。ADR-2606011400 の on-chain-only）。

- **判断の核**: `kotoba/src/` — `listing` / `booking` / `tithe` / `settlement` / `types`。
  ここだけが単体テストの対象で、**12 本ある**。
- **機構**: `appview/minpaku-frontend-mp7k9x2w/` — Svelte 5 + Vite の scaffold。
  画面はまだ `<h1>minpaku-frontend-mp7k9x2w</h1>` の 1 枚で、**standalone では
  install すらできない**（`@etzhayyim/design-system` が `workspace:*` を指すが、
  この repo に workspace root が無い。実測は quickstart §5）。

## 動かす

**operator が最初に踏む手順は [`docs/operator-quickstart.md`](docs/operator-quickstart.md)。**
実際に踏んで、各段の実測出力と、コードを読んだだけでは見えない罠を 5 つ書いてある。
最短だけ再掲する:

```bash
cd kotoba
npm install
npm test        # → Test Files 1 passed / Tests 12 passed
```

**`npm install` がこのマシンで `EALLOWSCRIPTS` で落ちる場合がある。** 原因は repo
ではなく `~/.npmrc` で、回避策は quickstart §1 に実測付きで書いた。

## この repo は 3 つの別々のアプリを説明している

読む場所によって「minpaku とは何か」の答えが変わる。**2026-08-15 に実測した現在地**:

| 読む場所 | そこに書いてあるアプリ | コードに在るか |
|---|---|---|
| `kotoba/src/**` | 物件登録 → 予約 → USDC 決済 | **在る**（12 テストが緑） |
| `CLAUDE.md` | OSM/Overpass と観光庁オープンデータを収集する accommodation intelligence（`collect_osm_accommodation` 等 7 コマンド） | **無い** — `osm` / `overpass` / `kankocho` / `collect_` / `minpaku_license` は CLAUDE.md の外に **1 件もヒットしない** |
| `appview/*/kotodama.jsonld` | `com.etzhayyim.apps.minpaku.minpakuEntity` / `minpakuEvent` / `minpakuReport` を購読する worker | **無い** — コードが書くのは `…minpaku.listing` / `.booking` / `.payment` の 3 つ |

`CLAUDE.md` は移行前の seed（`etzhayyim/root` の `60-apps/etzhayyim-project-minpaku`、
`migration.edn` が revision `089210a` として記録している）の説明で、`kotoba/` は
その後に書かれた別実装である。**この README はどちらも消していない** —— 消すのは
別の仕事で、まず食い違いを可視化した。`kotodama.jsonld` の購読 collection のずれは
実害が具体的で、**あの定義のまま firehose を購読した worker は、このコードが書く
レコードを 1 件も受け取らない。**

## 隣の repo との境界 —— 今日、その境界はコードの中に無い

宿泊まわりには 3 本ある:

| repo | 何を持つか |
|---|---|
| `cloud-itonami/yadoya`（宿屋） | ホテルの検索・予約プラットフォーム。appview + worker + kotoba |
| `cloud-itonami/actor-shukubo`（宿坊） | 巡礼者向け宿泊の commons。手数料・変動価格・人物スコアリングを持たない governed actor |
| **`cloud-itonami/minpaku`（民泊）** | **短期宿泊の listing / 予約 / USDC 決済** |

**ただし `minpaku/kotoba/src` と `yadoya/kotoba/src` は、アプリ名を置換すると
567 行中 4 行しか違わない**（実測 2026-08-15）。違う 4 行はすべて `types.ts` に在り、
docstring の 1 行（民泊 / 宿屋）と DID prefix 定数の名前だけである。
`index.ts` / `tithe.ts` / `listing.ts` / `booking.ts` / `settlement.ts` は
**置換後は 1 行も違わず**、テストスイートも同様に同一である。

つまり **今日この 2 つを分けているのは DID 名前空間とラベルだけ**で、ドメインの
差（民泊の届出番号、宿泊日数の上限、ホテル在庫との違い）はコードのどこにも無い。
`CLAUDE.md` が書いている民泊固有の規則（`minpaku_license` 必須、チェックイン
15:00 / チェックアウト 10:00）も実装されていない。ここに書いておくのは、
**差が在るかのように読ませないため**である。

## 10% の tithe は、記録には在るが、送金には無い

`tithe.ts` は総額の 10% を整数で切り捨て計算し、`settleBooking` はそれを payment
レコードの `titheMicros` に書く。**しかしオンチェーンに出ていく送金は総額（gross）
そのままで、Public Fund への分割は 1 度も起きない。** 経路（コード読解、2026-08-15）:

```
settleBooking → settle({ amountMicros: split.gross })     ← net ではなく gross
  → donateSettlementExecutor → donate({ amountUsdc: gross })
    → PayClient.pay → USDC.transfer(to, gross)             ← 単純な ERC-20 transfer
```

`@etzhayyim/sdk` の `TitheRouter.sol` は **実装されていない**（`DONATE.md` が
自ら "Tithe Router (v0.2)" / "Future Work: TitheRouter integration witness +
split verification" と書いている）。さらにその設計は `purpose === "tithe"` の
ときに router 宛に送る前提だが、**minpaku が送る purpose は `internal-purchase`**
なので、router が実装されても現在の呼び出しには当たらない。

→ **`titheMicros` は今日、帳簿上の数字であって送金ではない。** 実鍵を挿す前に
quickstart §6 を読むこと。

## ライセンス

Apache-2.0 + etzhayyim Charter Compliance Rider v3.1（`NOTICE`）。
**Rider 本文 `CHARTER-RIDER.md` はこの tree に無い**（移行元の root に在った）。

`MIGRATION-TODO.md` の TRANSFORM チェックリストは未完了のまま残っている。
2026-05-21 の自動 scan は Stripe / RisingWave / Kysely / GA4 等を 1 つも検出せず、
TRANSFORM 分類はドメインのパターンによる推定だったと同ファイルが記録している。
