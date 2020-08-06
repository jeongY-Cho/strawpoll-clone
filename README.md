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
  - should remain consistent for the life of the product since changing would mean that revotes would , cookies don't need to be secure just not tamperable.
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

### `GET` /{id}

### `POST` /{id}

### `ALL` /

### `websocket` /live/{id}
