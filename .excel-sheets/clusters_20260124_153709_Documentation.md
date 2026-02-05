# clusters_20260124_153709 - Documentation

## Overview

**File**: clusters_20260124_153709.xlsx
**Sheets**: 1 sheet
**Purpose**: Amazon product search results dataset with clustering, demand forecasting, and feature analysis for competitive intelligence
**Dimensions**: 174,617 rows x 55 columns

---

## Sheet Summary

| # | Sheet Name | Rows | Cols | Purpose |
|---|------------|------|------|---------|
| 1 | clusters_20260124_153709 | 174,617 | 55 | Product search result data with forecasts and cluster assignments |

---

## Sheet Details

### Sheet 1: clusters_20260124_153709

**Purpose**: Contains Amazon search result data enriched with demand forecasts, price clusters, product clusters, and various derived features
**Dimensions**: 174,617 rows x 55 columns (A1:BC174617)

#### Column Structure

| Col | Header | Data Type | Sample Values | Notes |
|-----|--------|-----------|---------------|-------|
| A | asin | Text | B001ABJXLA, B00C1P4UUI | Amazon Standard Identification Number |
| B | target_asin | Text | B0000AUB58 | Reference/target ASIN for comparison |
| C | product_url | Text | https://www.amazon.com/dp/... | Product detail page URL |
| D | title | Text | Product titles | Product name (truncated in samples) |
| E | search_term | Text | "air soft" | Search query that returned this product |
| F | page | Integer | 1, 2, 3... | Search results page number |
| G | position_on_page | Integer | 1-48 | Position within the page |
| H | overall_position | Integer | 1, 2, 3... | Absolute position across all pages |
| I | organic_position | Integer | 1, 2, 3... | Position excluding sponsored results (nullable) |
| J | rating | Float | 4.5, 4.0 | Product star rating |
| K | review_count | Integer | 1000, 5000 | Number of customer reviews |
| L | price | Float | 29.99, 149.00 | Product price in USD |
| M | tag | Text | Various | Amazon badges/tags (210 unique values) |
| N | delivery_info | Text | Various | Delivery details text |
| O | bought_past_month | Text | "2K+ bought..." | Purchase volume indicator text |
| P | options | Text | Various | Product variation options |
| Q | updated_at | DateTime | 2025-11-07 | Data collection timestamp |
| R | impression_vol_forecast | - | (sparse) | Forecasted impression volume |
| S | click_vol_forecast | - | (sparse) | Forecasted click volume |
| T | purchase_vol_forecast | - | (sparse) | Forecasted purchase volume |
| U | impression_share_forecast | - | (sparse) | Forecasted impression share |
| V | click_share_forecast | - | (sparse) | Forecasted click share |
| W | purchase_share_forecast | - | (sparse) | Forecasted purchase share |
| X | search_volume_pred | - | (sparse) | Predicted search volume |
| Y | c2c_forecast | Float | 0.00282, 0.0041 | Click-to-conversion forecast rate |
| Z | ctr_forecast | Float | 0.00228, 0.00339 | Click-through rate forecast |
| AA | adjusted_purchase_vol_forecast | - | (sparse) | Adjusted purchase volume forecast |
| AB | asin_purchase_volume_forecast | Integer | 0 | ASIN-level purchase forecast |
| AC | adjusted_price | - | (sparse) | Price after adjustments |
| AD | start_date | DateTime | 2025-11-07 | Analysis period start date |
| AE | rating_category | Text | Low/Medium/High Rating | Categorical rating bucket |
| AF | bought_past_month_value | Integer | 2000, 1000, 4000 | Numeric value of bought_past_month |
| AG | cheapest_delivery_speed | Integer | 28 | Days for cheapest delivery option |
| AH | fastest_delivery_speed | Integer | 25 | Days for fastest delivery option |
| AI | Amazon_shipping | Integer | 0, 1 | Flag: fulfilled by Amazon |
| AJ | delivery_speed_label | Text | Fast/Slow/Unknown Shipping | Delivery speed category |
| AK | demand_label | Text | High/Medium/Low Demand, No Badge | Demand level category |
| AL | feature_anomaly_score | Float | -0.837, -0.963 | Anomaly detection score |
| AM | feature_anomaly_flag | Boolean | False | Anomaly indicator flag |
| AN | global_price_cluster | Integer | 1, 4 | Price cluster ID |
| AO | global_price_cluster_label | Text | "$12.40-$31.99" | Price cluster range label |
| AP | global_product_cluster | Integer | 4 | Product cluster ID |
| AQ | global_cluster_feature_id | Integer | 4 | Cluster feature identifier |
| AR | global_cluster_feature_label | Text | "GC4: ball / golf ball..." | Cluster keywords/description |
| AS | tag_label_more_choices | Integer | 0, 1 | Flag: "More Choices" tag present |
| AT | tag_label_limited_stock | Integer | 0, 1 | Flag: "Limited Stock" tag present |
| AU | tag_label_small_business | Integer | 0, 1 | Flag: "Small Business" tag present |
| AV | tag_label_ethics_friendly | Integer | 0, 1 | Flag: Ethics-friendly tag present |
| AW | tag_label_prime_benefit | Integer | 0, 1 | Flag: Prime benefit tag present |
| AX | tag_label_gold_box_offer | Integer | 0, 1 | Flag: Gold Box offer tag present |
| AY | tag_label_limited_deal | Integer | 0, 1 | Flag: Limited Deal tag present |
| AZ | tag_label_low_returns | Integer | 0, 1 | Flag: Low Returns tag present |
| BA | tag_label_featured_pick | Integer | 0, 1 | Flag: Featured Pick tag present |
| BB | tag_label_best_seller | Integer | 0, 1 | Flag: Best Seller tag present |
| BC | target_title_distance_ui01 | Float | 0.968, 0.973 | Title similarity score (0-1) |

