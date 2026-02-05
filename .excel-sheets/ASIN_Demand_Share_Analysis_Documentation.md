# ASIN Demand Share Analysis - Workbook Documentation

**File**: `28 ASIN Demand Share Analysis 20251212.xlsb`
**Size**: 53.1 MB
**Format**: Excel Binary Workbook (.xlsb)
**Date**: December 12, 2025

---

## Executive Summary

This workbook analyzes **demand share** for 28 target ASINs across Amazon search results. It calculates what percentage of total available demand each target ASIN captures across all relevant search terms where it appears.

**Key Metrics**:
- 28 target ASINs analyzed
- 174,616 search result observations
- 55,768 unique competing ASINs
- 1,521 unique search terms
- Total estimated L7 (Last 7 days) demand: 71,339 units
- Target ASINs capture 653 units (0.91% demand share)

---

## Workbook Structure

| Sheet # | Name | Rows | Columns | Purpose |
|---------|------|------|---------|---------|
| 1 | 28 ASIN Demand Share Analysis | 32 | 5 | **Output** - Demand share summary by ASIN |
| 2 | 28_asin_search_data_20251212 | 174,616 | 49 | **Raw Data** - Scraped Amazon search data |
| 3 | Benchmark Calculation Ideas | 15 | 3 | **Reference** - Metric definitions |

---

## Sheet 1: Demand Share Summary

### Purpose
Pivot table showing demand share metrics for each of the 28 target ASINs, sorted by demand share percentage (highest first).

### Columns

| Column | Description |
|--------|-------------|
| **Row Labels** | Target ASIN identifier (e.g., B01LXEQ6UM) |
| **No of Scraped ASINs** | Count of competing ASINs found in search results for this target's keywords |
| **Total ASIN Estimated L7 Unit Demand** | Estimated units sold by this target ASIN in last 7 days |
| **Total Estimated L7 Unit Demand** | Total market demand (all ASINs) for keywords where this target appears |
| **Demand Share %** | Target's demand ÷ Total demand = Share of market captured |

### Data (All 28 ASINs)

| ASIN | Scraped ASINs | Target L7 Demand | Total L7 Demand | Demand Share % |
|------|---------------|------------------|-----------------|----------------|
| B01LXEQ6UM | 8,607 | 180 | 1,541 | **11.67%** |
| B001JECAM2 | 2,677 | 25 | 443 | **5.75%** |
| B07PXKYX5M | 14,529 | 83 | 3,578 | **2.31%** |
| B082LV2VH6 | 3,911 | 129 | 5,810 | **2.21%** |
| B096N3LM1C | 2,556 | 74 | 4,387 | **1.68%** |
| B000WFKX6Y | 3,691 | 13 | 923 | **1.44%** |
| B07WXZDHGV | 4,029 | 11 | 936 | **1.17%** |
| B00QMTBPF2 | 1,809 | 8 | 866 | **0.90%** |
| B01NAECQ1U | 7,129 | 19 | 2,622 | **0.72%** |
| B00CJJ76HU | 4,938 | 7 | 1,114 | **0.65%** |
| B07H1CND6G | 18,179 | 51 | 10,450 | **0.49%** |
| B00HPZUR42 | 3,768 | 3 | 551 | **0.48%** |
| B01LXYE7V7 | 30,375 | 4 | 917 | **0.42%** |
| B01BECQAWO | 4,831 | 12 | 3,396 | **0.36%** |
| B00AF5ZLP4 | 11,386 | 8 | 2,699 | **0.31%** |
| B0BRTBDG4G | 4,774 | 3 | 1,085 | **0.30%** |
| B0799D1LDP | 1,257 | 1 | 399 | **0.29%** |
| B0000AUB58 | 4,724 | 7 | 4,095 | **0.17%** |
| B08L5LF1LT | 3,612 | 2 | 970 | **0.16%** |
| B077VZZJ5K | 6,780 | 4 | 4,462 | **0.10%** |
| B000B888SC | 3,959 | 1 | 973 | **0.10%** |
| B0C15HMBNB | 4,936 | 4 | 4,582 | **0.09%** |
| B06ZZNLLP5 | 4,087 | 2 | 2,126 | **0.07%** |
| B013P3QE1W | 1,863 | 0 | 673 | **0.02%** |
| B01FFT0B7W | 4,748 | 1 | 4,895 | **0.02%** |
| B002Q973T4 | 3,542 | 1 | 3,495 | **0.01%** |
| B004KS9HCA | 2,800 | 0 | 2,905 | **0.00%** |
| B07X1LT444 | 5,119 | 0 | 446 | **0.00%** |
| **Grand Total** | **174,616** | **653** | **71,339** | **0.91%** |

