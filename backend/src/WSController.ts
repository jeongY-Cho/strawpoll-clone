import express from "express";
import * as WS from "ws";

import redis from "redis";
import Cache from "./RedisPollStore";
import { IPollAgg } from "./PollsStore";

const wsapp = express();
export default wsapp;

class WSMessenger {
  redisClient = redis.createClient(this.redis_url);
  clients = new Set<WS>();

  constructor(
    public id: string,
    public destroyFn: (id: string) => any,
    public redis_url: string
  ) {
    this.redisClient.on("message", (channel, message) => {
      this.send(message);
    });
    this.listen();
  }

  add(client: WS) {
    this.clients.add(client);
    client.on("close", () => {
      this.remove(client);
    });
  }
  remove = (client: WS) => {
    this.clients.delete(client);
    if (!this.clients.size) {
      this.redisClient.unsubscribe();
      this.destroyFn(this.id);
    }
  };

  send(payload: string) {
    for (const client of this.clients) {
      client.send(payload);
    }
  }

  listen() {
    this.redisClient.subscribe("vote:" + this.id);
  }
}

class ChannelManager {
  channels: { [key: string]: WSMessenger } = {};

  constructor(public redis_url: string) {}

  add(channel: string, client: WS) {
    if (!this.channels[channel]) {
      this.channels[channel] = new WSMessenger(
        channel,
        this.destroy,
        this.redis_url
      );
    }

    this.channels[channel].add(client);
  }

  destroy = (id: string) => {
    console.log("destroy: ", id);
    delete this.channels[id];
  };
}

const WSMiddleware = (wss?: WS.Server) => {
  const cache = new Cache(process.env.REDIS_URL!);
  const channelManager = new ChannelManager(process.env.REDIS_URL!);
  if (!wss) {
    wss = new WS.Server({ noServer: true });
  }
  return ((req, res, next) => {
    // if not a websocket request go next
    if (
      !req.headers ||
      req.headers.upgrade === undefined ||
      req.headers.upgrade.toLowerCase() !== "websocket"
    ) {
      return next();
    }

    // @ts-ignore
    wss!.handleUpgrade(req, req.socket, Buffer.from(""), async (client) => {
      const poll = await cache.get(req.params.id);

      if (!poll) {
        client.send("invalid id");
        return client.close();
      }

      client.send(JSON.stringify(transformPoll(poll)));

      // @ts-expect-error || some typing thing
      channelManager.add(req.params.id, client);
    });
  }) as express.RequestHandler<{ id: string }>;
};

wsapp.all<{ id: string }>("/:id", WSMiddleware());

function transformPoll(poll: IPollAgg) {
  return {
    total: poll.total,
    ...poll.choices.reduce((acc, cur, i) => {
      acc["choice:" + i] = cur.count;
      return acc;
    }, {} as { [key: string]: number }),
  };
}
