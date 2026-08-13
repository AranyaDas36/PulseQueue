import { Router } from "express";
import { TicketController } from "../controllers/ticketController.js";
import { EventController } from "../controllers/eventController.js";
import { JobController } from "../controllers/jobController.js";
import { MetricsController } from "../controllers/metricsController.js";
import { validateBody, CreateTicketSchema, CreateEventSchema } from "../../middleware/validation.js";

const router = Router();

const ticketController = new TicketController();
const eventController = new EventController();
const jobController = new JobController();
const metricsController = new MetricsController();

// Ticket Endpoints
router.post("/tickets", validateBody(CreateTicketSchema), ticketController.createTicket);
router.get("/tickets", ticketController.listTickets);
router.get("/tickets/:id", ticketController.getTicketById);

// Event Endpoints
router.post("/events", validateBody(CreateEventSchema), eventController.createEvent);
router.get("/events/:id", eventController.getEventById);

// Dead Letter Queue / Job Endpoints
router.get("/jobs/failed", jobController.getFailedJobs);
router.post("/jobs/:id/retry", jobController.retryFailedJob);

// Observability & Metrics Endpoints
router.get("/metrics/summary", metricsController.getMetricsSummary);
router.get("/health", metricsController.getHealth);

export default router;
