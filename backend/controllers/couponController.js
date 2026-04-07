const pool = require("../config/db");

const isValidUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const VALID_CHANNELS = ["TV", "Facebook", "Newspaper", "Other"];

const formatCoupon = (row) => ({
  ...row,
  discount_value: Number(row.discount_value),
  min_order_amount: Number(row.min_order_amount),
  max_discount_amount: row.max_discount_amount ? Number(row.max_discount_amount) : null,
  used_count: Number(row.used_count),
  usage_limit: row.usage_limit !== null ? Number(row.usage_limit) : null,
});

// POST /coupons (admin)
const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discount_type,
      discount_value,
      min_order_amount = 0,
      max_discount_amount = null,
      start_date,
      end_date,
      usage_limit = null,
      promotion_channels = [],
      promotion_notes = null,
    } = req.body;

    if (!code || !discount_type || discount_value === undefined || !start_date || !end_date) {
      return res.status(400).json({
        status: "error",
        message: "code, discount_type, discount_value, start_date, and end_date are required",
      });
    }

    if (!["percentage", "fixed"].includes(discount_type)) {
      return res.status(400).json({
        status: "error",
        message: "discount_type must be 'percentage' or 'fixed'",
      });
    }

    const discountVal = Number(discount_value);
    if (isNaN(discountVal) || discountVal <= 0) {
      return res.status(400).json({
        status: "error",
        message: "discount_value must be a positive number",
      });
    }

    if (discount_type === "percentage" && discountVal > 100) {
      return res.status(400).json({
        status: "error",
        message: "Percentage discount cannot exceed 100%",
      });
    }

    if (new Date(start_date) >= new Date(end_date)) {
      return res.status(400).json({
        status: "error",
        message: "start_date must be before end_date",
      });
    }

    const channels = Array.isArray(promotion_channels) ? promotion_channels : [];
    const invalidChannels = channels.filter((c) => !VALID_CHANNELS.includes(c));
    if (invalidChannels.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Invalid promotion channels: ${invalidChannels.join(", ")}. Valid: ${VALID_CHANNELS.join(", ")}`,
      });
    }

    const result = await pool.query(
      `INSERT INTO coupons (
        code, discount_type, discount_value, min_order_amount, max_discount_amount,
        start_date, end_date, usage_limit, promotion_channels, promotion_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        code.toUpperCase().trim(),
        discount_type,
        discountVal,
        Number(min_order_amount) || 0,
        max_discount_amount ? Number(max_discount_amount) : null,
        start_date,
        end_date,
        usage_limit ? Number(usage_limit) : null,
        channels,
        promotion_notes || null,
      ],
    );

    res.status(201).json({
      status: "success",
      message: "Coupon created successfully",
      data: formatCoupon(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "A coupon with this code already exists",
      });
    }
    res.status(500).json({
      status: "error",
      message: "Failed to create coupon",
      error: error.message,
    });
  }
};

// GET /coupons (admin)
const getCoupons = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM coupons ORDER BY created_at DESC`);
    res.json({
      status: "success",
      data: result.rows.map(formatCoupon),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve coupons",
      error: error.message,
    });
  }
};

// GET /coupons/:id (admin)
const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid coupon id" });
    }

    const result = await pool.query(`SELECT * FROM coupons WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Coupon not found" });
    }

    res.json({ status: "success", data: formatCoupon(result.rows[0]) });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve coupon",
      error: error.message,
    });
  }
};

