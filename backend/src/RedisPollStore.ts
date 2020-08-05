import DBController, { NewPollOptions, IPollAgg } from "./PollsStore";
import redis from "redis";
import { response } from "express";

export default class RedisPollsStore {
  DBI = new DBController();
  redisClient = redis.createClient(this.redisURL);
  constructor(public redisURL: string) {}

  new(newPoll: NewPollOptions): Promise<IPollAgg> {
    return new Promise(async (resolve, reject) => {
      try {
        const poll = await this.DBI.new(newPoll);
        this.cache(poll);
        this.redisClient.publish("poll:new", poll.id);
        resolve(poll);
      } catch (e) {
        reject(e);
      }
    });
  }

  get(id: string): Promise<IPollAgg | null> {
    return new Promise(async (resolve, reject) => {
      const cached = await this.retrieveCache(id);
      if (cached) {
        resolve(cached);
      } else {
        console.log("cache miss");
        const poll = await this.DBI.get(id);
        if (poll) {
          resolve(poll);
          this.cache(poll);
        } else {
          resolve(null);
        }
      }
    });
  }

  getRaw(id: string): Promise<{ [key: string]: number } | null> {
    return new Promise((resolve, reject) => {
      this.redisClient.exists(id, (err, response) => {
        if (response) {
          this.redisClient.hgetall(id + ":counts", (err, results) => {
            if (err) return reject(err);

            resolve(
              Object.keys(results).reduce((acc, curr) => {
                acc[curr] = parseInt(results[curr]);
                return acc;
              }, {} as { [key: string]: number })
            );
          });
        } else {
          this.get(id).then((poll) => {
            if (!poll) return resolve(null);
            resolve({
              total: poll.total,
              ...poll.choices.reduce((acc, cur, i) => {
                acc["choice:" + i] = cur.count;
                return acc;
              }, {} as { [key: string]: number }),
            });
          });
        }
      });
    });
  }

  vote(id: string, item: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const countsKey = id + ":counts";
      const choiceKey = "choice:" + item;
      this.redisClient.exists(countsKey, async (err, response) => {
        if (!response) {
          const res = await this.get(id);
          if (!res) {
            resolve(false);
            return;
          }
        }
        this.redisClient.hexists(countsKey, choiceKey, (err, response) => {
          if (err) reject(err);
          else if (response) {
            this.redisClient
              .multi()
              .hincrby(countsKey, "total", 1)
              .hincrby(countsKey, choiceKey, 1)
              .hgetall(countsKey)
              .exec((err, results) => {
                if (err) {
                  reject(err);
                } else {
                  this.redisClient.PUBLISH(
                    "vote:" + id,
                    JSON.stringify(results[2])
                  );
                  this.redisClient.zincrby("writeBehind", 1, id);
                  resolve(true);
                }
              });
          } else {
            reject(new Error("item out of range"));
          }
        });
      });
    });
  }

  cache(poll: IPollAgg) {
    return new Promise((resolve, reject) => {
      let mapping = poll.choices.reduce(
        (acc, cur, i) => {
          acc.choices.push("choice:" + i);
          acc.choices.push(cur.text);

          acc.counts.push("choice:" + i);
          acc.counts.push(cur.count);
          return acc;
        },
        { choices: [], counts: [] } as {
          choices: string[];
          counts: (string | number)[];
        }
      );

      this.redisClient
        .multi()
        .hmset(
          poll.id,
          "prompt",
          poll.prompt,
          "createdAt",
          poll.createdAt.getTime(),
          ...mapping.choices
        )
        .hmset(poll.id + ":counts", "total", 0, ...mapping.counts)
        .exec((err, replies) => {
          if (err) {
            reject(err);
          } else {
            resolve(poll);
          }
        });
    });
  }
  retrieveCache(id: string): Promise<IPollAgg | null> {
    return new Promise((resolve, reject) => {
      this.redisClient
        .multi()
        .hgetall(id)
        .hgetall(id + ":counts")
        .exec((err, response) => {
          if (err) {
            reject(err);
          } else {
            if (!response[0] || !response[1]) {
              resolve(null);
            } else {
              let choices: IPollAgg["choices"] = [];

              let i = 0;

              while (true) {
                const key = "choice:" + i;
                if (!response[0][key]) {
                  break;
                }

                choices.push({
                  count: response[1][key],
                  text: response[0][key],
                });
                i++;
              }

              let retObj: IPollAgg = {
                prompt: response[0].prompt,
                createdAt: response[0].createdAt,
                id,
                total: response[1].total,
                choices,
              };
              resolve(retObj);
            }
          }
        });
    });
  }
}