### Key Insights
- **Top performer**: B01LXEQ6UM captures 11.67% of available demand
- **Bottom performers**: B004KS9HCA and B07X1LT444 have 0% demand share
- **Overall**: The 28 target ASINs collectively capture only 0.91% of total market demand
- **Competitive landscape**: 55,768 competing ASINs across these keywords

---

## Sheet 2: Raw Search Data

### Purpose
Contains 174,616 rows of scraped Amazon search result data, capturing every appearance of products across 1,521 search terms.

### Column Reference (49 columns)

#### Identifiers & Location
| Column | Type | Description |
|--------|------|-------------|
| `target_asin` | text | The focal ASIN being analyzed (one of 28) |
| `asin` | text | ASIN appearing in search results (any competitor) |
| `product_url` | text | Amazon product page URL |
| `title` | text | Product title |
| `search_term` | text | Keyword/search query (e.g., "air soft") |

#### Position Metrics
| Column | Type | Description |
|--------|------|-------------|
| `page` | int | Search results page number (1, 2, 3...) |
| `position_on_page` | int | Position within that page |
| `overall_position` | int | Absolute position across all pages |
| `organic_position` | float | Organic (non-sponsored) rank position |

#### Product Attributes
| Column | Type | Description |
|--------|------|-------------|
| `rating` | float | Star rating (1.0 - 5.0) |
| `review_count` | int | Number of customer reviews |
| `price` | float | Listed price |
| `adjusted_price` | float | Price after adjustments/discounts |
| `tags` | text | Product badges/tags (JSON array) |
| `delivery_info` | text | Shipping/delivery details |
| `bought_past_month` | text | "2K+ bought in past month" etc. |
| `bought_past_month_value` | float | Numeric value (e.g., 2000) |
| `options` | text | Product variants (JSON array) |

#### Cluster Labels (Segmentation)
| Column | Type | Description |
|--------|------|-------------|
| `search_term_price_cluster_label` | text | Price range for this search term (e.g., "$12.97-$27.99") |
| `global_price_cluster_label` | text | Global price segment |
| `global_cluster_feature_label` | text | Feature cluster (e.g., "GC4: ball / golf ball / golf balls / gun") |
| `cluster_delivery_bought_label` | text | Combined label (e.g., "High Demand + Slow Shipping") |
| `rating_demand_label` | text | Rating/demand combo (e.g., "Low Rating + High Demand") |
| `rating_category` | text | Rating bucket (e.g., "Low Rating", "High Rating") |
| `demand_label` | text | Demand level (e.g., "High Demand", "Low Demand") |
| `delivery_speed_label` | text | Shipping speed category |
| `delivery_speed_days` | float | Estimated delivery days |

#### Demand Forecasts
| Column | Type | Description |
|--------|------|-------------|
| `asin_purchase_volume_forecast` | float | Predicted units sold for this ASIN |
| `adjusted_purchase_vol_forecast` | float | Adjusted purchase volume |
| `impression_vol_forecast` | float | Predicted impressions |
| `click_vol_forecast` | float | Predicted clicks |
| `purchase_vol_forecast` | float | Predicted purchases |
| `impression_share_forecast` | float | Share of impressions (0-1) |
| `click_share_forecast` | float | Share of clicks (0-1) |
| `purchase_share_forecast` | float | Share of purchases (0-1) |
| `search_volume_pred` | float | Predicted search volume (all null in this dataset) |
| `c2c_forecast` | float | Click-to-conversion forecast |
| `ctr_forecast` | float | Click-through rate forecast |

#### Metadata & Flags
| Column | Type | Description |
|--------|------|-------------|
| `updated_at` | int | Excel date serial (45995 = Dec 12, 2025) |
| `forecast_update_dt` | float | Forecast update timestamp |
| `start_date` | int | Data collection start date |
| `is_focal_asin` | bool | TRUE if this row is for a target ASIN |
| `anomaly_applicable` | bool | Anomaly detection flag |
| `feature_anomaly_score` | float | Anomaly score (-1 to 1) |

#### Cluster IDs (Numeric)
| Column | Type | Description |
|--------|------|-------------|
| `price_cluster` | int | Price segment ID |
| `rank_cluster` | int | Rank segment ID |
| `badge_cluster` | int | Badge/tag cluster ID |
| `global_price_cluster` | int | Global price cluster ID |
| `global_cluster_feature_id` | int | Feature cluster ID |

### Data Coverage

