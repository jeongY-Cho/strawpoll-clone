import DBController, { NewPollOptions, IPollAgg } from "./PollsStore";
import redis from "redis";
import fastStringify from "fast-json-stringify";

export default class Cache {
  /*
   *  cache interface for a redis cache. handles caching and resolving cache misses
   */
  DBI = new DBController();
  redisClient = redis.createClient(this.redisURL);
  constructor(public redisURL: string) {}
  stringify = fastStringify({
    type: "object",
    patternProperties: {
      ".*": {
        type: "string",
      },
    },
  });

  // create a new poll in db then cache it
  new(newPoll: NewPollOptions): Promise<IPollAgg> {
    return new Promise(async (resolve, reject) => {
      try {
        // create new poll
        const poll = await this.DBI.new(newPoll);
        // cache poll
        this.cache(poll);
        // publish new poll
        this.redisClient.publish("poll:new", poll.id);
        resolve(poll);
      } catch (e) {
        reject(e);
      }
    });
  }

  // get a poll. if cache miss resolve then return
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

  // get the raw cached object not formatted as a poll object
  getRaw(id: string): Promise<{ [key: string]: number } | null> {
    return new Promise((resolve, reject) => {
      // check if in cache
      this.redisClient.exists(id + ":counts", (err, response) => {
        // if in cache get and return raw obj
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
          // if cache miss load into cache then return
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

  // vote on a poll in cache
  vote(id: string, item: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const countsKey = id + ":counts";
      const choiceKey = "choice:" + item;
      // check if in cache
      this.redisClient.exists(countsKey, async (err, response) => {
        // if cache miss load into cache from db
        if (!response) {
          const res = await this.get(id);
          // if no such id do nothing and return
          if (!res) {
            resolve(false);
            return;
          }
        }
        // check that item exists if not reject with out of range
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
                  this.redisClient
                    .multi()
                    .PUBLISH("vote:" + id, this.stringify(results[2]))
                    .zincrby("writeBehind", 1, id)
                    .exec();

                  this.redisClient;
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

  // cache a poll obj
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

  // retrieve a poll obj from cache
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
