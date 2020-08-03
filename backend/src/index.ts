import express from "express";
import bodyParser from "body-parser";
import PollStore from "./PollsStore";

const app = express();

const pollStore = new PollStore();

app.set("trust proxy", true);

app.get("/:id", async (req, res) => {
  try {
    let poll = Object.assign({}, await pollStore.get(req.params.id));
    res.send(poll);
  } catch (e) {
    res.status(404).send(e);
  }
});

app.post("/:id", bodyParser.json(), async (req, res) => {
  const item = req.body as { inc?: number; dec?: number };

  try {
    const success = await pollStore.vote(req.params.id, item.inc!);

    if (success) {
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

app.listen(4000, () => {
  console.log("listening on 4000");
});
