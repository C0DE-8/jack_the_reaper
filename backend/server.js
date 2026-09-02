require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "word backend";

app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
});
