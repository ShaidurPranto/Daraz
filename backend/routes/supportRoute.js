const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  createTicket,
  getUserTickets,
  getUserTicketById,
  addUserMessage,
  adminGetAllTickets,
  adminGetTicketById,
  adminReplyToTicket,
  adminUpdateTicketStatus,
} = require("../controllers/supportController");

const router = express.Router();

// ---- User routes ----
router.post("/", requireAuth, createTicket);
router.get("/", requireAuth, getUserTickets);
router.get("/:id", requireAuth, getUserTicketById);
router.post("/:id/messages", requireAuth, addUserMessage);

// ---- Admin routes ----
router.get("/admin/all", adminMiddleware, adminGetAllTickets);
router.get("/admin/:id", adminMiddleware, adminGetTicketById);
router.post("/admin/:id/messages", adminMiddleware, adminReplyToTicket);
router.patch("/admin/:id/status", adminMiddleware, adminUpdateTicketStatus);

module.exports = router;
