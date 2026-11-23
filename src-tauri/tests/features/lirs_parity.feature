Feature: LIRS calculator parity
  As a LagosFile maintainer
  I want the app's tax figures to match the LIRS eTax calculator for the same inputs
  So that returns prepared in LagosFile agree with what LIRS assesses

  Testers run each example row on the LIRS portal and fill in the lirs_* columns,
  recorded_by and recorded_on. Amounts are annual naira, without ₦ signs or separators.
  Leave a lirs_* cell blank if the portal doesn't show that figure.
  Rows with every lirs_* cell blank have not been run yet and are skipped in CI.
  Put any portal differences in a comment above the row, e.g. "# LIRS-08: portal asked for the relief, not rent paid".

  Background:
    Given I am logged in to the LIRS eTax portal
    And I have opened the tax calculator
    # LIRS Year In View 2027 covers 2026 income under NTA 2025 (per D1/D2).
    And I have started a fresh calculation with Year In View set to 2027

  Scenario Outline: Salary only, across the tax bands
    When I enter <salary> as Employment under Earned Income
    And I run the calculation
    Then LIRS showed total income "<lirs_total_income>", chargeable income "<lirs_chargeable_income>", gross tax "<lirs_gross_tax>" and tax payable "<lirs_tax_payable>"
    And case <case> was recorded by "<recorded_by>" on "<recorded_on>"
    And LagosFile computes the same figures within ₦1

    Examples:
      | case    | salary   | lirs_total_income | lirs_chargeable_income | lirs_gross_tax | lirs_tax_payable | recorded_by | recorded_on |
      | LIRS-01 | 750000   |                   |                        |                |                  |             |             |
      | LIRS-02 | 800000   |                   |                        |                |                  |             |             |
      | LIRS-03 | 3000000  |                   |                        |                |                  |             |             |
      | LIRS-04 | 5000000  |                   |                        |                |                  |             |             |
      | LIRS-05 | 12000000 |                   |                        |                |                  |             |             |
      | LIRS-06 | 60000000 |                   |                        |                |                  |             |             |

  Scenario Outline: Salary with statutory deductions and life assurance
    When I enter <salary> as Employment under Earned Income
    And I enter <pension> as Pensions under Deductions
    And I enter <nhf> as National Housing Fund under Reliefs
    And I enter <nhis> as National Health Insurance Scheme under Reliefs
    And I enter <life_assurance> as Life Assurance under Reliefs
    And I run the calculation
    Then LIRS showed total income "<lirs_total_income>", chargeable income "<lirs_chargeable_income>", gross tax "<lirs_gross_tax>" and tax payable "<lirs_tax_payable>"
    And case <case> was recorded by "<recorded_by>" on "<recorded_on>"
    And LagosFile computes the same figures within ₦1

    Examples:
      | case    | salary  | pension | nhf    | nhis  | life_assurance | lirs_total_income | lirs_chargeable_income | lirs_gross_tax | lirs_tax_payable | recorded_by | recorded_on |
      | LIRS-07 | 5000000 | 400000  | 125000 | 50000 | 0              |                   |                        |                |                  |             |             |
      | LIRS-10 | 5000000 | 0       | 0      | 0     | 100000         |                   |                        |                |                  |             |             |

  # The calculator had no rent relief field as of the 26 May 2026 screenshots. Don't run these rows until it does.
  @pending
  Scenario Outline: Rent relief
    When I enter <salary> as Employment under Earned Income
    And I enter <rent_paid> as annual rent paid
    And I run the calculation
    Then LIRS showed total income "<lirs_total_income>", chargeable income "<lirs_chargeable_income>", gross tax "<lirs_gross_tax>" and tax payable "<lirs_tax_payable>"
    And case <case> was recorded by "<recorded_by>" on "<recorded_on>"
    And LagosFile computes the same figures within ₦1

    # If the portal asks for the relief amount instead of rent paid, enter 20% of rent paid capped at 500000,
    # and say so in a comment above the row.
    Examples:
      | case    | salary  | rent_paid | lirs_total_income | lirs_chargeable_income | lirs_gross_tax | lirs_tax_payable | recorded_by | recorded_on |
      | LIRS-08 | 5000000 | 2000000   |                   |                        |                |                  |             |             |
      | LIRS-09 | 5000000 | 4000000   |                   |                        |                |                  |             |             |

  Scenario Outline: Business income with a capital allowance
    When I enter <business_income> as Trade Business or profession under Earned Income
    And I enter <capital_allowance> as Capital Allowance under Adjustments for an asset costing <asset_cost>
    And I run the calculation
    Then LIRS showed total income "<lirs_total_income>", chargeable income "<lirs_chargeable_income>", gross tax "<lirs_gross_tax>" and tax payable "<lirs_tax_payable>"
    And case <case> was recorded by "<recorded_by>" on "<recorded_on>"
    And LagosFile computes the same figures within ₦1

    # capital_allowance is what to type into the portal. CI uses asset_cost with the
    # app's configured rate for "other" assets (25% today), so the two must agree.
    Examples:
      | case    | business_income | asset_cost | capital_allowance | lirs_total_income | lirs_chargeable_income | lirs_gross_tax | lirs_tax_payable | recorded_by | recorded_on |
      | LIRS-11 | 8000000         | 2000000    | 500000            |                   |                        |                |                  |             |             |

  Scenario Outline: Salary with a WHT credit
    When I enter <salary> as Employment under Earned Income
    And I enter <wht> as WHT Others under Withheld Taxes
    And I run the calculation
    Then LIRS showed total income "<lirs_total_income>", chargeable income "<lirs_chargeable_income>", gross tax "<lirs_gross_tax>" and tax payable "<lirs_tax_payable>"
    And case <case> was recorded by "<recorded_by>" on "<recorded_on>"
    And LagosFile computes the same figures within ₦1

    Examples:
      | case    | salary  | wht    | lirs_total_income | lirs_chargeable_income | lirs_gross_tax | lirs_tax_payable | recorded_by | recorded_on |
      | LIRS-12 | 6000000 | 150000 |                   |                        |                |                  |             |             |

  Scenario Outline: Several income sources
    When I enter <salary> as Employment under Earned Income
    And I enter <rental> as Rent under Unearned Income
    And I enter <dividend> as Dividend under Unearned Income
    And I enter <interest> as Interest under Unearned Income
    And I run the calculation
    Then LIRS showed total income "<lirs_total_income>", chargeable income "<lirs_chargeable_income>", gross tax "<lirs_gross_tax>" and tax payable "<lirs_tax_payable>"
    And case <case> was recorded by "<recorded_by>" on "<recorded_on>"
    And LagosFile computes the same figures within ₦1

    Examples:
      | case    | salary  | rental  | dividend | interest | lirs_total_income | lirs_chargeable_income | lirs_gross_tax | lirs_tax_payable | recorded_by | recorded_on |
      | LIRS-13 | 4000000 | 1200000 | 300000   | 200000   |                   |                        |                |                  |             |             |