// PUT /coupons/:id (admin) - full update
const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid coupon id" });
    }

    const existing = await pool.query(`SELECT * FROM coupons WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Coupon not found" });
    }

    const cur = existing.rows[0];
    const {
      code,
      discount_type,
      discount_value,
      min_order_amount,
      max_discount_amount,
      start_date,
      end_date,
      usage_limit,
      is_active,
      promotion_channels,
      promotion_notes,
    } = req.body;

    const newCode = code ? code.toUpperCase().trim() : cur.code;
    const newDiscountType = discount_type || cur.discount_type;
    const newDiscountValue = discount_value !== undefined ? Number(discount_value) : Number(cur.discount_value);
    const newMinOrder = min_order_amount !== undefined ? Number(min_order_amount) : Number(cur.min_order_amount);
    const newMaxDiscount =
      max_discount_amount !== undefined
        ? max_discount_amount ? Number(max_discount_amount) : null
        : cur.max_discount_amount;
    const newStartDate = start_date || cur.start_date;
    const newEndDate = end_date || cur.end_date;
    const newUsageLimit =
      usage_limit !== undefined ? (usage_limit ? Number(usage_limit) : null) : cur.usage_limit;
    const newIsActive = is_active !== undefined ? Boolean(is_active) : cur.is_active;
    const newChannels = Array.isArray(promotion_channels) ? promotion_channels : cur.promotion_channels;
    const newNotes = promotion_notes !== undefined ? promotion_notes : cur.promotion_notes;

    if (!["percentage", "fixed"].includes(newDiscountType)) {
      return res.status(400).json({ status: "error", message: "discount_type must be 'percentage' or 'fixed'" });
    }
    if (newDiscountValue <= 0) {
      return res.status(400).json({ status: "error", message: "discount_value must be positive" });
    }
    if (new Date(newStartDate) >= new Date(newEndDate)) {
      return res.status(400).json({ status: "error", message: "start_date must be before end_date" });
    }

    const invalidChannels = newChannels.filter((c) => !VALID_CHANNELS.includes(c));
    if (invalidChannels.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `Invalid promotion channels: ${invalidChannels.join(", ")}`,
      });
    }

    const result = await pool.query(
      `UPDATE coupons SET
        code = $1, discount_type = $2, discount_value = $3, min_order_amount = $4,
        max_discount_amount = $5, start_date = $6, end_date = $7, usage_limit = $8,
        is_active = $9, promotion_channels = $10, promotion_notes = $11
      WHERE id = $12
      RETURNING *`,
      [
        newCode, newDiscountType, newDiscountValue, newMinOrder, newMaxDiscount,
        newStartDate, newEndDate, newUsageLimit, newIsActive, newChannels, newNotes, id,
      ],
    );

    res.json({
      status: "success",
      message: "Coupon updated successfully",
      data: formatCoupon(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ status: "error", message: "A coupon with this code already exists" });
    }
    res.status(500).json({
      status: "error",
      message: "Failed to update coupon",
      error: error.message,
    });
  }
};

// PATCH /coupons/:id/days (admin) - add or subtract days from end_date
const adjustCouponDays = async (req, res) => {
  try {
    const { id } = req.params;
    const { days } = req.body;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid coupon id" });
    }

    const daysNum = Number(days);
    if (!Number.isInteger(daysNum) || daysNum === 0) {
      return res.status(400).json({ status: "error", message: "days must be a non-zero integer" });
    }

    const result = await pool.query(
      `UPDATE coupons
       SET end_date = end_date + ($1 * INTERVAL '1 day')
       WHERE id = $2
       RETURNING *`,
      [daysNum, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Coupon not found" });
    }

    res.json({
      status: "success",
      message: `Coupon validity ${daysNum > 0 ? "extended" : "reduced"} by ${Math.abs(daysNum)} day(s)`,
      data: formatCoupon(result.rows[0]),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to adjust coupon days",
      error: error.message,
    });
  }
};

// DELETE /coupons/:id (admin)
const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid coupon id" });
    }

    const result = await pool.query(
      `DELETE FROM coupons WHERE id = $1 RETURNING id, code`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Coupon not found" });
    }

    res.json({
      status: "success",
      message: `Coupon '${result.rows[0].code}' deleted successfully`,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to delete coupon",
      error: error.message,
    });
  }
};

// POST /coupons/validate (user) - validate and preview discount for a coupon code
const validateCoupon = async (req, res) => {
  try {
    const { code, order_amount } = req.body;

    if (!code) {
      return res.status(400).json({ status: "error", message: "Coupon code is required" });
    }

    const orderAmount = Number(order_amount) || 0;

    const result = await pool.query(
      `SELECT * FROM coupons WHERE code = $1`,
      [code.toUpperCase().trim()],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Invalid coupon code" });
    }

    const coupon = result.rows[0];

    if (!coupon.is_active) {
      return res.status(400).json({ status: "error", message: "This coupon is no longer active" });
    }

    const now = new Date();
    if (now < new Date(coupon.start_date)) {
      return res.status(400).json({ status: "error", message: "This coupon is not yet valid" });
    }
    if (now > new Date(coupon.end_date)) {
      return res.status(400).json({ status: "error", message: "This coupon has expired" });
    }
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
      return res.status(400).json({ status: "error", message: "This coupon has reached its usage limit" });
    }
    if (orderAmount < Number(coupon.min_order_amount)) {
      return res.status(400).json({
        status: "error",
        message: `Minimum order amount of ৳${Number(coupon.min_order_amount).toFixed(2)} required for this coupon`,
      });
    }

    let discountAmount;
    if (coupon.discount_type === "percentage") {
      discountAmount = (orderAmount * Number(coupon.discount_value)) / 100;
      if (coupon.max_discount_amount) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
      }
    } else {
      discountAmount = Math.min(Number(coupon.discount_value), orderAmount);
    }

    discountAmount = Number(discountAmount.toFixed(2));

    res.json({
      status: "success",
      message: "Coupon applied successfully",
      data: {
        coupon_id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
        discount_amount: discountAmount,
        final_amount: Number((orderAmount - discountAmount).toFixed(2)),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to validate coupon",
      error: error.message,
    });
  }
};

module.exports = {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  adjustCouponDays,
  deleteCoupon,
  validateCoupon,
};
