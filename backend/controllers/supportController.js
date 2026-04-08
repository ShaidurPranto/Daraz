const pool = require("../config/db");

const isValidUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// ============================================================
// USER — create a ticket with first message
// POST /support
// ============================================================
const createTicket = async (req, res) => {
  const client = await pool.connect();
  try {
    const { subject, message, image_url } = req.body;
    const userId = req.user.id;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ status: "error", message: "Subject is required" });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ status: "error", message: "Message is required" });
    }

    await client.query("BEGIN");

    const ticketResult = await client.query(
      `INSERT INTO support_tickets (user_id, subject)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, subject.trim()],
    );
    const ticket = ticketResult.rows[0];

    await client.query(
      `INSERT INTO support_messages (ticket_id, sender_id, is_admin, message, image_url)
       VALUES ($1, $2, FALSE, $3, $4)`,
      [ticket.id, userId, message.trim(), image_url?.trim() || null],
    );

    await client.query("COMMIT");

    res.status(201).json({
      status: "success",
      message: "Support ticket created",
      data: ticket,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ status: "error", message: "Failed to create ticket", error: error.message });
  } finally {
    client.release();
  }
};

// ============================================================
// USER — list own tickets
// GET /support
// ============================================================
const getUserTickets = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT
        t.id, t.subject, t.status, t.created_at, t.updated_at,
        COUNT(m.id)::int AS message_count,
        MAX(m.created_at) AS last_message_at
       FROM support_tickets t
       LEFT JOIN support_messages m ON m.ticket_id = t.id
       WHERE t.user_id = $1
       GROUP BY t.id
       ORDER BY t.updated_at DESC`,
      [userId],
    );

    res.json({ status: "success", data: result.rows });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to retrieve tickets", error: error.message });
  }
};

// ============================================================
// USER — get single ticket with messages (own ticket only)
// GET /support/:id
// ============================================================
const getUserTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid ticket id" });
    }

    const ticketResult = await pool.query(
      `SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }

    const messagesResult = await pool.query(
      `SELECT
        m.id, m.sender_id, m.is_admin, m.message, m.image_url, m.created_at,
        u.name AS sender_name
       FROM support_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC`,
      [id],
    );

    res.json({
      status: "success",
      data: {
        ticket: ticketResult.rows[0],
        messages: messagesResult.rows,
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to retrieve ticket", error: error.message });
  }
};

// ============================================================
// USER — add message to own ticket
// POST /support/:id/messages
// ============================================================
const addUserMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { message, image_url } = req.body;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid ticket id" });
    }
    if (!message?.trim() && !image_url?.trim()) {
      return res.status(400).json({ status: "error", message: "Message or image is required" });
    }

    const ticketResult = await pool.query(
      `SELECT id, status FROM support_tickets WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }
    if (ticketResult.rows[0].status === "closed") {
      return res.status(400).json({ status: "error", message: "This ticket is closed" });
    }

    const msgResult = await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_id, is_admin, message, image_url)
       VALUES ($1, $2, FALSE, $3, $4)
       RETURNING *`,
      [id, userId, message?.trim() || null, image_url?.trim() || null],
    );

    // bump updated_at so it sorts to top
    await pool.query(
      `UPDATE support_tickets SET updated_at = NOW(), status = CASE WHEN status = 'closed' THEN 'open' ELSE status END WHERE id = $1`,
      [id],
    );

    res.status(201).json({ status: "success", data: msgResult.rows[0] });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to send message", error: error.message });
  }
};

// ============================================================
// ADMIN — list all tickets
// GET /admin/support
// ============================================================
const adminGetAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = "";

    if (status && ["open", "in_progress", "closed"].includes(status)) {
      where = "WHERE t.status = $1";
      params.push(status);
    }

    const result = await pool.query(
      `SELECT
        t.id, t.subject, t.status, t.created_at, t.updated_at,
        u.id AS user_id, u.name AS user_name, u.email AS user_email,
        COUNT(m.id)::int AS message_count,
        MAX(m.created_at) AS last_message_at
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN support_messages m ON m.ticket_id = t.id
       ${where}
       GROUP BY t.id, u.id
       ORDER BY t.updated_at DESC`,
      params,
    );

    res.json({ status: "success", data: result.rows });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to retrieve tickets", error: error.message });
  }
};

// ============================================================
// ADMIN — get ticket with full messages
// GET /admin/support/:id
// ============================================================
const adminGetTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid ticket id" });
    }

    const ticketResult = await pool.query(
      `SELECT
        t.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [id],
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }

    const messagesResult = await pool.query(
      `SELECT
        m.id, m.sender_id, m.is_admin, m.message, m.image_url, m.created_at,
        u.name AS sender_name
       FROM support_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC`,
      [id],
    );

    res.json({
      status: "success",
      data: {
        ticket: ticketResult.rows[0],
        messages: messagesResult.rows,
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to retrieve ticket", error: error.message });
  }
};

// ============================================================
// ADMIN — reply to a ticket
// POST /admin/support/:id/messages
// ============================================================
const adminReplyToTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { message, image_url } = req.body;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid ticket id" });
    }
    if (!message?.trim() && !image_url?.trim()) {
      return res.status(400).json({ status: "error", message: "Message or image is required" });
    }

    const ticketResult = await pool.query(
      `SELECT id, status FROM support_tickets WHERE id = $1`,
      [id],
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }

    const msgResult = await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_id, is_admin, message, image_url)
       VALUES ($1, $2, TRUE, $3, $4)
       RETURNING *`,
      [id, adminId, message?.trim() || null, image_url?.trim() || null],
    );

    // When admin replies, set status to in_progress if still open
    await pool.query(
      `UPDATE support_tickets
       SET updated_at = NOW(),
           status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
       WHERE id = $1`,
      [id],
    );

    res.status(201).json({ status: "success", data: msgResult.rows[0] });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to send reply", error: error.message });
  }
};

// ============================================================
// ADMIN — update ticket status
// PATCH /admin/support/:id/status
// ============================================================
const adminUpdateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidUuid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid ticket id" });
    }
    if (!["open", "in_progress", "closed"].includes(status)) {
      return res.status(400).json({ status: "error", message: "status must be open, in_progress, or closed" });
    }

    const result = await pool.query(
      `UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Ticket not found" });
    }

    res.json({ status: "success", message: `Ticket marked as ${status}`, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to update status", error: error.message });
  }
};

module.exports = {
  createTicket,
  getUserTickets,
  getUserTicketById,
  addUserMessage,
  adminGetAllTickets,
  adminGetTicketById,
  adminReplyToTicket,
  adminUpdateTicketStatus,
};
