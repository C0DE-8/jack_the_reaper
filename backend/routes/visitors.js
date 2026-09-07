const express = require("express");
const router = express.Router();
const db = require("../db");

// Get all visitors with pagination /visitors
router.get("/", async (req, res) => {
  try {
    const allowedSortFields = new Set(["id", "first_visit", "last_visit", "visit_count"]);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const sortBy = allowedSortFields.has(req.query.sortBy) ? req.query.sortBy : "last_visit";
    const order = String(req.query.order).toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (page - 1) * limit;

    const countResult = await db.query("SELECT COUNT(*) AS total FROM visitor_logs");
    const total = countResult[0]?.total || 0;

    const visitors = await db.query(
      `SELECT * FROM visitor_logs 
       ORDER BY ${sortBy} ${order} 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      ok: true,
      data: visitors,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error("Error fetching visitors:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// Auto-track visitor (no consent needed) /visitors/track
router.post("/track", async (req, res) => {
  try {
    const visitorData = req.body;

    // Get client IP from headers if not provided
    const ipAddress = visitorData.ip_address || 
                     req.headers['x-forwarded-for']?.split(',')[0] || 
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress;

    const userAgent = visitorData.user_agent || req.headers['user-agent'] || 'unknown';

    // Check if visitor exists (using IP + UserAgent combo)
    const existingVisitor = await db.query(
      `SELECT id, visit_count, last_visit FROM visitor_logs 
       WHERE ip_address = ? AND user_agent = ? 
       ORDER BY last_visit DESC LIMIT 1`,
      [ipAddress, userAgent]
    );

    let visitorId;
    let newVisitor = false;
    const currentPage = visitorData.current_page || req.headers.referer || '/';

    if (existingVisitor.length > 0) {
      // Update existing visitor
      const visitor = existingVisitor[0];
      await db.query(
        `UPDATE visitor_logs 
         SET visit_count = visit_count + 1,
             last_visit = NOW(),
             last_page = ?,
             browser = COALESCE(?, browser),
             os = COALESCE(?, os),
             device_type = COALESCE(?, device_type),
             total_visit_duration = total_visit_duration + ?,
             referrer = COALESCE(?, referrer)
         WHERE id = ?`,
        [
          currentPage,
          visitorData.browser || null,
          visitorData.os || null,
          visitorData.device_type || null,
          visitorData.time_on_page || 0,
          visitorData.referrer || null,
          visitor.id
        ]
      );
      visitorId = visitor.id;
      newVisitor = false;
    } else {
      // Create new visitor
      const result = await db.query(
        `INSERT INTO visitor_logs (
          ip_address, 
          user_agent, 
          visit_count,
          first_visit,
          last_visit,
          referrer,
          country,
          city,
          region,
          browser,
          os,
          device_type,
          screen_resolution,
          language,
          current_page,
          last_page,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content
        ) VALUES (?, ?, 1, NOW(), NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ipAddress,
          userAgent,
          visitorData.referrer || req.headers.referer || '',
          visitorData.country || '',
          visitorData.city || '',
          visitorData.region || '',
          visitorData.browser || '',
          visitorData.os || '',
          visitorData.device_type || '',
          visitorData.screen_resolution || '',
          visitorData.language || '',
          currentPage,
          currentPage,
          visitorData.utm_source || '',
          visitorData.utm_medium || '',
          visitorData.utm_campaign || '',
          visitorData.utm_term || '',
          visitorData.utm_content || ''
        ]
      );
      visitorId = result.insertId;
      newVisitor = true;
    }

    // Log the page view event
    await db.query(
      `INSERT INTO visitor_events (
        visitor_id,
        event_type,
        event_data,
        page_url,
        created_at
      ) VALUES (?, 'page_view', ?, ?, NOW())`,
      [
        visitorId,
        JSON.stringify({
          page: currentPage,
          referrer: visitorData.referrer || req.headers.referer || '',
          time_on_page: visitorData.time_on_page || 0,
          scroll_depth: visitorData.scroll_depth || 0
        }),
        currentPage
      ]
    );

    // Get updated visitor data
    const updatedVisitor = await db.query(
      `SELECT * FROM visitor_logs WHERE id = ?`,
      [visitorId]
    );

    res.json({
      ok: true,
      message: newVisitor ? 'Visitor tracked' : 'Visitor updated',
      data: updatedVisitor[0],
      isNew: newVisitor
    });
  } catch (error) {
    console.error("Error tracking visitor:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// Get visitor analytics /visitors/analytics/overview
router.get("/analytics/overview", async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let dateCondition = '';
    if (period === '24h') {
      dateCondition = "AND last_visit >= DATE_SUB(NOW(), INTERVAL 24 HOUR)";
    } else if (period === '7d') {
      dateCondition = "AND last_visit >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    } else if (period === '30d') {
      dateCondition = "AND last_visit >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    }

    // Total visitors and active today
    const totals = await db.query(
      `SELECT 
        COUNT(*) AS total_visitors,
        SUM(CASE WHEN DATE(last_visit) = CURDATE() THEN 1 ELSE 0 END) AS today_visitors,
        SUM(CASE WHEN DATE(last_visit) = CURDATE() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS yesterday_visitors,
        COUNT(DISTINCT ip_address) AS unique_visitors,
        SUM(visit_count) AS total_visits
       FROM visitor_logs
       WHERE 1=1 ${dateCondition}`
    );

    // Device type breakdown
    const deviceStats = await db.query(
      `SELECT 
        device_type,
        COUNT(*) AS count
       FROM visitor_logs
       WHERE 1=1 ${dateCondition} AND device_type != ''
       GROUP BY device_type
       ORDER BY count DESC`
    );

    // Browser breakdown
    const browserStats = await db.query(
      `SELECT 
        browser,
        COUNT(*) AS count
       FROM visitor_logs
       WHERE 1=1 ${dateCondition} AND browser != ''
       GROUP BY browser
       ORDER BY count DESC
       LIMIT 10`
    );

    // Country breakdown
    const countryStats = await db.query(
      `SELECT 
        country,
        COUNT(*) AS count
       FROM visitor_logs
       WHERE 1=1 ${dateCondition} AND country != ''
       GROUP BY country
       ORDER BY count DESC
       LIMIT 10`
    );

    // Daily visits for chart
    const dailyVisits = await db.query(
      `SELECT 
        DATE(last_visit) AS date,
        COUNT(*) AS visits,
        COUNT(DISTINCT ip_address) AS unique_visitors
       FROM visitor_logs
       WHERE 1=1 ${dateCondition}
       GROUP BY DATE(last_visit)
       ORDER BY date DESC
       LIMIT 30`
    );

    // New vs returning visitors
    const newVsReturning = await db.query(
      `SELECT 
        SUM(CASE WHEN visit_count = 1 THEN 1 ELSE 0 END) AS new_visitors,
        SUM(CASE WHEN visit_count > 1 THEN 1 ELSE 0 END) AS returning_visitors
       FROM visitor_logs
       WHERE 1=1 ${dateCondition}`
    );

    res.json({
      ok: true,
      data: {
        overview: totals[0],
        devices: deviceStats,
        browsers: browserStats,
        countries: countryStats,
        daily: dailyVisits,
        newVsReturning: newVsReturning[0]
      }
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// Track user interaction events /visitors/events
router.post("/events", async (req, res) => {
  try {
    const { visitor_id, event_type, event_data, page_url } = req.body;

    if (!visitor_id || !event_type) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: visitor_id and event_type"
      });
    }

    // Verify visitor exists
    const visitor = await db.query(
      `SELECT id FROM visitor_logs WHERE id = ?`,
      [visitor_id]
    );

    if (visitor.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Visitor not found"
      });
    }

    await db.query(
      `INSERT INTO visitor_events (
        visitor_id,
        event_type,
        event_data,
        page_url,
        created_at
      ) VALUES (?, ?, ?, ?, NOW())`,
      [
        visitor_id,
        event_type,
        JSON.stringify(event_data || {}),
        page_url || '/'
      ]
    );

    res.json({
      ok: true,
      message: "Event logged"
    });
  } catch (error) {
    console.error("Error logging event:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// This route must remain after named GET routes such as /analytics/overview.
router.get("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, error: "Visitor ID must be a positive integer" });
    }

    const visitor = await db.query("SELECT * FROM visitor_logs WHERE id = ?", [id]);
    if (visitor.length === 0) {
      return res.status(404).json({ ok: false, error: "Visitor not found" });
    }

    const events = await db.query(
      `SELECT * FROM visitor_events WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 50`,
      [id]
    );
    res.json({ ok: true, data: { ...visitor[0], events } });
  } catch (error) {
    console.error("Error fetching visitor:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
