import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import apiRouter from "./api/routes/routes.js";
import "./workers/eventWorker.js"; // Initialize BullMQ background worker instance
import { logger } from "./utils/logger.js";

const app = express();

// Enable CORS for frontend dashboard
app.use(cors());
app.use(express.json());

// Basic Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Rate limit exceeded. Please try again later." },
});
app.use(limiter);

// Log requests
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "Incoming request");
  next();
});

// Root & Health
app.get("/", (_req, res) => {
  res.json({
    service: "PulseQueue API Engine",
    status: "running",
    docs: "Support Ticket & Asynchronous Event Processing Platform",
  });
});

// Mount Routes
app.use("/api", apiRouter);
app.use("/", apiRouter); // Also mount at root level for direct endpoint access like /tickets, /events, /health

export default app;
