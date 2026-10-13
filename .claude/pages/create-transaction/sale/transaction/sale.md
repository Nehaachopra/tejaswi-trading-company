# sale

## Product Card Structure

### Header

- Product name on the left.
- Unit quantity options selection buttons on the right (e.g., 100 kg, 50 kg, 25 kg, 20 kg).
- Changing the pack size updates the relevant product details.

### Main Section

- Product image on the left. (on top for mobile view)
- Product details on the right (below image for mobile view):
  - Name - text
  - Available stock — quantity.
  - Price before GST — amount (hidden by default).
  - GST percentage — rate (hidden by default).
  - GST amount — amount (hidden by default).
  - Price after GST — amount.
  - Expand/collapse button beside the price-after-GST row to reveal or hide the three hidden pricing details.
  - Transaction price — editable input.
  - Quantity — editable input.

### Footer

- A quantity-allocation slider, with `0` on the left and the entered transaction quantity on the right. Hidden until quantity > 0 inputted!
- Godown allocation chips. Each chip contains:
  - Godown name.
  - Available stock quantity for that godown.
  - Allocated quantity input, hidden by default and revealed when the user inputs quantity > 0.

reference (for structure)
![alt text](../../images/sale-product-card.png)

# Page structure

For desktop - 
left side 
- filter (category, sub category, unit quantity, price) and sort on top
- carousel of product cards with Centered active product card and Adjacent cards partially visible and carousel contols below it.

Remember - 
A sale transaction has 3 levels - adding product in the cart, Followed by checkout into customer info part, followed by payment based on whether cash (cash, upi, bank transfer) or credit sale! 

Make sure in cart totals, add rows for packaging, shipping and handling costs with inputs!