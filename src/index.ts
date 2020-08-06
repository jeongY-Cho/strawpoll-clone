import express from "express";
import bodyParser from "body-parser";
import stringifyFactory from "fast-json-stringify";
import Cache from "./RedisPollStore";
import cookieParser from "cookie-parser";
import WriteBehind from "./WriteBehind";
import WSController from "./WSController";

require("dotenv").config();

const app = express();
app.use(cookieParser(process.env.COOKIE_SECRET));

if (!process.env.REDIS_URL) {
  throw new Error("no process.env.REDIS_URL");
}

// redis cache interface
const cache = new Cache(process.env.REDIS_URL);

// db writebehind manager
const writeBehind = new WriteBehind(process.env.REDIS_URL);
writeBehind.start("writeBehind");

// uncomment to get ips
// app.set("trust proxy", true);

// get a poll
app.get("/:id", async (req, res) => {
  try {
    // get poll object
    let poll = Object.assign({}, await cache.get(req.params.id));
    res.send(poll);
  } catch (e) {
    // return 404 if id not found
    res.status(404).send(e);
  }
});

// check cookie for votes if voted before send error
const validateVote: express.RequestHandler = (req, res, next) => {
  if (process.env.BYPASS === "TRUE") {
    next();
  } else {
    if (
      req.signedCookies.status &&
      req.signedCookies.status.id === req.params.id
    ) {
      res.status(400).send("already voted");
    } else {
      next();
    }
  }
};

// date object: set at 2030, used for cookie expiry
const expiresDate = new Date(2147483647000);

// json-fast-stringify schema
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

// post an update to a poll
app.post("/:id", validateVote, bodyParser.json(), async (req, res) => {
  const item = { ...req.body, id: req.params.id } as {
    inc?: number;
    dec?: number;
    id: string;
  };
  try {
    const success = await cache.vote(req.params.id, item.inc!);

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

// put request for a new poll
app.put("/new", bodyParser.json(), async (req, res) => {
  const newId = await cache.new(req.body);
  res.send(newId);
});

// endpoint for websockets
app.use("/live", WSController);

// empty endpoint for healthcheck
app.all("/", (req, res) => {
  res.send("ok");
});

// all other endpoints are 404
app.all("/*", (req, res) => {
  res.sendStatus(404);
});

// export as sub-application
export default app;

if (require.main === module) {
  // run if main
  app.listen(process.env.PORT || 4000, () => {
    console.log(`listening on ${process.env.PORT}`);
  });
}
