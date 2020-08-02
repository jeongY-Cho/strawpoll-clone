import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.send("good");
});

app.get("/*", (req, res) => {
  res.send("404");
});

app.listen(4000, () => {
  console.log("listening on 4000");
});
