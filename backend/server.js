const express = require("express");
const pool = require("./config/db");
const productRoute = require("./routes/productRoute");
const reviewRoute = require("./routes/reviewRoute");
const aiRoute = require("./routes/aiRoute");
const authRoute = require("./routes/authRoute");
const orderRoute = require("./routes/orderRoute");
const cartRoute = require("./routes/cartRoute");
const adminRoute = require("./routes/adminRoute");
const couponRoute = require("./routes/couponRoute");
const activityMiddleware = require("./middleware/activityMiddleware");

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Track user activity & write audit log on every request
app.use(activityMiddleware);

app.use("/products", productRoute);
app.use("/reviews", reviewRoute);
app.use("/ai", aiRoute);
app.use("/auth", authRoute);
app.use("/orders", orderRoute);
app.use("/cart", cartRoute);
app.use("/admin", adminRoute);
app.use("/coupons", couponRoute);

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "success",
      message: "Daraz platform server is running!",
      db_time: result.rows[0].now,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      error: err.message,
    });
  }
});

// ============ Expiry Cron Job ============
// Every 60 seconds, expire stale online payment orders that passed the 10-minute window.
// Restores stock and deletes booking entries.
const expireStaleOrders = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find expired online payment orders
    const expiredOrders = await client.query(
      `SELECT o.id
       FROM orders o
       WHERE o.payment_method = 'Online Payment'
         AND o.order_status = 'Pending'
         AND o.expires_at IS NOT NULL
         AND o.expires_at < NOW()
       FOR UPDATE OF o`,
    );

    if (expiredOrders.rows.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const orderIds = expiredOrders.rows.map((r) => r.id);

    // Restore stock from order_items
    await client.query(
      `UPDATE products p
       SET stock = p.stock + oi.quantity
       FROM order_items oi
       WHERE oi.product_id = p.id
         AND oi.order_id = ANY($1::uuid[])`,
      [orderIds],
    );

    // Delete bookings for these orders
    await client.query(
      `DELETE FROM bookings WHERE order_id = ANY($1::uuid[])`,
      [orderIds],
    );

    // Mark orders as Failed
    await client.query(
      `UPDATE orders
       SET order_status = 'Failed',
           payment_status = 'Failed',
           expires_at = NULL
       WHERE id = ANY($1::uuid[])`,
      [orderIds],
    );

    await client.query("COMMIT");

    if (orderIds.length > 0) {
      console.log(
        `[Cron] Expired ${orderIds.length} stale online payment order(s)`,
      );
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Cron] Error expiring stale orders:", error.message);
  } finally {
    client.release();
  }
};

// Run every 60 seconds
setInterval(expireStaleOrders, 60 * 1000);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});