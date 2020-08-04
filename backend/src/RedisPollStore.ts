import DBController, { NewPollOptions, IPollAgg } from "./PollsStore";
import redis from "redis";

export default class RedisPollsStore extends DBController {
  redisClient = redis.createClient(this.redisURL);
  constructor(public redisURL: string) {
    super();
  }

  new(newPoll: NewPollOptions): Promise<IPollAgg> {
    return new Promise(async (resolve, reject) => {
      try {
        const poll = await super.new(newPoll);

        this.cache(poll);

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
        const poll = await super.get(id);
        if (poll) {
          resolve(poll);
          this.cache(poll);
        } else {
          resolve(null);
        }
      }
    });
  }

  vote(id: string, item: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.redisClient
        .multi()
        .hincrby(id + ":counts", "total", 1)
        .hincrby(id + ":counts", "choice:" + item, 1)
        .exec((err, results) => {
          if (err) {
            reject(err);
          } else {
            console.log(results);
            resolve(true);
            super.vote(id, item);
          }
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
                if (!response[1][key]) {
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
