# Migration `20200807233441-add-custom-str`

This migration has been generated by Jeong Yeon Cho at 8/7/2020, 7:34:41 PM.
You can check out the [state of the schema](./schema.prisma) after the migration.

## Database Steps

```sql
PRAGMA foreign_keys=OFF;

ALTER TABLE "Poll" ADD COLUMN "customStr" TEXT ;

PRAGMA foreign_key_check;

PRAGMA foreign_keys=ON;
```

## Changes

```diff
diff --git schema.prisma schema.prisma
migration 20200803002005-create-db..20200807233441-add-custom-str
--- datamodel.dml
+++ datamodel.dml
@@ -2,21 +2,23 @@
 // learn more about it in the docs: https://pris.ly/d/prisma-schema
 datasource db {
   provider = "sqlite"
-  url = "***"
+  url = "***"
 }
 generator client {
-  provider = "prisma-client-js"
+  provider        = "prisma-client-js"
+  previewFeatures = ["transactionApi"]
 }
 model Poll {
   id        String   @id @default(uuid())
   createdAt DateTime @default(now())
   prompt    String
   choices   Choice[]
   total     Int      @default(0)
+  customStr String?
 }
 model Choice {
   id     Int    @id @default(autoincrement())
```


