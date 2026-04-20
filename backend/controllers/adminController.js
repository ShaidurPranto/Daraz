const pool = require("../config/db");

const isValidUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const formatDateOnly = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseDateOnly = (value) => {
  if (!value || typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dt = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : value;
};

const getCompletedOrders = async (req, res) => {
  try {
    const { name = "" } = req.query;
    const params = [];
    let paramCount = 1;

    let query = `
      SELECT
        o.id,
        o.user_id,
        u.name AS user_name,
        u.email AS user_email,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.shipping_address,
        o.created_at,
        COUNT(oi.id)::int AS total_items
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE 1=1
    `;

    if (name && String(name).trim()) {
      query += ` AND LOWER(u.name) LIKE LOWER($${paramCount})`;
      params.push(`%${String(name).trim()}%`);
      paramCount++;
    }

    query += `
      GROUP BY o.id, u.id
      ORDER BY o.created_at DESC
    `;

    const result = await pool.query(query, params);

    res.json({
      status: "success",
      data: result.rows.map((row) => ({
        ...row,
        total_amount: Number(row.total_amount),
      })),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve completed orders",
      error: error.message,
    });
  }
};

const getAdminOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid order id",
      });
    }

    const result = await pool.query(
      `SELECT
        o.id,
        o.user_id,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        o.total_amount,
        COALESCE(o.discount_amount, 0) AS discount_amount,
        o.coupon_code,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.shipping_address,
        o.created_at,
        oi.id AS order_item_id,
        oi.product_id,
        p.name AS product_name,
        p.brand,
        p.image_url,
        oi.quantity,
        oi.price,
        oi.rating,
        oi.review,
        oi.review_date
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.id = $1
      ORDER BY oi.id ASC`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Order not found",
      });
    }

    const first = result.rows[0];

    const order = {
      id: first.id,
      user: {
        id: first.user_id,
        name: first.user_name,
        email: first.user_email,
        phone: first.user_phone,
      },
      total_amount: Number(first.total_amount),
      discount_amount: Number(first.discount_amount),
      coupon_code: first.coupon_code || null,
      payment_method: first.payment_method,
      payment_status: first.payment_status,
      order_status: first.order_status,
      shipping_address: first.shipping_address,
      created_at: first.created_at,
      order_items: result.rows
        .filter((row) => row.order_item_id)
        .map((row) => ({
          id: row.order_item_id,
          product_id: row.product_id,
          product_name: row.product_name,
          brand: row.brand,
          image_url: row.image_url,
          quantity: row.quantity,
          price: Number(row.price),
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
      message: "Failed to retrieve order details",
      error: error.message,
    });
  }
};

const getAllUsersWithStatus = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.created_at,
        COALESCE(stats.total_orders, 0)::int AS total_orders,
        COALESCE(stats.total_spent, 0)::numeric AS total_spent,
        stats.last_order_at,
        ua.last_cart_activity AS last_cart_at,
        ua.last_seen_at,
        COALESCE(
          GREATEST(
            ua.last_seen_at,
            u.created_at,
            COALESCE(stats.last_order_at, u.created_at),
            COALESCE(ua.last_cart_activity, u.created_at)
          ),
          u.created_at
        ) AS last_activity_at,
        CASE
          WHEN ua.last_seen_at >= NOW() - INTERVAL '15 minutes'
          THEN 'Online'
          ELSE 'Offline'
        END AS status
      FROM users u
      LEFT JOIN user_activity ua ON ua.user_id = u.id
      LEFT JOIN (
        SELECT
          u2.id AS user_id,
          COUNT(DISTINCT o.id) AS total_orders,
          SUM(o.total_amount) AS total_spent,
          MAX(o.created_at) AS last_order_at
        FROM users u2
        LEFT JOIN orders o ON o.user_id = u2.id
        GROUP BY u2.id
      ) stats ON stats.user_id = u.id
      WHERE u.is_admin = FALSE
      ORDER BY u.created_at DESC`,
    );

    res.json({
      status: "success",
      data: result.rows.map((row) => ({
        ...row,
        total_spent: Number(row.total_spent),
      })),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve users",
      error: error.message,
    });
  }
};

const getAdminDashboardStats = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM users WHERE is_admin = FALSE) AS total_users,
        (SELECT COUNT(*)::int FROM orders) AS total_orders,
        (SELECT COUNT(*)::int FROM products) AS total_products,
        (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM orders) AS gross_order_amount`,
    );

    const row = result.rows[0];
    const grossAmount = Number(row.gross_order_amount || 0);
    const revenue = Number((grossAmount * 0.01).toFixed(2));

    res.json({
      status: "success",
      data: {
        total_users: Number(row.total_users || 0),
        total_orders: Number(row.total_orders || 0),
        total_products: Number(row.total_products || 0),
        total_revenue: revenue,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve dashboard stats",
      error: error.message,
    });
  }
};

