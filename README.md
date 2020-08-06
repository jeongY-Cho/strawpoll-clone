# Strawpoll Clone / backend

This is the backend api code for this strawpoll clone. It uses express as http server, redis for caching and prisma client as orm. It uses "permanent" cookies to track voting. (permanent as in expires in 2030). No server side tracking of ips (though plans to implement ip tracking for vote counts are planned).

## Usage

1. Clone repo

   ```bash
     git clone git@github.com:jeongY-Cho/strawpoll-clone.git
   ```

2. declare .env and schema for server

- **REDIS_URL** url to redis server
- **PORT** port to run server on
- **COOKIE_SECRET** secret for cookie signing
  - should remain consistent for the life of the product since changing would mean that cookies become invalid, cookies don't need to be secure just not tamperable.
- **BYPASS** when == TRUE then will bypass vote check.
  - useful for debugging

4. setup prisma database source. ref: https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-schema/data-sources/

5. run proper migrations for database

6. `npm install`

7. `npm run build`

8. `npm start`

## Use as subapp

```typescript
import express from "express";
import strawpoll from "./backend/build/index";

const app = express();
app.use("/strawpoll", strawpoll);

app.listen(4000);
```

## Endpoints

### `PUT` /new

Creates a new poll.

Request Body:

```typescript
  schema {
    prompt: string,
    choices: Array<string>
  }
```

Returns the id of the created poll.

### `GET` /{id}

Gets the poll with the associated id.

Return:

```typescript
  schema {
    id: string,
    createdAt: Date,
    prompt: string,
    total: number,
    choices: Array<Choice>
  }

  Choice {
    count: number,
    text: string
  }
```

Choice order will be consistent with the order in which the poll was created.

### `POST` /{id}

Vote for a poll choice.

Request Body:

```typescript
  schema {
    inc: number
  }
```

the value for inc should be the zero-indexed index of the choice.

### `ALL` /

Healthcheck endpoint. Will always return 200.

### `websocket` /live/{id}

## Note

Deleting cookies will allow a client to vote again
