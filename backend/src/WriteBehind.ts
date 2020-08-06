import redis from "redis";
import DBConnector from "./PollsStore";

export default class WriteBehind {
  redisClient = redis.createClient(this.redisUrl);
  DBConnector = new DBConnector();
  constructor(public redisUrl: string) {}

  start(key: string) {
    // @ts-expect-error || @types/redis isn't updated
    this.redisClient.bzpopmax(key, 0, (err, res) => {
      this.redisClient.hgetall(res[1] + ":counts", async (err, values) => {
        await this.DBConnector.push(res[1], values);
        this.start(key);
      });
    });
  }

  static parseKey(keyStr: string) {}
}