#### Key Formulas

No formulas found - this is a data export file with calculated values.

#### Named Ranges

None defined.

#### Data Validation

None defined.

---

## Data Categories

### Rating Categories (AE)
| Value | Description |
|-------|-------------|
| High Rating | Products with high star ratings |
| Medium Rating | Products with moderate star ratings |
| Low Rating | Products with low star ratings |

### Delivery Speed Labels (AJ)
| Value | Description |
|-------|-------------|
| Fast Shipping | Quick delivery options available |
| Slow Shipping | Standard/slower delivery options |
| Unknown Shipping | Delivery info not available |

### Demand Labels (AK)
| Value | Description |
|-------|-------------|
| High Demand | High purchase volume indicator |
| Medium Demand | Moderate purchase volume |
| Low Demand | Lower purchase volume |
| No Badge | No demand badge displayed |

### Price Clusters (AO)
| Cluster | Price Range |
|---------|-------------|
| 1 | $1.25-$12.34 |
| 2 | $12.40-$31.99 |
| 3 | $32.40-$73.60 |
| 4 | $74.89-$165.00 |
| 5 | $167.00-$1,895.00 |

### Product Clusters (AR)
| ID | Label |
|----|-------|
| GC0 | bag wheels / travel bag wheels / adjustable... |
| GC1 | mountain / sun mountain / cart / cart bag... |
| GC2 | duty 600d / heavy duty polyester... |
| GC3 | stand bag / carry / stand bag... |
| GC4 | ball / golf ball / gun / case... |
| GC5 | rain cover / handles rain cover / cart... |
| GC6 | boy / bag boy / travel cover... |
| GC7 | travel bags / airlines bags... |

---

## Key Calculations

| Calculation | Column | Description |
|-------------|--------|-------------|
| c2c_forecast | Y | Click-to-conversion rate prediction |
| ctr_forecast | Z | Click-through rate prediction |
| feature_anomaly_score | AL | Anomaly detection score for product features |
| target_title_distance_ui01 | BC | Semantic similarity between product and target titles |

---

## Notes

- **Large dataset**: 174,617 rows of product search data
- **Sparse columns**: Several forecast columns (R-X, AA, AC) appear to have limited data
- **Data snapshot**: Data appears to be from November 2025 based on `start_date` and `updated_at`
- **Use case**: Competitive analysis, demand forecasting, and product clustering for e-commerce intelligence
- **Tag analysis**: 10 binary tag indicator columns (AS-BB) for Amazon product badges
- **No formulas**: Pure data export - all calculations were performed externally
