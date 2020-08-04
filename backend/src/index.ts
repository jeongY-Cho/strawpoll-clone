import express from "express";
import bodyParser from "body-parser";
import PollStore from "./RedisPollStore";
import cookieParser from "cookie-parser";

require("dotenv").config();

const app = express();
app.use(cookieParser(process.env.COOKIE_SECRET));

if (!process.env.REDIS_URL) {
  throw new Error("no process.env.REDIS_URL");
}

const pollStore = new PollStore(process.env.REDIS_URL);

app.set("trust proxy", true);

app.get("/:id", async (req, res) => {
  try {
    let poll = Object.assign({}, await pollStore.get(req.params.id));
    res.send(poll);
  } catch (e) {
    res.status(404).send(e);
  }
});

const validateVote: express.RequestHandler = (req, res, next) => {
  if (process.env.BYPASS === "TRUE") {
    next();
  } else {
    if (JSON.stringify(req.signedCookies.status)) {
      res.status(400).send("already voted");
    } else {
      next();
    }
  }
};

const expiresDate = new Date(2147483647000);

app.post("/:id", validateVote, bodyParser.json(), async (req, res) => {
  const item = req.body as { inc?: number; dec?: number };

  try {
    const success = await pollStore.vote(req.params.id, item.inc!);

    if (success) {
      res.cookie("status", JSON.stringify(item), {
        path: req.path,
        secure: true,
        httpOnly: true,
        expires: expiresDate,
        signed: true,
      });

      res.send("ok");
    } else {
      res.status(404).send("invalid poll id or choice index");
    }
  } catch (e) {
    res.status(400).send(e.message);
  }
});

app.put("/new", bodyParser.json(), async (req, res) => {
  const newId = await pollStore.new(req.body);
  res.send(newId);
});

app.all("/", (req, res) => {
  res.send("ok");
});

app.all("/*", (req, res) => {
  res.status(404).send("404");
});

export default app;

if (require.main === module) {
  app.listen(process.env.PORT || 4000, () => {
    console.log(`listening on ${process.env.PORT}`);
  });
}
