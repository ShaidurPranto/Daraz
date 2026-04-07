const pool = require("../config/db");
const SSLCommerzPayment = require("sslcommerz-lts");

const STORE_ID = process.env.SSLCOMMERZ_STORE_ID;
const STORE_PASSWORD = process.env.SSLCOMMERZ_STORE_PASSWORD;
const IS_LIVE = process.env.SSLCOMMERZ_IS_LIVE === "true";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:9000/api";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:9000";

const getOrCreateCartId = async (queryable, userId) => {
  const result = await queryable.query(
    `INSERT INTO carts (user_id)
         VALUES ($1)
         ON CONFLICT (user_id)
         DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id`,
    [userId],
  );

  return result.rows[0].id;
};

// ============================================================
// CHECKOUT — handles both COD and Online Payment
// ============================================================
const checkout = async (req, res) => {
  const client = await pool.connect();

  try {
    const { payment_method, shipping_address, coupon_code } = req.body;
    const userId = req.user.id;
    const cartId = await getOrCreateCartId(client, userId);

    if (!payment_method || !shipping_address) {
      return res.status(400).json({
        status: "error",
        message: "payment_method and shipping_address are required",
      });
    }

    const normalizedPaymentMethod = String(payment_method).trim();

    if (!["Cash on Delivery", "Online Payment"].includes(normalizedPaymentMethod)) {
      return res.status(400).json({
        status: "error",
        message: "payment_method must be 'Cash on Delivery' or 'Online Payment'",
      });
    }

    await client.query("BEGIN");

    const cartResult = await client.query(
      `SELECT
                ci.id,
                ci.product_id,
                ci.quantity,
                p.name,
                p.stock,
                COALESCE(p.discount_price, p.price) AS effective_price
            FROM cart_items ci
            JOIN products p ON p.id = ci.product_id
            WHERE ci.cart_id = $1
            ORDER BY ci.id ASC
            FOR UPDATE OF p`,
      [cartId],
    );

    const cartItems = cartResult.rows;

    if (cartItems.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        status: "error",
        message: "Cart is empty",
      });
    }

    for (const item of cartItems) {
      if (item.quantity > item.stock) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          status: "error",
          message: `Insufficient stock for product: ${item.name}`,
        });
      }
    }

    const totalAmount = cartItems.reduce((sum, item) => {
      return sum + Number(item.effective_price) * Number(item.quantity);
    }, 0);

    // ---- Coupon validation (inside transaction, row-locked) ----
    let discountAmount = 0;
    let appliedCouponCode = null;

    if (coupon_code && String(coupon_code).trim()) {
      const couponResult = await client.query(
        `SELECT * FROM coupons WHERE code = $1 FOR UPDATE`,
        [String(coupon_code).toUpperCase().trim()],
      );

      if (couponResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ status: "error", message: "Invalid coupon code" });
      }

      const coupon = couponResult.rows[0];
      const now = new Date();

      if (!coupon.is_active) {
        await client.query("ROLLBACK");
        return res.status(400).json({ status: "error", message: "This coupon is no longer active" });
      }
      if (now < new Date(coupon.start_date)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ status: "error", message: "This coupon is not yet valid" });
      }
      if (now > new Date(coupon.end_date)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ status: "error", message: "This coupon has expired" });
      }
      if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
        await client.query("ROLLBACK");
        return res.status(400).json({ status: "error", message: "This coupon has reached its usage limit" });
      }
      if (totalAmount < Number(coupon.min_order_amount)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          status: "error",
          message: `Minimum order amount of ৳${Number(coupon.min_order_amount).toFixed(2)} required for this coupon`,
        });
      }

      if (coupon.discount_type === "percentage") {
        discountAmount = (totalAmount * Number(coupon.discount_value)) / 100;
        if (coupon.max_discount_amount) {
          discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
        }
      } else {
        discountAmount = Math.min(Number(coupon.discount_value), totalAmount);
      }
      discountAmount = Number(discountAmount.toFixed(2));
      appliedCouponCode = coupon.code;

      await client.query(
        `UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`,
        [coupon.id],
      );
    }

    const finalAmount = Number((totalAmount - discountAmount).toFixed(2));

    // Generate a unique transaction ID for SSLCommerz
    const tranId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const isOnlinePayment = normalizedPaymentMethod === "Online Payment";

    // Create the order
    const orderResult = await client.query(
      `INSERT INTO orders (
                user_id,
                total_amount,
                discount_amount,
                coupon_code,
                payment_method,
                payment_status,
                order_status,
                shipping_address,
                tran_id,
                expires_at
            )
            VALUES ($1, $2, $3, $4, $5, 'Unpaid', 'Pending', $6, $7, $8)
            RETURNING id, total_amount, discount_amount, coupon_code`,
      [
        userId,
        finalAmount,
        discountAmount,
        appliedCouponCode,
        normalizedPaymentMethod,
        shipping_address,
        isOnlinePayment ? tranId : null,
        isOnlinePayment ? new Date(Date.now() + 10 * 60 * 1000) : null,
      ],
    );

    const order = orderResult.rows[0];

    // Insert order items, deduct stock, insert bookings
    for (const item of cartItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
                 VALUES ($1, $2, $3, $4)`,
        [order.id, item.product_id, item.quantity, item.effective_price],
      );

      const stockUpdateResult = await client.query(
        `UPDATE products
                 SET stock = stock - $1
                 WHERE id = $2 AND stock >= $1
                 RETURNING id`,
        [item.quantity, item.product_id],
      );

      if (stockUpdateResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          status: "error",
          message: `Insufficient stock for product: ${item.name}`,
        });
      }

      // Insert booking reservation
      await client.query(
        `INSERT INTO bookings (user_id, product_id, order_id, booking_count)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (order_id, product_id)
                 DO UPDATE SET booking_count = bookings.booking_count + EXCLUDED.booking_count`,
        [userId, item.product_id, order.id, item.quantity],
      );
    }

    // Clear cart
    await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
    await client.query("COMMIT");

    // ---- COD: done ----
    if (!isOnlinePayment) {
      return res.status(201).json({
        status: "success",
        message: "Order placed successfully",
        data: {
          orderId: order.id,
          total_amount: Number(order.total_amount),
          discount_amount: Number(order.discount_amount),
          coupon_code: order.coupon_code,
          redirect: false,
        },
      });
    }

    // ---- Online Payment: init SSLCommerz ----
    // Get user details for SSLCommerz
    const userResult = await pool.query(
      `SELECT name, email, phone FROM users WHERE id = $1`,
      [userId],
    );
    const user = userResult.rows[0];

    // Build product name summary
    const productNames = cartItems.map((i) => i.name).join(", ");

    const sslczData = {
      total_amount: Number(finalAmount),
      currency: "BDT",
      tran_id: tranId,
      success_url: `${BACKEND_URL}/orders/payment/success`,
      fail_url: `${BACKEND_URL}/orders/payment/fail`,
      cancel_url: `${BACKEND_URL}/orders/payment/cancel`,
      ipn_url: `${BACKEND_URL}/orders/payment/ipn`,
      shipping_method: "Courier",
      product_name: productNames.substring(0, 255),
      product_category: "General",
      product_profile: "general",
      cus_name: user.name || "Customer",
      cus_email: user.email || "customer@example.com",
      cus_add1: shipping_address,
      cus_city: "Dhaka",
      cus_postcode: "1000",
      cus_country: "Bangladesh",
      cus_phone: user.phone || "01700000000",
      ship_name: user.name || "Customer",
      ship_add1: shipping_address,
      ship_city: "Dhaka",
      ship_postcode: 1000,
      ship_country: "Bangladesh",
    };

    const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWORD, IS_LIVE);
    const apiResponse = await sslcz.init(sslczData);

    if (!apiResponse?.GatewayPageURL) {
      // SSLCommerz init failed — roll back the order
      // We already committed, so we need to manually revert
      const revertClient = await pool.connect();
      try {
        await revertClient.query("BEGIN");
        // Restore stock
        for (const item of cartItems) {
          await revertClient.query(
            `UPDATE products SET stock = stock + $1 WHERE id = $2`,
            [item.quantity, item.product_id],
          );
        }
        // Delete bookings
        await revertClient.query(
          `DELETE FROM bookings WHERE order_id = $1`,
          [order.id],
        );
        // Mark order as failed
        await revertClient.query(
          `UPDATE orders SET order_status = 'Failed', payment_status = 'Failed', expires_at = NULL WHERE id = $1`,
          [order.id],
        );
        await revertClient.query("COMMIT");
      } catch (revertErr) {
        await revertClient.query("ROLLBACK");
        console.error("[Checkout] Revert failed:", revertErr.message);
      } finally {
        revertClient.release();
      }

      return res.status(500).json({
        status: "error",
        message: "Failed to initialize payment gateway",
      });
    }

    return res.status(201).json({
      status: "success",
      message: "Order created, redirecting to payment",
      data: {
        orderId: order.id,
        total_amount: Number(order.total_amount),
        discount_amount: Number(order.discount_amount),
        coupon_code: order.coupon_code,
        redirect: true,
        checkout_url: apiResponse.GatewayPageURL,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({
      status: "error",
      message: "Checkout failed",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// ============================================================
// SSLCommerz Payment Callbacks
// ============================================================

const paymentSuccess = async (req, res) => {
  const client = await pool.connect();
  try {
    const { val_id, tran_id } = req.body;

    if (!val_id || !tran_id) {
      return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
    }

    // Validate the payment with SSLCommerz
    const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWORD, IS_LIVE);
    const validationResponse = await sslcz.validate({ val_id });

    if (validationResponse.status !== "VALID" && validationResponse.status !== "VALIDATED") {
      return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
    }

    await client.query("BEGIN");

    // Find and lock the order
    const orderResult = await client.query(
      `SELECT id, user_id, order_status FROM orders WHERE tran_id = $1 FOR UPDATE`,
      [tran_id],
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
    }

    const order = orderResult.rows[0];

    // Only update if still pending (avoid double-processing)
    if (order.order_status !== "Pending") {
      await client.query("ROLLBACK");
      return res.redirect(
        `${FRONTEND_URL}/checkout/success?order_id=${order.id}`,
      );
    }

    // Update order status
    await client.query(
      `UPDATE orders
       SET order_status = 'Paid',
           payment_status = 'Paid',
           val_id = $1,
           expires_at = NULL
       WHERE id = $2`,
      [val_id, order.id],
    );

    // Delete bookings (reservation complete — payment confirmed)
    await client.query(
      `DELETE FROM bookings WHERE order_id = $1`,
      [order.id],
    );

    await client.query("COMMIT");

    return res.redirect(
      `${FRONTEND_URL}/checkout/success?order_id=${order.id}`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Payment Success] Error:", error.message);
    return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
  } finally {
    client.release();
  }
};

const paymentFail = async (req, res) => {
  const client = await pool.connect();
  try {
    const { tran_id } = req.body;

    if (!tran_id) {
      return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT o.id, o.user_id, o.order_status
       FROM orders o
       WHERE o.tran_id = $1
       FOR UPDATE OF o`,
      [tran_id],
    );

    if (orderResult.rows.length === 0 || orderResult.rows[0].order_status !== "Pending") {
      await client.query("ROLLBACK");
      return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
    }

    const order = orderResult.rows[0];

    // Restore stock
    await client.query(
      `UPDATE products p
       SET stock = p.stock + oi.quantity
       FROM order_items oi
       WHERE oi.product_id = p.id AND oi.order_id = $1`,
      [order.id],
    );

    // Delete bookings
    await client.query(
      `DELETE FROM bookings WHERE order_id = $1`,
      [order.id],
    );

    // Mark order as failed
    await client.query(
      `UPDATE orders
       SET order_status = 'Failed',
           payment_status = 'Failed',
           expires_at = NULL
       WHERE id = $1`,
      [order.id],
    );

    await client.query("COMMIT");
    return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Payment Fail] Error:", error.message);
    return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
  } finally {
    client.release();
  }
};

