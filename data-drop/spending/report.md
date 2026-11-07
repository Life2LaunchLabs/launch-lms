# Spending datasets: download check and first numbers

Pulled 2026-11-06 on henry-pc into `C:\Users\henry\Claude\public-data\spending\`. All three publishers are US government, public domain, with no login or license step.

## Files

| Folder / file | What it is | Release | Publisher URL |
|---|---|---|---|
| `SARPP.zip` → `SARPP\SARPP_STATE_2008_2024.csv` (also SARPI, SAIRPD) | BEA Regional Price Parities by state, 2008-2024 | Updated Feb 19, 2026 (new 2024 data; 2008-2023 revised) | https://apps.bea.gov/regional/zip/SARPP.zip |
| `MARPP.zip` → `MARPP\MARPP_MSA_2008_2024.csv` (also MAIRPD) | BEA RPPs by metro area, 2008-2024 | Feb 19, 2026 | https://apps.bea.gov/regional/zip/MARPP.zip |
| `PARPP.zip` → `PARPP\PARPP_PORT_2008_2024.csv` (also PAIRPD) | BEA RPPs for the metro and nonmetro portions of each state. **This is where "Oregon nonmetropolitan portion" is.** MARPP only has the US nonmetro row. | Feb 19, 2026 | https://apps.bea.gov/regional/zip/PARPP.zip |
| `bls-ce\reference-person-age-ranges-2025.xlsx` | CE Table 1300, age of reference person, 2025 | Oct 2026 | https://www.bls.gov/cex/tables/calendar-year/mean-item-share-average-standard-error/reference-person-age-ranges-2025.xlsx |
| `bls-ce\cu-region-1-year-average-2025.xlsx` | CE Table 1800, region of residence, 2025 | Oct 2026 | .../mean-item-share-average-standard-error/cu-region-1-year-average-2025.xlsx |
| `bls-ce\cu-size-2025.xlsx` | CE Table 1400, size of consumer unit, 2025 (has a **One person** column) | Oct 2026 | .../mean-item-share-average-standard-error/cu-size-2025.xlsx |
| `bls-ce\cu-composition-2025.xlsx` | CE Table 1502, composition, 2025 ("Single person and other" is lumped together, so use Table 1400 for one-person units) | Oct 2026 | .../mean-item-share-average-standard-error/cu-composition-2025.xlsx |
| `bls-ce\reference-person-age-generation-2025.xlsx` | CE Table 2602, generation, 2025 (Gen Z = born 1997 or later) | Oct 2026 | .../mean-item-share-average-standard-error/reference-person-age-generation-2025.xlsx |
| `bls-ce\cu-msa-west-2-year-average-2023-2024.xlsx` | CE Table 3033, selected western MSAs, 2023-24 (newest) | Dec 2025 | https://www.bls.gov/cex/tables/geographic/mean/cu-msa-west-2-year-average-2023-2024.xlsx |
| `usda\CostofFoodSep2026Thrifty.pdf`, `usda\CostofFoodSep2026LowModLib.pdf` | USDA Food Plans: Cost of Food, September 2026 | Issued Oct 2026 | https://www.fns.usda.gov/cnpp/usda-food-plans-cost-food-monthly-reports |
| `usda\usda-thriftyplan-june2021-sept2026.xlsx`, `usda-lowcostplan-…`, `usda-moderatecostplan-…`, `usda-liberalplan-sept2007-sept2026.xlsx` | Same monthly costs as long tables (one row per area/group/age/month/plan/weekly-or-monthly) | Through Sep 2026 | same page |

BEA and USDA downloaded fine with a script. BLS returns 403 to scripts, so I fetched the BLS files through Henry's Chrome.

**Western MSA table:** Table 3033 covers Los Angeles, San Francisco, San Diego, **Seattle**, Phoenix, Denver, Honolulu and Anchorage. **Portland is not in it.** (Seattle 2023-24: average annual spending $109,460, food at home $7,607, food away from home $6,041, rented dwellings $9,750, transportation $16,452, entertainment $5,705.)

## 1. BEA Regional Price Parities, 2024 (US = 100 in each year)

The baseline is **US = 100 for the same year (2024)**. RPPs compare places within one year; they are not a time series.

| Area | All items | Goods | Housing rents | Utilities | Other services |
|---|---|---|---|---|---|
| Bend, OR | 103.607 | 105.261 | 109.958 | 104.992 | 100.298 |
| Portland-Vancouver-Hillsboro, OR-WA | 105.421 | 105.222 | 125.114 | 106.974 | 100.136 |
| Eugene-Springfield, OR | 101.568 | 105.261 | 98.350 | 102.531 | 100.298 |
| Salem, OR | 103.649 | 105.261 | 110.333 | 104.689 | 100.298 |
| Medford, OR | 101.433 | 105.261 | 97.658 | 102.266 | 100.298 |
| Corvallis, OR | 104.017 | 105.261 | 114.437 | 108.649 | 100.298 |
| Oregon nonmetropolitan portion (PARPP) | 97.165 | 105.261 | 77.224 | 105.359 | 100.298 |
| Oregon (state, SARPP) | 103.361 | 105.261 | 108.000 | 107.046 | 100.298 |

"Housing rents" is BEA line 3, "RPPs: Services: Housing", which BEA prices from tenant rents only.

**Watch out:** Goods and Other services are the same number for every Oregon-only area (105.261 / 100.298 = the Oregon state value). BEA only estimates those two at state level, so within a state only rents and utilities really vary, and the all-items differences come mostly from rent. Portland differs a little because it crosses into Washington. Utilities also jumped from about 90 in 2023 to about 105 in 2024 across Oregon, so the utilities line is noisy from year to year.

## 2. BLS Consumer Expenditure Survey, 2025 annual means (dollars per consumer unit)

| Item | All units | Under 25 | West | One person | Gen Z (born 1997+) |
|---|---|---|---|---|---|
| Total average annual expenditures | 81,905 | 54,136 | 92,733 | 50,479 | 61,717 |
| Food at home | 6,491 | 4,375 | 7,450 | 3,385 | 4,400 |
| Food away from home | 4,142 | 3,580 | 4,997 | 2,308 | 4,081 |
| Transportation | 13,492 | 11,127 | 14,110 | 7,098 | 11,701 |
| Vehicle purchases (net outlay) | 5,023 | 5,751 | 4,163 | 2,352 | 5,381 |
| Gasoline and other fuels* | 2,503 | 1,874 | 2,968 | 1,316 | n/a |
| Other vehicle expenses | 4,765 | 2,788 | 5,486 | 2,646 | 3,375 |
| Public and other transportation | 1,199 | 713 | 1,494 | 783 | 786 |
| Telephone services | 1,472 | 894 | 1,558 | 868 | 1,084 |
| Cellular phone service | 1,390 | 887 | 1,496 | 773 | 1,074 |
| Apparel and services | 2,010 | 1,375 | 2,466 | 969 | 1,245 |
| Entertainment | 4,084 | 1,629 | 4,576 | 2,248 | 2,233 |
| Rented dwellings (for reference) | 6,272 | 11,863 | 8,413 | 7,430 | 12,450 |

\*The 2025 tables call this line "Gasoline and other fuels". There is no longer a line called "gasoline and motor oil". "Gasoline" alone is $1,778 for under-25s.

Under-25 context: 5.94 million consumer units, average 2.0 people and 1.4 earners, 86% renters, mean pre-tax income $52,178, average age 21.9. That means "under 25" is household spending and is not per person. Many of these households have two people, so per-person spending is lower. Of the tables here, "One person" is the closest match for a single person, but it covers all ages.

## 3. USDA Food Plans, September 2026 (US average, monthly)

| Plan | Female 19-50 | Male 19-50 |
|---|---|---|
| Thrifty (age band is 20-50) | $253.90 | $319.00 |
| Low-cost | $276.30 | $317.70 |
| Moderate-cost | $336.40 | $398.40 |
| Liberal | $429.60 | $486.80 |

These costs are for one person in a 4-person household. USDA says to **add 20% for a 1-person household**. For example, a single male on the Thrifty plan is $319.00 × 1.20 = $382.80/month, and a single female on the Moderate plan is $336.40 × 1.20 = $403.68.

Parsing note: in the PDFs, the text sits one row below its numbers, so plain text extraction lines up the wrong rows. I checked every value above against the Excel files.

## 4. Worked example: single under-25 in Bend and in Portland

Method: CE under-25 national annual mean ÷ 12 × matching RPP ÷ 100. Goods covers food at home and apparel, other services covers food away from home and entertainment, and all items covers transportation and phone (telephone services).

**Bend (RPP 2024: all items 103.607, goods 105.261, other services 100.298)**

| Item | National monthly | RPP used | Bend monthly |
|---|---|---|---|
| Food at home | $4,375 / 12 = $364.58 | goods 105.261 | $364.58 × 1.05261 = **$383.76** |
| Food away from home | $3,580 / 12 = $298.33 | other 100.298 | $298.33 × 1.00298 = **$299.22** |
| Apparel and services | $1,375 / 12 = $114.58 | goods 105.261 | $114.58 × 1.05261 = **$120.61** |
| Entertainment | $1,629 / 12 = $135.75 | other 100.298 | $135.75 × 1.00298 = **$136.15** |
| Transportation | $11,127 / 12 = $927.25 | all 103.607 | $927.25 × 1.03607 = **$960.70** |
| Telephone services | $894 / 12 = $74.50 | all 103.607 | $74.50 × 1.03607 = **$77.19** |
| **Total** | **$1,915.00** | | **$1,977.64** |

**Portland (RPP 2024: all items 105.421, goods 105.222, other services 100.136)**

| Item | National monthly | RPP used | Portland monthly |
|---|---|---|---|
| Food at home | $364.58 | goods 105.222 | **$383.62** |
| Food away from home | $298.33 | other 100.136 | **$298.74** |
| Apparel and services | $114.58 | goods 105.222 | **$120.57** |
| Entertainment | $135.75 | other 100.136 | **$135.93** |
| Transportation | $927.25 | all 105.421 | **$977.52** |
| Telephone services | $74.50 | all 105.421 | **$78.54** |
| **Total** | **$1,915.00** | | **$1,994.92** |

### What this shows
- Bend and Portland come out only about $17/month apart on these items. That is because goods and other services are set at state level. The real gap between the two cities is rent (RPP 110 vs 125), which is not part of this example.
- Under-25 CE numbers are for households averaging 2 people, so they overstate costs for one person. For example, food at home is $364.58/month for an under-25 household, compared with $282/month for a one-person household ($3,385/12). The USDA single-person low-cost figure is about $332-381 ($276.30 or $317.70 × 1.2). For a single young adult, a better base would be a blend: one-person CE figures scaled toward the under-25 pattern, or USDA plans for food.
- Transportation is the largest line at about $960/month. It is driven by vehicle purchases ($479/month national for under-25s), which are lumpy averages across buyers and non-buyers.
- RPP year (2024) and CE year (2025) don't match. That is fine for relative price levels, but the dollar amounts are 2025 dollars.