| Metric | Value |
|--------|-------|
| Total observations | 174,616 |
| Unique target ASINs | 28 |
| Unique competing ASINs | 55,768 |
| Unique search terms | 1,521 |
| Date range | December 2025 |
| Rows with organic position | 153,436 (88%) |
| Rows with adjusted price | 109,836 (63%) |
| Rows with "bought past month" | 119,339 (68%) |

---

## Sheet 3: Benchmark Calculation Ideas

### Purpose
Documents the methodology and definitions for various benchmark metrics that could be calculated from this data.

### Metric Definitions

#### Business Drivers

| Metric | Description |
|--------|-------------|
| **Growth Opportunity Units** | Total difference between my demand and highest demand for an item in my price segment for each relevant keyword. Aggregated across all ASINs. |
| **Demand Share %** | My total demand as a percentage of total available demand across relevant keywords for all my ASINs. |

#### Impression Drivers

| Metric | Description |
|--------|-------------|
| **Keyword Coverage Benchmark** | How many keywords do I rank ≤60 for across all my ASINs? Compared to other brands on same keywords. |
| **Sponsorship Activity Benchmark** | Total placements across relevant keywords vs. other brands on same keywords. |
| **Organic Rank Benchmark** | Average organic rank (inputting 100 if not ranked) weighted by total demand. Compared to competitors. |

#### Conversion Drivers

| Metric | Description |
|--------|-------------|
| **Tag Benchmark** | Demand where boost tags exist vs. total tagged demand. Compared to competitors. |
| **Price Segment Benchmark** | Demand in my price segment vs. available demand in that segment. |
| **Promotion Activity Benchmark** | Number of ASINs on promotion vs. competitors. |
| **Review Score Benchmark** | Average reviews compared to other brands on same keywords. |
| **Content Segment Benchmark** | Demand in my feature segment vs. available demand in that segment. |
| **Ship Speed Benchmark** | Average fastest/free ship speed compared to competitors. |

---

## Calculation Logic

### Demand Share % Formula

```
Demand Share % = (Target ASIN L7 Unit Demand) / (Total L7 Unit Demand) × 100
```

Where:
- **Target ASIN L7 Unit Demand** = Sum of `asin_purchase_volume_forecast` where `is_focal_asin = TRUE` for this target
- **Total L7 Unit Demand** = Sum of `asin_purchase_volume_forecast` for all ASINs appearing on keywords where this target ranks

### Example Calculation

For **B01LXEQ6UM**:
- Target ASIN demand: 180 units
- Total market demand across its keywords: 1,541 units
- Demand Share: 180 ÷ 1,541 = **11.67%**

---

## Data Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                    Sheet 2: Raw Data                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ target_asin  │───▶│ search_term  │◀───│    asin      │      │
│  │  (28 ASINs)  │    │(1,521 terms) │    │(55,768 ASINs)│      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              174,616 Search Result Rows              │       │
│  │   (each row = one ASIN appearing for one keyword)   │       │
│  └─────────────────────────────────────────────────────┘       │
│                            │                                    │
│                            ▼                                    │
│         ┌──────────────────────────────────────┐               │
│         │    Aggregate by target_asin           │               │
│         │    Sum: asin_purchase_volume_forecast │               │
│         └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Sheet 1: Summary Pivot                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ASIN │ Scraped │ Target Demand │ Total Demand │ Share % │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Terms Glossary

| Term | Definition |
|------|------------|
| **ASIN** | Amazon Standard Identification Number - unique product identifier |
| **Target ASIN** | One of the 28 ASINs being analyzed (the "focal" products) |
| **L7** | Last 7 days |
| **Demand** | Estimated unit sales/purchases |
| **Demand Share** | Percentage of total available demand captured by target ASINs |
| **Organic Position** | Non-sponsored search ranking |
| **Price Cluster** | Products grouped by similar price points |
| **Feature Cluster** | Products grouped by similar features/attributes |

---

## Use Cases

1. **Competitive Analysis**: Identify which target ASINs are winning/losing demand share
2. **Keyword Strategy**: Find high-demand keywords where targets underperform
3. **Price Optimization**: Compare demand across price segments
4. **Advertising Prioritization**: Focus ad spend on ASINs with growth opportunity
5. **Content Optimization**: Identify feature clusters that drive higher demand

---

## File Notes

- **Binary format (.xlsb)**: Compressed for large dataset, requires Excel or pyxlsb library
- **Large dataset**: 53MB file with 175K+ rows requires memory-efficient processing
- **Null values**: Some columns have significant missing data (e.g., `search_volume_pred` is 100% null)
- **Date format**: Excel serial dates (45995 = December 12, 2025)
