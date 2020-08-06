import express from "express";
import bodyParser from "body-parser";
import stringifyFactory from "fast-json-stringify";
import PollStore from "./RedisPollStore";
import cookieParser from "cookie-parser";
import WriteBehind from "./WriteBehind";
import WSController from "./WSController";

require("dotenv").config();

const app = express();
app.use(cookieParser(process.env.COOKIE_SECRET));

if (!process.env.REDIS_URL) {
  throw new Error("no process.env.REDIS_URL");
}

const pollStore = new PollStore(process.env.REDIS_URL);
const writeBehind = new WriteBehind(process.env.REDIS_URL);
writeBehind.start("writeBehind");

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
    if (req.signedCookies.status) {
      res.status(400).send("already voted");
    } else {
      next();
    }
  }
};

const expiresDate = new Date(2147483647000);

const stringify = stringifyFactory({
  type: "object",
  properties: {
    inc: {
      type: "number",
    },
    dec: {
      type: "number",
    },
    id: {
      type: "number",
    },
  },
});

app.post("/:id", validateVote, bodyParser.json(), async (req, res) => {
  const item = { ...req.body, id: req.params.id } as {
    inc?: number;
    dec?: number;
    id: string;
  };
  try {
    const success = await pollStore.vote(req.params.id, item.inc!);

    if (success) {
      res.cookie("status", stringify(item), {
        path: req.path,
        secure: true,
        httpOnly: true,
        expires: expiresDate,
        signed: true,
      });

      res.send("ok");
    } else {
      res.status(404).send("invalid poll id");
    }
  } catch (e) {
    res.status(400).send(e.message);
  }
});

app.put("/new", bodyParser.json(), async (req, res) => {
  const newId = await pollStore.new(req.body);
  res.send(newId);
});

app.use("/live", WSController);

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
