godown

# 1. Godown section header

- calendar toggle button.
- stock count toggle

# 2. Godown cards

each card shall contain
  - header
    - Godown name.
    - Godown selection checkbox. (Hidden and visible in stock count mode)
    - Reset button. (Hidden and visible in stock count mode)
    - SKU count.
  - Collection of product entries, each containing
    - product selection checkbox (Hidden and visible in stock count mode)
    - Product image.
    - Product details:
      - Category.
      - Sub-category.
      - Brand.
      - Unit quantity.
      - Total quantity.
      - Actual quantity. (Hidden and visible in stock count mode)
      - Difference. (Hidden and visible in stock count mode)
      - Reason. (Hidden and visible in stock count mode)

Remember
- 2 level reconciliation status - Product level and Godown level.
- 2 modes, one is normal mode where we can see what product along with how much is presnt in a godown and other is stock count.
- Once all the products in a godown are counted, the godown is checked.
- And once all godowns are checked the date in calendar is colored.
