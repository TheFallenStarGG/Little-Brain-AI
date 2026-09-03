import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

if (process.env.SERVE_WEB === "true") {
  const webDistDirectory = path.resolve(
    process.env.WEB_DIST_DIR ??
      path.join(process.cwd(), "artifacts", "bigram-ai", "dist", "public"),
  );
  const webIndexFile = path.join(webDistDirectory, "index.html");

  app.use(express.static(webDistDirectory, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res, next) => {
    res.sendFile(webIndexFile, (error) => {
      if (error) next(error);
    });
  });
}

export default app;
