const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();

const db = require("./db");
const telegramRouter = require("./routes/telegram");
const wordsRouter = require("./routes/words");

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "word backend";

app.use(cors());
app.use(express.json());
app.use("/telegram", telegramRouter);
app.use("/api/telegram", telegramRouter);
app.use("/words", wordsRouter);
app.use("/api/words", wordsRouter);
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.get("/", (req, res) => {
  res.json({ ok: true, service: SERVICE_NAME });
});

app.get(["/health", "/api/health"], async (req, res) => {
  try {
    const status = await db.status();
    res.json({ ok: true, service: SERVICE_NAME, gateway: status });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: SERVICE_NAME,
      error: error.message,
    });
  }
});

app.get(["/db/ping", "/api/db/ping"], async (req, res) => {
  try {
    const rows = await db.query("SELECT 1 AS ok");
    res.json({ ok: true, rows });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
    });
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    ok: false,
    error: error.message || "Server error",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`${SERVICE_NAME} listening on port ${PORT}`);
  });
}

module.exports = app;