const paymentCancel = async (req, res) => {
  const client = await pool.connect();
  try {
    const { tran_id } = req.body;

    if (!tran_id) {
      return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT o.id, o.user_id, o.order_status
       FROM orders o
       WHERE o.tran_id = $1
       FOR UPDATE OF o`,
      [tran_id],
    );

    if (orderResult.rows.length === 0 || orderResult.rows[0].order_status !== "Pending") {
      await client.query("ROLLBACK");
      return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
    }

    const order = orderResult.rows[0];

    // Restore stock
    await client.query(
      `UPDATE products p
       SET stock = p.stock + oi.quantity
       FROM order_items oi
       WHERE oi.product_id = p.id AND oi.order_id = $1`,
      [order.id],
    );

    // Delete bookings
    await client.query(
      `DELETE FROM bookings WHERE order_id = $1`,
      [order.id],
    );

    // Mark order as cancelled
    await client.query(
      `UPDATE orders
       SET order_status = 'Failed',
           payment_status = 'Cancelled',
           expires_at = NULL
       WHERE id = $1`,
      [order.id],
    );

    await client.query("COMMIT");
    return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Payment Cancel] Error:", error.message);
    return res.redirect(`${FRONTEND_URL}/checkout/cancel`);
  } finally {
    client.release();
  }
};

const paymentIPN = async (req, res) => {
  const client = await pool.connect();
  try {
    const { val_id, tran_id, status } = req.body;

    if (!val_id || !tran_id) {
      return res.status(400).json({ status: "error", message: "Missing val_id or tran_id" });
    }

    // Only process successful payments
    if (status !== "VALID" && status !== "VALIDATED") {
      return res.status(200).json({ status: "ok" });
    }

    // Validate with SSLCommerz
    const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWORD, IS_LIVE);
    const validationResponse = await sslcz.validate({ val_id });

    if (validationResponse.status !== "VALID" && validationResponse.status !== "VALIDATED") {
      return res.status(200).json({ status: "ok" });
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT id, user_id, order_status FROM orders WHERE tran_id = $1 FOR UPDATE`,
      [tran_id],
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(200).json({ status: "ok" });
    }

    const order = orderResult.rows[0];

    if (order.order_status !== "Pending") {
      await client.query("ROLLBACK");
      return res.status(200).json({ status: "ok" });
    }

    await client.query(
      `UPDATE orders
       SET order_status = 'Paid',
           payment_status = 'Paid',
           val_id = $1,
           expires_at = NULL
       WHERE id = $2`,
      [val_id, order.id],
    );

    await client.query(
      `DELETE FROM bookings WHERE order_id = $1`,
      [order.id],
    );

    await client.query("COMMIT");
    return res.status(200).json({ status: "ok" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[IPN] Error:", error.message);
    return res.status(200).json({ status: "ok" });
  } finally {
    client.release();
  }
};

// ============================================================
// VIEW ORDERS
// ============================================================

const viewOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
                o.id,
                o.total_amount,
                o.order_status,
                o.payment_method,
                o.payment_status,
                o.created_at,
                oi.id AS order_item_id,
                oi.product_id,
                p.name AS product_name,
                p.image_url,
                oi.quantity,
                oi.price,
                oi.rating,
                oi.review,
                oi.review_date
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE o.user_id = $1
            ORDER BY o.created_at DESC, oi.id ASC`,
      [userId],
    );

    const grouped = [];
    const orderMap = new Map();

    for (const row of result.rows) {
      if (!orderMap.has(row.id)) {
        const order = {
          id: row.id,
          total_amount: Number(row.total_amount),
          order_status: row.order_status,
          payment_method: row.payment_method,
          payment_status: row.payment_status,
          created_at: row.created_at,
          order_items: [],
        };
        orderMap.set(row.id, order);
        grouped.push(order);
      }

      if (row.order_item_id) {
        orderMap.get(row.id).order_items.push({
          id: row.order_item_id,
          product_id: row.product_id,
          product_name: row.product_name,
          image_url: row.image_url,
          quantity: row.quantity,
          price: Number(row.price),
          rating: row.rating,
          review: row.review,
          review_date: row.review_date,
        });
      }
    }

    res.json({
      status: "success",
      data: grouped,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve orders",
      error: error.message,
    });
  }
};

const getOrderById = async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id;

    const result = await pool.query(
      `SELECT
                o.id,
                o.total_amount,
                o.order_status,
                o.payment_method,
                o.payment_status,
                o.shipping_address,
                o.created_at,
                oi.id AS order_item_id,
                oi.product_id,
                p.name AS product_name,
                p.image_url,
                oi.quantity,
                oi.price,
                oi.rating,
                oi.review,
                oi.review_date
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE o.id = $1 AND o.user_id = $2
            ORDER BY oi.id ASC`,
      [orderId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Order not found",
      });
    }

    const firstRow = result.rows[0];
    const order = {
      id: firstRow.id,
      total_amount: Number(firstRow.total_amount),
      order_status: firstRow.order_status,
      payment_method: firstRow.payment_method,
      payment_status: firstRow.payment_status,
      shipping_address: firstRow.shipping_address,
      created_at: firstRow.created_at,
      order_items: result.rows
        .filter((row) => row.order_item_id)
        .map((row) => ({
          id: row.order_item_id,
          product_id: row.product_id,
          product_name: row.product_name,
          quantity: row.quantity,
          price: Number(row.price),
          image_url: row.image_url,
          rating: row.rating,
          review: row.review,
          review_date: row.review_date,
        })),
    };

    res.json({
      status: "success",
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve order",
      error: error.message,
    });
  }
};

module.exports = {
  checkout,
  viewOrders,
  getOrderById,
  paymentSuccess,
  paymentFail,
  paymentCancel,
  paymentIPN,
};
