const express = require("express");
const adminMiddleware = require("../middleware/adminMiddleware");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  adjustCouponDays,
  deleteCoupon,
  validateCoupon,
} = require("../controllers/couponController");

const router = express.Router();

// User route — must be before /:id to avoid conflict
router.post("/validate", requireAuth, validateCoupon);

// Admin routes
router.post("/", adminMiddleware, createCoupon);
router.get("/", adminMiddleware, getCoupons);
router.get("/:id", adminMiddleware, getCouponById);
router.put("/:id", adminMiddleware, updateCoupon);
router.patch("/:id/days", adminMiddleware, adjustCouponDays);
router.delete("/:id", adminMiddleware, deleteCoupon);

module.exports = router;