const getAdminSalesAnalytics = async (req, res) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const defaultEnd = formatDateOnly(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - 29);
    const defaultStart = formatDateOnly(defaultStartDate);

    const startDate = parseDateOnly(req.query.start_date) || defaultStart;
    const endDate = parseDateOnly(req.query.end_date) || defaultEnd;

    if (startDate > endDate) {
      return res.status(400).json({
        status: "error",
        message: "start_date cannot be later than end_date",
      });
    }

    const dailyResult = await pool.query(
      `WITH date_series AS (
          SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
        )
        SELECT
          ds.day::text AS date,
          COALESCE(COUNT(o.id), 0)::int AS order_count,
          COALESCE(SUM(o.total_amount), 0)::numeric AS gross_revenue
        FROM date_series ds
        LEFT JOIN orders o
          ON o.created_at >= ds.day
          AND o.created_at < ds.day + interval '1 day'
        GROUP BY ds.day
        ORDER BY ds.day ASC`,
      [startDate, endDate],
    );

    const topProductsResult = await pool.query(
      `SELECT
          p.id,
          p.name,
          p.brand,
          COALESCE(SUM(oi.quantity), 0)::int AS units_sold,
          COALESCE(SUM(oi.quantity * oi.price), 0)::numeric AS gross_sales
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.created_at >= $1::date
          AND o.created_at < ($2::date + interval '1 day')
        GROUP BY p.id, p.name, p.brand
        ORDER BY units_sold DESC, gross_sales DESC
        LIMIT 10`,
      [startDate, endDate],
    );

    const summaryResult = await pool.query(
      `SELECT
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(total_amount), 0)::numeric AS gross_revenue
        FROM orders
        WHERE created_at >= $1::date
          AND created_at < ($2::date + interval '1 day')`,
      [startDate, endDate],
    );

    const summary = summaryResult.rows[0];
    const grossRevenue = Number(summary.gross_revenue || 0);

    const daily = dailyResult.rows.map((row) => {
      const gross = Number(row.gross_revenue || 0);
      return {
        date: row.date,
        order_count: Number(row.order_count || 0),
        gross_revenue: gross,
        commission_revenue: Number((gross * 0.01).toFixed(2)),
      };
    });

    const topProducts = topProductsResult.rows.map((row) => {
      const grossSales = Number(row.gross_sales || 0);
      return {
        id: row.id,
        name: row.name,
        brand: row.brand,
        units_sold: Number(row.units_sold || 0),
        gross_sales: grossSales,
        commission_revenue: Number((grossSales * 0.01).toFixed(2)),
      };
    });

    res.json({
      status: "success",
      data: {
        range: {
          start_date: startDate,
          end_date: endDate,
        },
        summary: {
          total_orders: Number(summary.total_orders || 0),
          gross_revenue: grossRevenue,
          commission_revenue: Number((grossRevenue * 0.01).toFixed(2)),
        },
        daily,
        top_products: topProducts,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve sales analytics",
      error: error.message,
    });
  }
};

const getAdminUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid user id",
      });
    }

    const userResult = await pool.query(
      `SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.created_at,
        ua.last_seen_at,
        CASE
          WHEN ua.last_seen_at >= NOW() - INTERVAL '15 minutes'
          THEN 'Online'
          ELSE 'Offline'
        END AS status,
        COALESCE(stats.total_orders, 0)::int AS total_orders,
        COALESCE(stats.total_spent, 0)::numeric AS total_spent,
        stats.last_order_at,
        ua.last_cart_activity AS last_cart_at
      FROM users u
      LEFT JOIN user_activity ua ON ua.user_id = u.id
      LEFT JOIN (
        SELECT
          o.user_id,
          COUNT(o.id) AS total_orders,
          SUM(o.total_amount) AS total_spent,
          MAX(o.created_at) AS last_order_at
        FROM orders o
        GROUP BY o.user_id
      ) stats ON stats.user_id = u.id
      WHERE u.id = $1 AND u.is_admin = FALSE`,
      [id],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    const ordersResult = await pool.query(
      `SELECT
        o.id,
        o.total_amount,
        o.payment_status,
        o.order_status,
        o.created_at,
        COUNT(oi.id)::int AS total_items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 20`,
      [id],
    );

    const user = userResult.rows[0];

    res.json({
      status: "success",
      data: {
        ...user,
        total_spent: Number(user.total_spent || 0),
        recent_orders: ordersResult.rows.map((row) => ({
          ...row,
          total_amount: Number(row.total_amount),
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve user details",
      error: error.message,
    });
  }
};

const VALID_TRANSITIONS = {
  "Cash on Delivery": {
    Pending: ["Confirmed", "Canceled"],
    Confirmed: ["Delivered"],
  },
  "Online Payment": {
    Paid: ["Delivered"],
  },
};

const updateOrderStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { order_status } = req.body;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid order id",
      });
    }

    if (!order_status) {
      return res.status(400).json({
        status: "error",
        message: "order_status is required",
      });
    }

    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT id, order_status, payment_method FROM orders WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        status: "error",
        message: "Order not found",
      });
    }

    const order = orderResult.rows[0];
    const transitions = VALID_TRANSITIONS[order.payment_method];

    if (!transitions) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        status: "error",
        message: `No status transitions available for payment method: ${order.payment_method}`,
      });
    }

    const allowedNext = transitions[order.order_status];

    if (!allowedNext || !allowedNext.includes(order_status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        status: "error",
        message: `Cannot transition from '${order.order_status}' to '${order_status}' for ${order.payment_method}`,
      });
    }

    // For COD orders being Canceled, restore stock and remove bookings
    if (order_status === "Canceled") {
      const itemsRes = await client.query(
        `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
        [id]
      );
      for (const item of itemsRes.rows) {
        await client.query(
          `UPDATE products SET stock = stock + $1 WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }
      await client.query(`DELETE FROM bookings WHERE order_id = $1`, [id]);
    }

    // For COD orders being Delivered, auto-set payment_status to Paid
    const updatePaymentToo =
      order.payment_method === "Cash on Delivery" && order_status === "Delivered";
    const cancelPaymentToo = order_status === "Canceled";

    let paymentUpdateSql = "";
    if (updatePaymentToo) paymentUpdateSql = ", payment_status = 'Paid'";
    else if (cancelPaymentToo) paymentUpdateSql = ", payment_status = 'Cancelled'";

    await client.query(
      `UPDATE orders SET order_status = $1${paymentUpdateSql} WHERE id = $2`,
      [order_status, id],
    );

    await client.query("COMMIT");

    res.json({
      status: "success",
      message: `Order status updated to '${order_status}'`,
      data: {
        id,
        order_status,
        payment_method: order.payment_method,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({
      status: "error",
      message: "Failed to update order status",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAdminDashboardStats,
  getAdminSalesAnalytics,
  getCompletedOrders,
  getAdminOrderById,
  getAllUsersWithStatus,
  getAdminUserById,
  updateOrderStatus,
};
