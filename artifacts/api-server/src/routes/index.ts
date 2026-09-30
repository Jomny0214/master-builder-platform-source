import { Router, type IRouter } from "express";
import healthRouter from "./health";
import courseRouter from "./course";
import paddleRouter from "./paddle";

const router: IRouter = Router();

router.use(healthRouter);
router.use(courseRouter);
router.use(paddleRouter);

export default router;
