import express from "express";
import * as WS from "ws";
import fastStringify from "fast-json-stringify";

import redis from "redis";
import Cache from "./RedisPollStore";

require("dotenv").config();

const wsapp = express();
export default wsapp;

const stringify = fastStringify({
  type: "object",
  patternProperties: {
    ".*": {
      type: "number",
    },
  },
});

class WSMessenger {
  // redis client
  redisClient = redis.createClient(this.redis_url);
  // set of webSockets for this channel
  clients = new Set<WS>();

  constructor(
    public id: string,
    public destroyFn: (id: string) => any,
    public redis_url: string
  ) {
    // send the payload to all clients in clients set
    this.redisClient.on("message", (channel, message) => {
      let strIntRegex = /"(\d+)"/g;

      this.send(message.replace(strIntRegex, "$1"));
    });
    // start listening for updates
    this.listen();
  }

  // add client to set of clients
  add(client: WS) {
    this.clients.add(client);
    // @ts-expect-error || custom heartbeat implementation
    client.isAlive = true;
    client.once("pong", () => {
      // @ts-expect-error || custom heartbeat implementation
      client.isAlive = true;
    });
    // @ts-expect-error || custom heartbeat interval
    client.heartbeat = setInterval(() => {
      this.heartbeat(client);
    }, 10 * 1000);
    // remove client from list when close
    client.on("close", () => {
      console.log("close");
      // @ts-expect-error || custom heartbeat interval
      clearInterval(client.heartbeat);
      this.remove(client);
    });
  }

  // remove client from set of clients
  remove = (client: WS) => {
    this.clients.delete(client);
    if (!this.clients.size) {
      // if clients set is empty unsubscribe from pubsub then destroy the channel
      this.redisClient.unsubscribe();
      this.destroyFn(this.id);
    }
  };

  // send payload to all clients on this channel
  send(payload: string) {
    for (const client of this.clients) {
      // @ts-expect-error || custom heartbeat implementation
      if (client.isAlive) {
        client.send(payload);
      } else {
        client.emit("close");
      }
    }
  }

  // subscribe to vote channel
  listen() {
    this.redisClient.subscribe("vote:" + this.id);
  }

  heartbeat(client: WS) {
    // @ts-expect-error || custom heartbeat implementation
    client.isAlive = false;
    client.ping(undefined, undefined, (err) => {
      if (err) {
        console.log("err on heartbeat, will close");
        client.emit("close");
      }
    });
  }
}

class ChannelManager {
  // object that holds channels
  channels: { [key: string]: WSMessenger } = {};

  constructor(
    public redis_url: string,
    public custom_mapping: { [key: string]: string } = {}
  ) {}

  // add client to a channel
  add(channel: string, client: WS) {
    if (this.custom_mapping[channel]) {
      channel = this.custom_mapping[channel];
    }

    // if channel doesn't exist make it
    if (!this.channels[channel]) {
      this.channels[channel] = new WSMessenger(
        channel,
        this.destroy,
        this.redis_url
      );
    }

    this.channels[channel].add(client);
  }

  // destroy channel
  destroy = (id: string) => {
    console.log("destroy channel: ", id);
    delete this.channels[id];
  };
}

// middleware factory
const WSMiddleware = (wss?: WS.Server) => {
  // connection to cache interface
  const cache = new Cache(process.env.REDIS_URL!);
  // channel manager object
  const channelManager = new ChannelManager(process.env.REDIS_URL!, {
    new: "poll:new",
  });
  // if a separate webSocket server is not proved make one
  if (!wss) {
    wss = new WS.Server({ noServer: true });
  }
  // middleware function
  return ((req, _res, next) => {
    // if not a websocket request go next
    if (
      !req.headers ||
      req.headers.upgrade === undefined ||
      req.headers.upgrade.toLowerCase() !== "websocket"
    ) {
      return next();
    }

    // @ts-ignore || upgrade to a webSocket
    wss!.handleUpgrade(req, req.socket, Buffer.from(""), async (client) => {
      // get poll from id
      const poll = await cache.getRaw(req.params.id);

      // if poll doesn't exist send an error message and close the socket
      if (!poll) {
        client.send("invalid id");
        return client.close();
      }

      // if poll exists send initial payload then pass to channelManager
      client.send(stringify(poll));

      // @ts-expect-error || some typing thing
      channelManager.add(req.params.id, client);
    });
  }) as express.RequestHandler<{ id: string }>;
};

wsapp.all<{ id: string }>("/:id", WSMiddleware());
