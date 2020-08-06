# Migration `20200803002005-create-db`

This migration has been generated by Jeong Yeon Cho at 8/3/2020, 12:20:05 AM.
You can check out the [state of the schema](./schema.prisma) after the migration.

## Database Steps

```sql
PRAGMA foreign_keys=OFF;

CREATE TABLE "Poll" (
"id" TEXT NOT NULL,
"createdAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"prompt" TEXT NOT NULL,
"total" INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY ("id"))

CREATE TABLE "Choice" (
"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
"text" TEXT NOT NULL,
"count" INTEGER NOT NULL DEFAULT 0,
"pollId" TEXT NOT NULL,
FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE
)

PRAGMA foreign_key_check;

PRAGMA foreign_keys=ON;
```

## Changes

```diff
diff --git schema.prisma schema.prisma
migration ..20200803002005-create-db
--- datamodel.dml
+++ datamodel.dml
@@ -1,0 +1,27 @@
+// This is your Prisma schema file,
+// learn more about it in the docs: https://pris.ly/d/prisma-schema
+
+datasource db {
+  provider = "sqlite"
+  url = "***"
+}
+
+generator client {
+  provider = "prisma-client-js"
+}
+
+model Poll {
+  id        String   @id @default(uuid())
+  createdAt DateTime @default(now())
+  prompt    String
+  choices   Choice[]
+  total     Int      @default(0)
+}
+
+model Choice {
+  id     Int    @id @default(autoincrement())
+  text   String
+  count  Int    @default(0)
+  pollId String
+  poll   Poll   @relation(fields: pollId, references: id)
+}
```

