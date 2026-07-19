# etzhayyim-project-minpaku

民泊 & 宿泊施設 intelligence。`minpaku.etzhayyim.com`

## App Identity

| Key | Value |
|---|---|
| nanoid | `mp7k9x2w` |
| domain | `minpaku.etzhayyim.com` |
| performer ID | `mp7k9x2w` |
| AT bot DID | `did:web:minpaku.etzhayyim.com` |
| Runtime | TS Native + Lexicon Contract |

## Writer Entities (Data Sources with DID)

| Source | DID | Category | Format |
|---|---|---|---|
| OpenStreetMap | `did:web:minpaku.etzhayyim.com:source:osm` | accommodation | overpass_json |
| Kankocho Minpaku Data | `did:web:minpaku.etzhayyim.com:source:kankocho` | minpaku | gov_open_data |

## Data Model

### `accommodation` record kind

| Field | Type | Description |
|---|---|---|
| `listing_id` | string | Primary key (e.g. `osm-node-12345`) |
| `name` | string | Accommodation name |
| `type` | string | `hotel` / `hostel` / `guest_house` / `minpaku` |
| `lat` | number | Latitude |
| `lon` | number | Longitude |
| `address` | string | Address |
| `stars` | number | Star rating (0 if unknown) |
| `rooms` | number | Room count (0 if unknown) |
| `phone` | string | Phone number |
| `website` | string | Website URL |
| `source_url` | string | Source URL (OSM permalink, gov page) |
| `source_did` | string | Writer entity DID |
| `collected_at` | string | RFC 3339 |
| RLS | | `org_id`, `user_id`, `actor_id` |

## Collection Sources (ToS Compliant)

- **OpenStreetMap** via Overpass API -- hotels/hostels/guest_house by city bbox (ODbL license)
- **Kankocho** (https://www.mlit.go.jp/kankocho/minpaku/) -- government open data

## Collection Commands

- `collect_osm_accommodation` -- Overpass API for single city (tokyo/osaka/kyoto/fukuoka/sapporo/nagoya/yokohama/kobe/sendai/hiroshima)
- `collect_kankocho` -- Kankocho minpaku open data
- `collect_all_cities` -- batch collection for all 10 cities
- `search_accommodation` -- SQL search by city/type/name/stars
- `list_accommodation` -- list with filters
- `get_accommodation` -- get by listing_id
- `accommodation_stats` -- statistics by type and source

## Local Data

`/Volumes/251220/domain-data/minpaku/` -- OSM Overpass API downloads per city

## Domain Rules

- `minpaku_license` (民泊届出番号) は民泊物件登録時に必須
- 料金のデフォルト通貨は JPY
- チェックイン/アウト時刻のデフォルト: 15:00 / 10:00
- 予約ステータス: `pending` -> `confirmed` -> `completed` / `cancelled`
