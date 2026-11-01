-- READ-ONLY production reconciliation audit.
-- Run with psql against a backup/staging copy first. Do not auto-adjust stock
-- or mark payments refunded from these results; review each order/payment with
-- gateway and inventory movement evidence before any corrective transaction.

-- 1) Paid/fulfillment orders whose committed reservation quantities appear
--    lower than their order-line quantities. This can identify historical
--    partial reservation settlement from the old webhook implementation.
SELECT
  o.id AS order_id,
  o.status AS order_status,
  oi.variant_id,
  oi.quantity AS ordered_quantity,
  COALESCE(SUM(ir.quantity), 0) AS committed_reservation_quantity,
  oi.quantity - COALESCE(SUM(ir.quantity), 0) AS apparent_shortfall
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN inventory_reservations ir
  ON ir.checkout_session_id = o.id
 AND ir.variant_id = oi.variant_id
 AND ir.status = 'COMMITTED'
WHERE o.status IN (
  'PAID',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURN_REQUESTED'
)
GROUP BY o.id, o.status, oi.id, oi.variant_id, oi.quantity
HAVING COALESCE(SUM(ir.quantity), 0) < oi.quantity
ORDER BY o.created_at ASC, o.id, oi.variant_id;

-- 2) Captured payments attached to cancelled/failed/refunded orders where the
--    processed refund total does not cover the captured payment. Pending and
--    failed refund rows are reported separately for manual gateway reconciliation.
SELECT
  p.id AS payment_id,
  o.id AS order_id,
  o.status AS order_status,
  p.status AS payment_status,
  p.amount_cents AS captured_amount_cents,
  COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status = 'PROCESSED'), 0)
    AS processed_refund_cents,
  COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status = 'PENDING'), 0)
    AS pending_refund_cents,
  COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status = 'FAILED'), 0)
    AS failed_refund_cents
FROM payments p
JOIN orders o ON o.id = p.order_id
LEFT JOIN refunds r ON r.payment_id = p.id
WHERE o.status IN ('CANCELLED', 'PAYMENT_FAILED', 'REFUNDED')
  AND p.status IN ('CAPTURED', 'REFUNDED')
GROUP BY p.id, o.id, o.status, p.status, p.amount_cents
HAVING
  COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status = 'PROCESSED'), 0)
    < p.amount_cents
ORDER BY o.created_at ASC, o.id, p.id;
